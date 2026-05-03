# SAMVAAD — Local Development Guide (Chrome)

Follow these steps to set up and run the SAMVAAD meeting intelligence platform in your browser.

---

## 🔑 Step 0: Configure your API Key
Since `.env` is private and not pushed to GitHub, you must set it up locally:
1. Locate `.env.example` in the root folder.
2. **Copy** it and rename the copy to `.env`.
3. Open `.env` and paste your **GEMINI_API_KEY**.
   > *Without this key, the AI Summarizer will not function!*

---

## 💻 Choose your Operating System:

### 🪟 Windows (PowerShell)
**One-Shot Setup & Launch:**
```powershell
npm install; cd backend; npm install; cd ../frontend; npm install; cd ../services/ai; python -m venv venv; .\venv\Scripts\activate; pip install -r requirements.txt; cd ../..; npm run dev:browser
```

**Daily Launch:**
```powershell
npm run dev:browser
```

---

### 🍎 macOS / Linux (Terminal)
**One-Shot Setup & Launch:**
```bash
# IMPORTANT: Run these from the project ROOT folder
npm install
cd backend && npm install
cd ../frontend && npm install
cd ../services/ai && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
cd ../..
npm run dev:mac
```

**Daily Launch:**
```bash
npm run dev:mac
```

---

## 🌐 Accessing the App
1. Wait for the terminal to show: `[AI INFO] AI Service listening on ws://127.0.0.1:8766`.
2. Open **Chrome** and go to: **http://localhost:5173**
3. Select your audio source and click **Start Session**.

---

## 🔍 Troubleshooting

### "cd: no such file or directory: backend"
Ensure you are in the **root folder** (`meeting_minutes_gen.eg`) and NOT inside the `frontend` or `backend` folders when you run the startup commands.

### "command not found: python3" (macOS)
Ensure Python is installed. You may need to run `brew install python` if it's missing.

### Stuck background tasks?
- **Windows**: `npm run clean`
- **Mac/Linux**: `npm run clean:mac`

### GPU Speedup (Windows Only)
Edit the `.env` file and change `WHISPER_DEVICE=cpu` to `WHISPER_DEVICE=cuda` if you have an NVIDIA GPU.
