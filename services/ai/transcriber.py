"""
Transcriber: faster-whisper based speech-to-text.
Model: medium (balance of speed/accuracy).
"""

import asyncio
import logging
import os
import numpy as np
from faster_whisper import WhisperModel

log = logging.getLogger(__name__)

WHISPER_MODEL_SIZE = os.environ.get('WHISPER_MODEL', 'base.en')
WHISPER_DEVICE     = os.environ.get('WHISPER_DEVICE', 'cpu')
COMPUTE_TYPE       = 'int8' if WHISPER_DEVICE == 'cpu' else 'float16'


class Transcriber:
    def __init__(self, model_manager, on_progress=None):
        self.model_manager = model_manager
        self.on_progress   = on_progress
        self.model: WhisperModel = None

    async def load(self):
        model_dir = self.model_manager.get_whisper_model_dir()

        loop = asyncio.get_event_loop()
        self.model = await loop.run_in_executor(
            None,
            lambda: WhisperModel(
                WHISPER_MODEL_SIZE,
                device=WHISPER_DEVICE,
                compute_type=COMPUTE_TYPE,
                download_root=model_dir,
                cpu_threads=4
            )
        )
        self.model_manager.mark_model_done('whisper')
        log.info(f"Whisper model '{WHISPER_MODEL_SIZE}' loaded on {WHISPER_DEVICE}")
        
        # Warmup: Run a tiny silent buffer to prime the inference engine
        log.info("Warming up transcriber...")
        warmup_audio = np.zeros(int(16000 * 0.1), dtype=np.float32) # 100ms silence
        self.transcribe(warmup_audio)
        log.info("Transcriber warmed up and ready.")

    def transcribe(self, audio: np.ndarray) -> list[dict]:
        """
        Transcribe a float32 numpy array (16 kHz mono).
        Returns list of {text, start, end} dicts.
        """
        if self.model is None:
            return []

        try:
            segments, info = self.model.transcribe(
                audio,
                language='en',
                beam_size=2,
                vad_filter=True,
                condition_on_previous_text=True
            )
            result = []
            for seg in segments:
                text = seg.text.strip()
                if text:
                    result.append({
                        'text':  text,
                        'start': seg.start,
                        'end':   seg.end
                    })
            return result
        except Exception as e:
            log.error(f"Transcription error: {e}")
            return []
