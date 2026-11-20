# 🎙️ SAMVAAD — AI Meeting Intelligence

> **Professional Meeting Transcription, Speaker Identification, and MOM Generation.**

SAMVAAD is a high-performance, full-stack application designed to capture meeting audio, provide real-time transcription, and generate structured "Minutes of Meeting" (MOM) using advanced AI models.

---

## ✨ Features

- **Real-time Transcription**: Powered by `faster-whisper`.
- **Intelligent Summarization**: Refine meeting notes with Gemini 2.0/3.0.
- **Speaker Mapping**: Identify and rename speakers on the fly.
- **Glassmorphism UI**: A premium, modern interface built with React & Vanilla CSS.
- **Multi-Source Audio**: Capture system audio, tab audio, or standard microphone.
- **Export Ready**: Generate professional Markdown and PDF reports.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, Vanilla CSS (Custom Design System).
- **Backend**: Node.js, Fastify, WebSocket, SQLite (better-sqlite3).
- **AI Engine**: Python 3.10, Faster-Whisper, Google GenAI SDK.
- **Orchestration**: Root workspace with `concurrently` for seamless local dev.

---

## 📂 Project Structure

```text
samvaad-mom-generator/
├── frontend/                # React UI + Audio Capture Logic
│   ├── src/components/      # UI components (Glassmorphism design)
│   ├── src/hooks/           # Audio capture & WS streaming
│   └── electron/            # Main/Preload scripts for desktop mode
│
├── backend/                 # Node.js Fastify Server
│   ├── src/db.js            # SQLite session storage
│   ├── src/wsClients.js     # WebSocket broadcast management
│   └── src/exporter.js      # MD/PDF generation logic
│
├── services/
│   └── ai/                  # Python AI Sidecar (Whisper + Gemini)
│       ├── main.py          # AI WebSocket server
│       ├── transcriber.py   # faster-whisper inference
│       └── summarizer.py    # Gemini LLM refinement
│
└── LOCAL_RUN_GUIDE.md       # 📖 Step-by-step launch instructions
```

---

## 🚀 Getting Started

To run this project on your local machine, please follow the **[Local Run Guide](LOCAL_RUN_GUIDE.md)**.

### Quick Launch
If you have already installed the dependencies:
```powershell
npm run dev:browser
```

---

## 📄 License
Internal / Proprietary — SAMVAAD AI Team.
