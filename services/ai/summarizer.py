import os
import json
import asyncio
import logging
from google import genai
from typing import List, Dict

log = logging.getLogger('AI')

# ── Prompts ──────────────────────────────────────────────────────────────────
# This prompt instructions the AI to maintain a professional, consistent JSON structure
# It now includes "Key Topics" to provide better early-meeting value.
REFINE_SYSTEM_PROMPT = """
You are a professional meeting intelligence agent. 
Your task is to analyze a meeting transcript and provide a structured summary.
You must update the current state with any new information found in the latest text.

Output format (strict JSON):
{
  "key_topics": [{"topic": "string", "summary": "brief description"}],
  "decisions": ["string", ...],
  "action_items": [{"task": "string", "assignee": "string or null", "status": "pending|in_progress|done"}, ...],
  "deadlines": [{"task": "string", "date": "string or null", "assignee": "string or null"}, ...]
}

Rules:
1. Be concise but specific.
2. If the new text contradicts a previous decision, update it.
3. Use professional, boardroom-quality language.
4. If the new text has no new information, return the previous summary unchanged.
5. Key Topics should capture the main themes discussed in the latest segment.
"""

class Summarizer:
    def __init__(self):
        self.client = None
        self.previous_summary = None
        self.api_key = os.getenv('GEMINI_KEY') or os.getenv('GEMINI_API_KEY')

    async def load(self):
        if not self.api_key:
            log.warning("No Gemini API key found in environment.")
            return
        
        try:
            # Initialize the new google-genai client
            self.client = genai.Client(api_key=self.api_key)
            log.info("Gemini Pro Summarizer loaded with new SDK.")
        except Exception as e:
            log.error(f"Failed to initialize Gemini client: {e}")

    async def refine(self, transcript_text: str) -> dict | None:
        if not self.client:
            await self.load()
        if not self.client:
            return None

        # Prepare context
        context_msg = ""
        if self.previous_summary:
            context_msg = f"Previous Summary State: {json.dumps(self.previous_summary)}\n\n"
        
        user_prompt = f"{context_msg}New Transcript Segment:\n{transcript_text}\n\nRefine the summary now."

        # Use the cutting-edge models discovered on your API Key
        models_to_try = [
            'gemini-2.0-flash',
            'gemini-2.5-flash',
            'gemini-3-flash-preview'
        ]

        result = None
        last_error = None

        for model_id in models_to_try:
            try:
                # Use the new SDK's call method
                response = self.client.models.generate_content(
                    model=model_id,
                    contents=user_prompt,
                    config={
                        'system_instruction': REFINE_SYSTEM_PROMPT,
                        'temperature': 0.1
                    }
                )
                
                if response and response.text:
                    log.info(f"Summary received from {model_id} ({len(response.text)} chars)")
                    result = self._parse_json(response.text)
                    if result:
                        break
            except Exception as e:
                last_error = e
                err_msg = str(e).lower()
                if "429" in err_msg or "quota" in err_msg:
                    log.warning(f"Model {model_id} quota hit, falling back...")
                    continue
                log.error(f"Error calling {model_id}: {e}")
                if "api_key" in err_msg or "403" in err_msg:
                    break

        if result:
            # Enforce persistence rule: merged results
            if self.previous_summary:
                result['key_topics']   = self._merge_list(self.previous_summary.get('key_topics', []), result.get('key_topics', []))
                result['decisions']    = self._merge_list(self.previous_summary.get('decisions', []), result.get('decisions', []))
                result['action_items'] = self._merge_action_items(self.previous_summary.get('action_items', []), result.get('action_items', []))
                result['deadlines']    = self._merge_deadlines(self.previous_summary.get('deadlines', []), result.get('deadlines', []))
            
            self.previous_summary = result
            return result
        
        log.error(f"All summarization models failed. Last error: {last_error}")
        return self.previous_summary

    def _parse_json(self, text: str) -> dict | None:
        import re
        try:
            # Try direct parse
            return json.loads(text)
        except:
            # Try markdown block
            match = re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL)
            if match:
                try: return json.loads(match.group(1))
                except: pass
            # Try greedy match
            match = re.search(r'(\{.*\})', text, re.DOTALL)
            if match:
                try: return json.loads(match.group(1))
                except: pass
        return None

    def _merge_list(self, old: list, new: list) -> list:
        combined = list(old)
        for item in new:
            if item not in combined:
                combined.append(item)
        return combined

    def _merge_action_items(self, old: list, new: list) -> list:
        merged = { item['task']: item for item in old }
        for item in new:
            merged[item['task']] = item
        return list(merged.values())

    def _merge_deadlines(self, old: list, new: list) -> list:
        merged = { item['task']: item for item in old }
        for item in new:
            merged[item['task']] = item
        return list(merged.values())
