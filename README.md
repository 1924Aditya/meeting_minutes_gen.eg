# SAMVAAD

SAMVAAD is a local meeting intelligence application that captures microphone or system audio, transcribes speech in real time, identifies speakers, and creates structured Minutes of Meeting summaries.

## Features

- Real-time speech transcription with Faster-Whisper
- Gemini-powered summaries, decisions, action items, deadlines, and key topics
- Interactive speaker names
- Microphone, browser tab, application, and system audio capture
- Markdown and PDF export
- Local SQLite session storage
- React interface and Electron desktop support

## Architecture

```text
Frontend (React + Vite)
        |
        | WebSocket
        v
Backend (Node.js + Fastify)
        |
        | WebSocket
        v
AI Service (Python + Whisper + Gemini)
```

## Project Structure

```text
frontend/       React interface, audio capture, and Electron integration
backend/        Fastify API, WebSocket gateway, SQLite storage, and exports
services/ai/    Whisper transcription and Gemini summarization
scripts/        Cross-platform setup and launch helpers
```

## Quick Start

```powershell
npm run setup
npm start
```

Before starting, add a Gemini API key to `.env`:

```dotenv
GEMINI_API_KEY=your_api_key
```

For prerequisites, platform-specific instructions, configuration, troubleshooting, and testing details, see [LOCAL_RUN_GUIDE.md](LOCAL_RUN_GUIDE.md).
