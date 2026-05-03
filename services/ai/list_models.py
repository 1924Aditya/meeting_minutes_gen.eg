import os
import sys
from google import genai
from dotenv import load_dotenv

# Load .env
load_dotenv('../../.env')

api_key = os.getenv('GEMINI_KEY') or os.getenv('GEMINI_API_KEY')

def list_models():
    print(f"Checking models for API Key: {api_key[:10]}...")
    client = genai.Client(api_key=api_key)
    try:
        # List all models
        print("\nAvailable Models for this key:")
        print("-" * 50)
        for model in client.models.list():
            # In the new SDK, we check the model name
            print(f"- {model.name}")
        print("-" * 50)
    except Exception as e:
        print(f"\nError listing models: {e}")

if __name__ == "__main__":
    list_models()
