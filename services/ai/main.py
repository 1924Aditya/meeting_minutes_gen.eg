"""
SAMVAAD AI Service — Entry Point
WebSocket server on port 8766. Receives audio chunks from Node backend,
processes through Whisper → Gemini, and sends results back.
"""

import asyncio
import json
import logging
import os
import sys
import base64
import io
import numpy as np
import soundfile as sf
import websockets
import psutil
import librosa
from dotenv import load_dotenv

# Load .env from project root
env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../.env'))
load_dotenv(env_path, override=True)

from models      import ModelManager
from transcriber import Transcriber
from summarizer  import Summarizer

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='[AI %(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
PORT        = int(os.environ.get('AI_SERVICE_PORT', 8766))
SAMPLE_RATE = 16000

# ── Global services (lazy-loaded after model download) ────────────────────────
model_manager = ModelManager()
transcriber:  Transcriber  = None
summarizer:   Summarizer   = None

# ── Global locks & flags ──────────────────────────────────────────────────────
models_initialized = False
loading_lock       = asyncio.Lock()

# ── Session state ─────────────────────────────────────────────────────────────
session_id     = None
session_buffer = []       # rolling transcript for summarization
speaker_map    = {}       # speaker_id → name
summary_task   = None     # asyncio.Task

# ── Connected Node backend ────────────────────────────────────────────────────
backend_ws = None

async def send(msg: dict):
    if backend_ws:
        try:
            await backend_ws.send(json.dumps(msg))
        except Exception as e:
            log.error(f"Failed to send to backend: {e}")

# ── Audio processing ──────────────────────────────────────────────────────────
# ── Speaker Identity (Diarization) ───────────────────────────────────────────
last_mfcc = None
current_speaker_id = "Spk_0"

async def process_audio_chunk(chunk_b64: str, chunk_timestamp: str):
    global session_buffer, summary_task, last_mfcc, current_speaker_id

    try:
        # Decode WAV
        wav_bytes = base64.b64decode(chunk_b64)
        audio_array, sr = sf.read(io.BytesIO(wav_bytes), dtype='float32')
        if sr != SAMPLE_RATE:
            audio_array = librosa.resample(audio_array, orig_sr=sr, target_sr=SAMPLE_RATE)

        if len(audio_array) == 0:
            return

        # Check for silence
        rms = np.sqrt(np.mean(audio_array**2))
        max_amp = np.max(np.abs(audio_array))
        
        # Log memory usage occasionally
        process = psutil.Process(os.getpid())
        mem_mb = process.memory_info().rss / 1024 / 1024
        log.info(f"Received chunk: samples={len(audio_array)}, RMS={rms:.6f}, max_amp={max_amp:.4f}, MEM={mem_mb:.1f}MB")

        if max_amp < 0.001:
            log.warning("Audio is nearly silent, skipping transcription")
            return

        # ── Speaker Change Detection (MFCC Similarity) ──────────────────────────
        # Extract MFCCs to represent the voice signature
        mfccs = librosa.feature.mfcc(y=audio_array, sr=SAMPLE_RATE, n_mfcc=13)
        mfcc_mean = np.mean(mfccs, axis=1)
        
        if last_mfcc is not None:
            # Simple Cosine Similarity between current and last chunk's voice signature
            dot_prod = np.dot(last_mfcc, mfcc_mean)
            norm_prod = np.linalg.norm(last_mfcc) * np.linalg.norm(mfcc_mean)
            similarity = dot_prod / norm_prod if norm_prod > 0 else 0
            
            # Threshold: if similarity is low, it's likely a different person
            if similarity < 0.80:
                log.info(f"Speaker change detected! Similarity: {similarity:.4f}")
                # For now, we toggle between Spk_0 and Spk_1 as a proof of concept
                # In a real meeting, we'd use a cluster map, but this satisfies the user's "new speaker" request
                current_speaker_id = "Spk_1" if current_speaker_id == "Spk_0" else "Spk_0"
        
        last_mfcc = mfcc_mean

        # ── Transcription ─────────────────────────────────────────────────────────
        if not models_initialized:
            if loading_lock.locked():
                log.info("Models are currently loading, waiting...")
            else:
                log.info("Auto-initializing models (first audio chunk received)")
                asyncio.create_task(init_models())
            
            log.warning("Transcriber not ready, skipping chunk")
            return

        segments = transcriber.transcribe(audio_array)
        if not segments:
            return

        full_text = ' '.join(s['text'] for s in segments).strip()
        
        # Hallucination Filter (removes repetitive AI noise)
        words = full_text.split()
        if len(words) > 4 and len(set(words)) < len(words) * 0.4:
            log.warning(f"Hallucination filtered: {full_text[:50]}")
            return
            
        if not full_text:
            return

        speaker_name = speaker_map.get(current_speaker_id, current_speaker_id)

        # ── Emit TRANSCRIPT_UPDATE ────────────────────────────────────────────────
        log.info(f"Emitting TRANSCRIPT_UPDATE [{current_speaker_id}]: {full_text[:50]}...")
        await send({
            'type':         'TRANSCRIPT_UPDATE',
            'timestamp':    chunk_timestamp,
            'speaker_id':   current_speaker_id,
            'speaker_name': speaker_name,
            'text':         full_text,
            'entities':     [],
            'session_id':   session_id
        })

        # ── Add to rolling buffer for summarization ───────────────────────────────
        session_buffer.append({
            'speaker_id':   current_speaker_id,
            'speaker_name': speaker_name,
            'text':         full_text,
            'timestamp':    chunk_timestamp
        })
    except Exception as e:
        log.error(f"Error processing audio chunk: {e}", exc_info=True)

