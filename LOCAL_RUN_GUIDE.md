# SAMVAAD — Local Development Guide (Chrome)

Follow these steps to set up and run the SAMVAAD meeting intelligence platform in your browser.

---

## ⚡ Option A: Quick Start (One Command)
If you just want to run everything at once, copy this block and press Enter:

```powershell
npm install; cd backend; npm install; cd ../frontend; npm install; cd ../services/ai; python -m venv venv; .\venv\Scripts\activate; pip install -r requirements.txt; cd ../..; npm run dev:browser
```

---

## 🛠️ Option B: Step-by-Step Setup
If you prefer to run the steps individually to see the progress:

### 1. Root & Dependencies
Run this in the main folder (`nttk2nd`):
```powershell
npm install
```

### 2. Backend Setup
```powershell
cd backend
npm install
cd ..
```

### 3. Frontend Setup
```powershell
cd frontend
npm install
cd ..
```

### 4. AI Service (Python) Setup
```powershell
cd services/ai
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
cd ../..
```

### 5. Final Launch
```powershell
npm run dev:browser
```

---

## 🚀 Daily Launch (After Setup)
Once you have finished the setup above, you only need this command to start the app tomorrow:

```powershell
npm run dev:browser
```

---

## 🌐 Accessing the App
1. Wait for the terminal to show: `[AI INFO] AI Service listening on ws://127.0.0.1:8766`.
2. Open **Chrome** and go to: **http://localhost:5173**
3. Select your audio source and click **Start Session**.

---

## 🔍 Troubleshooting

### Stuck background tasks?
If the app won't start because ports are already in use, run:
```powershell
npm run clean
```

### GPU Speedup
Edit the `.env` file and change `WHISPER_DEVICE=cpu` to `WHISPER_DEVICE=cuda` if you have an NVIDIA GPU.
