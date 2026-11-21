# SAMVAAD Local Setup Guide

This guide explains how to install and run SAMVAAD on Windows, macOS, or Linux.

## Requirements

- Node.js 20 or newer
- npm
- Python 3.10 or newer
- Google Gemini API key
- 8 GB RAM recommended
- Microphone or system-audio permission

For Whisper model downloads, CUDA, or application updates, an internet connection is required.

## 1. Install Dependencies

Open a terminal in the project root and run:

```text
npm run setup
```

This command:

1. Copies `.env.example` to `.env` when `.env` does not exist.
2. Installs all Node.js workspace dependencies.
3. Creates `services/ai/venv`.
4. Installs the Python AI dependencies.

Only run this command again when dependencies or the environment change.

## 2. Configure the API Key

Open `.env` in the project root and set:

```dotenv
GEMINI_API_KEY=your_gemini_api_key
```

Whisper configuration can also be changed in `.env`:

```dotenv
WHISPER_MODEL=base.en
WHISPER_DEVICE=cpu
BACKEND_PORT=3001
AI_SERVICE_PORT=8766
```

Use `WHISPER_DEVICE=cuda` only on a system with a working NVIDIA CUDA installation.

## 3. Start SAMVAAD

Run one command:

```text
npm start
```

The start command automatically selects the browser development workflow for Windows and macOS/Linux.

When startup is complete:

- Open `http://localhost:5173`
- Select a microphone or audio source
- Start a recording session

## Windows Notes

If `python` is not recognized, install Python from python.org or Microsoft Store and enable "Add Python to PATH".

Port cleanup is available separately:

```text
npm run clean
```

## macOS and Linux Notes

If Python 3 is only available as `python3`, the setup command detects it automatically.

For screen or tab audio capture, grant screen-recording and browser-media permissions when prompted.

Port cleanup is available separately:

```text
npm run clean:mac
```

## Runtime Ports

| Service | Address |
|---|---|
| Frontend | `http://localhost:5173` |
| Backend API and WebSocket | `http://localhost:3001` |
| Python AI WebSocket | `127.0.0.1:8766` |

## Data Location

SQLite meeting data is stored outside the source tree:

- Windows: `%APPDATA%\samvaad\samvaad.db`
- macOS/Linux: `$HOME/samvaad/samvaad.db`

Set `DATA_DIR` in `.env` to use a custom location.

## Browser Audio Sources

- Microphone: captures the selected or default microphone.
- Browser tab or screen: captures available display/tab audio.
- Desktop application/window: available in Electron mode.

The browser may require HTTPS or an Electron environment for some system-audio capture features.

## Build and Test

Run tests:

```text
npm test
```

Build the frontend:

```text
npm run build --workspace=frontend
```

Build the complete Electron package:

```text
npm run build:client
```

## Troubleshooting

### `EADDRINUSE`

A previous SAMVAAD process still owns a port. On Windows run `npm run clean`. On macOS/Linux run `npm run clean:mac`, then run `npm start`.

### Backend cannot connect to AI

Confirm the AI service reached:

```text
AI Service listening on ws://127.0.0.1:8766
```

Then restart SAMVAAD.

### Gemini summarization is unavailable

Check that `GEMINI_API_KEY` is present in `.env`. Verify that the key has access to at least one supported Gemini text model and sufficient quota.

### Whisper initialization is slow

The first launch downloads the configured Whisper model. Later launches reuse the cached model.

### Frontend opens but no transcript appears

1. Confirm the browser source is selected.
2. Allow microphone or screen-sharing permissions.
3. Confirm the backend health endpoint: `http://localhost:3001/health`.
4. Confirm Whisper initialization completed without errors.