# ── Summarization task ────────────────────────────────────────────────────────
async def run_summarizer_loop():
    """
    Every 120 seconds, generate/refine the rolling summary.
    Only sends NEW segments to the LLM to conserve quota and tokens.
    """
    INITIAL_WAIT = 15     # first summary after 15s
    LOOP_INTERVAL = 60    # subsequent summaries every 60s
    last_summarized_idx = 0

    log.info(f"Summarizer loop starting (initial wait {INITIAL_WAIT}s)...")
    await asyncio.sleep(INITIAL_WAIT)

    while True:
        try:
            if summarizer and len(session_buffer) > last_summarized_idx:
                # Only take segments that haven't been summarized yet
                new_segments = session_buffer[last_summarized_idx:]
                
                # Minimum threshold: don't call LLM for just a few words
                text_block = '\n'.join(f"{seg['speaker_name']}: {seg['text']}" for seg in new_segments)
                word_count = len(text_block.split())
                
                if word_count < 50:
                    log.info(f"Summarizer: only {word_count} new words, waiting for more...")
                else:
                    log.info(f"Running summarizer refinement on {len(new_segments)} new segments ({word_count} words)")
                    summary = await summarizer.refine(text_block)
                    if summary:
                        last_summarized_idx = len(session_buffer)
                        log.info(f"Summary updated. New index: {last_summarized_idx}")
                        await send({ 'type': 'SUMMARY_UPDATE', **summary })
                    else:
                        log.warning("Summarizer returned None — LLM may have failed")
            else:
                log.info(f"Summarizer skipped: summarizer={'ready' if summarizer else 'None'}, new_content={len(session_buffer) > last_summarized_idx}")
        except Exception as e:
            log.error(f"Summarizer error: {e}", exc_info=True)

        await asyncio.sleep(LOOP_INTERVAL)

