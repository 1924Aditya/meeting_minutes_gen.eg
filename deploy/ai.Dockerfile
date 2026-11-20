FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends libsndfile1 ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY services/ai/requirements.txt services/ai/requirements.txt
RUN pip install --no-cache-dir -r services/ai/requirements.txt

COPY services/ai services/ai
WORKDIR /app/services/ai

ENV AI_SERVICE_HOST=0.0.0.0
ENV AI_SERVICE_PORT=8766
EXPOSE 8766

CMD ["python", "-u", "main.py"]
