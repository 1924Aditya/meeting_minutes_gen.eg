import asyncio
import json
import os
import sys
from dotenv import load_dotenv

# Add current dir to path to import local modules
sys.path.append(os.path.dirname(__file__))

# Load .env
load_dotenv('../../.env')

from summarizer import Summarizer

async def test_summarization():
    print("[INFO] Initializing Summarizer Test...")
    s = Summarizer()
    await s.load()
    
    sample_text = """
    Spk_0: So maybe just review this kind of like, let's just kind of pick top five, maybe. 
    be something from plan and something from CI CD. I plan editors definitely an option for CICD. 
    Yeah, there might be a Sorry, there might be a value stream and I'll have a story in there too. 
    If we have. If we aggregate it all, it's a bummer that customizable value stream analytics is $12. 12.9. 
    But yeah. That might be. Cool. I'm just going to, I'm going to ping you on this car Mac to add, add a. 
    to a top five plan. Cool. I think. Man, it's a pretty heavy, pretty heavy list. 
    Just looking at it, you know. it's pretty cool. Yeah, that's good. Yeah, this. 
    And this is something we don't do, which I agree. Like we don't. 
    often stop as a company and just kind of... look at our wins. Nope. I was.
    """
    
    print("\n[INPUT] Transcript Paragraph:")
    print("-" * 50)
    print(sample_text.strip())
    print("-" * 50)
    
    print("\n[AI] Calling Gemini for professional summary...")
    try:
        result = await s.refine(sample_text)
        
        if result:
            print("\n[RESULT] AI Summary Output:")
            print("=" * 50)
            print(json.dumps(result, indent=2))
            print("=" * 50)
            
            if result.get('key_topics'):
                print("\n[SUCCESS] Key Topics detected.")
            else:
                print("\n[PARTIAL] Summary returned but Key Topics empty.")
        else:
            print("\n[FAILED] Summarizer returned None (likely Quota issue).")
            
    except Exception as e:
        print(f"\n❌ ERROR during verification: {e}")

if __name__ == "__main__":
    asyncio.run(test_summarization())