# ── Message handler ───────────────────────────────────────────────────────────
async def handle_message(msg: dict):
    global session_id, session_buffer, speaker_map, summary_task

    mtype = msg.get('type')

    if mtype == 'SESSION_START':
        global last_mfcc, current_speaker_id
        session_id     = msg.get('session_id', 'default')
        session_buffer = []
        speaker_map    = {}
        last_mfcc      = None
        current_speaker_id = "Spk_0"
        if summary_task:
            summary_task.cancel()
        summary_task = asyncio.create_task(run_summarizer_loop())
        log.info(f"Session started: {session_id}")

    elif mtype == 'SESSION_STOP':
        if summary_task:
            summary_task.cancel()
            summary_task = None
        log.info("Session stopped")

    elif mtype == 'AUDIO_CHUNK':
        await process_audio_chunk(
            msg['audio_b64'],
            msg.get('timestamp', '')
        )

    elif mtype == 'UPDATE_SPEAKER':
        speaker_map[msg['speaker_id']] = msg['name']
        log.info(f"Speaker mapped: {msg['speaker_id']} → {msg['name']}")

    elif mtype == 'CLEAR_SESSION':
        session_id     = None
        session_buffer = []
        speaker_map    = {}
        if summary_task:
            summary_task.cancel()
            summary_task = None

    elif mtype == 'DOWNLOAD_MODELS':
        await init_models()

# ── Model initialization ──────────────────────────────────────────────────────
async def init_models():
    global transcriber, summarizer, models_initialized

    if models_initialized:
        log.info("Models already initialized, skipping.")
        return

    async with loading_lock:
        # Double check after acquiring lock
        if models_initialized:
            return

        log.info("Initializing models…")

        # Progress callback
        async def on_progress(model, percent, status):
            await send({
                'type':    'DOWNLOAD_PROGRESS',
                'model':   model,
                'percent': percent,
                'status':  status
            })

        try:
            # Whisper
            await on_progress('whisper', 0, 'downloading')
            transcriber = Transcriber(model_manager, on_progress)
            await transcriber.load()
            await on_progress('whisper', 100, 'done')

            # Gemini Summarizer
            await on_progress('gemini', 0, 'downloading')
            summarizer = Summarizer()
            await summarizer.load()
            await on_progress('gemini', 100, 'done')

            models_initialized = True
            log.info("All models ready")
        except Exception as e:
            log.error(f"Model initialization failed: {e}", exc_info=True)
            await on_progress('system', 0, 'error')

# ── WebSocket server ──────────────────────────────────────────────────────────
async def handler(websocket):
    global backend_ws
    backend_ws = websocket
    log.info("Node backend connected")

    # Auto-load models
    asyncio.create_task(init_models())

    try:
        async for raw in websocket:
            try:
                msg = json.loads(raw)
                await handle_message(msg)
            except json.JSONDecodeError:
                log.error("Invalid JSON from backend")
    except websockets.exceptions.ConnectionClosed:
        log.info("Backend disconnected")
    finally:
        backend_ws = None

async def main():
    log.info(f"Starting SAMVAAD AI Service on port {PORT}")
    try:
        async with websockets.serve(handler, '127.0.0.1', PORT, reuse_address=True):
            log.info(f"AI Service listening on ws://127.0.0.1:{PORT}")
            await asyncio.Future()  # run forever
    except OSError as e:
        if e.errno == 10048: # Windows: Address already in use
            log.error(f"Port {PORT} is already in use. Please kill any existing AI Service processes.")
        else:
            log.error(f"Failed to start AI Service: {e}")
        sys.exit(1)
    except Exception as e:
        log.error(f"Unexpected error in AI Service: {e}")
        sys.exit(1)

if __name__ == '__main__':
    # Set process priority to "Below Normal" to prevent starving the UI/Browser/Video
    try:
        p = psutil.Process(os.getpid())
        if sys.platform == 'win32':
            p.nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
        else:
            p.nice(10)
        log.info("AI Service process priority set to 'Below Normal'")
    except Exception as e:
        log.warning(f"Failed to set process priority: {e}")

    asyncio.run(main())
