"""
Perplexity Researcher — Shared utility module used by all engines for
trend scanning, niche research, competitor analysis, and TOS compliance checks.
"""
import os
import json
import time
import logging
import requests
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions"
PERPLEXITY_API_KEY = os.environ.get("PERPLEXITY_API_KEY", "")
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds, exponential backoff


class PerplexityResearcher:
    """Reusable research module powered by Perplexity Pro API."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or PERPLEXITY_API_KEY
        if not self.api_key or self.api_key.startswith("PLACEHOLDER"):
            logger.warning("Perplexity API key not configured — research calls will fail")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def research(self, query: str, model: str = "sonar-pro", 
                 system_prompt: str = None, max_tokens: int = 4096) -> dict:
        """
        Execute a research query via Perplexity API with retry logic.
        
        Args:
            query: The research question/prompt
            model: Perplexity model (sonar, sonar-pro, sonar-reasoning)
            system_prompt: Optional system instruction
            max_tokens: Max response tokens
            
        Returns:
            dict with 'content', 'citations', 'model', 'timestamp'
        """
        if not system_prompt:
            system_prompt = (
                "You are a market research analyst. Provide data-driven, "
                "actionable insights with specific numbers and sources. "
                "Output structured JSON when requested."
            )

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ],
            "max_tokens": max_tokens,
            "temperature": 0.2,
            "return_citations": True
        }

        for attempt in range(MAX_RETRIES):
            try:
                response = requests.post(
                    PERPLEXITY_API_URL,
                    headers=self.headers,
                    json=payload,
                    timeout=120
                )
                response.raise_for_status()
                data = response.json()

                result = {
                    "content": data["choices"][0]["message"]["content"],
                    "citations": data.get("citations", []),
                    "model": model,
                    "query": query[:200],
                    "timestamp": datetime.now().isoformat()
                }
                logger.info(f"Research query completed: {query[:80]}...")
                return result

            except requests.exceptions.HTTPError as e:
                if e.response.status_code == 429:
                    wait = RETRY_DELAY * (2 ** attempt)
                    logger.warning(f"Rate limited. Waiting {wait}s (attempt {attempt + 1}/{MAX_RETRIES})")
                    time.sleep(wait)
                else:
                    logger.error(f"Perplexity API error: {e}")
                    raise
            except requests.exceptions.Timeout:
                logger.warning(f"Request timeout (attempt {attempt + 1}/{MAX_RETRIES})")
                time.sleep(RETRY_DELAY * (2 ** attempt))
            except Exception as e:
                logger.error(f"Unexpected error: {e}")
                raise

        raise Exception(f"Failed after {MAX_RETRIES} retries")

    def scan_trending_niches(self, platforms: list = None, category: str = "all") -> dict:
        """Scan for trending niches across multiple platforms."""
        if not platforms:
            platforms = ["Etsy", "Pinterest", "TikTok", "Reddit", "Amazon"]

        query = f"""
        Research the top trending micro-niches across {', '.join(platforms)} 
        in the last 48 hours for the category: {category}.
        
        For each niche found, provide:
        1. Niche name and description
        2. Platform where it's trending
        3. Estimated demand level (1-10)
        4. Competition level (1-10)
        5. Monetization potential (digital products, PoD, affiliate, e-books)
        6. Relevant keywords (5-10)
        7. Why it's trending now
        
        Output as a JSON array sorted by opportunity score (demand - competition).
        Focus on niches with demand > 6 and competition < 7.
        """
        return self.research(query)

    def analyze_competitors(self, niche: str, platform: str) -> dict:
        """Analyze top competitors in a specific niche/platform."""
        query = f"""
        Analyze the top 10 sellers/creators in the "{niche}" niche on {platform}.
        
        For each competitor, provide:
        1. Store/account name
        2. Estimated monthly revenue (based on review count, followers, etc.)
        3. Number of products/listings
        4. Price range
        5. Visual style and branding approach
        6. Strengths and weaknesses
        7. Gap opportunities (what they're NOT doing well)
        
        Output as JSON array sorted by estimated revenue.
        """
        return self.research(query)

    def check_platform_tos(self, platforms: list = None) -> dict:
        """Monthly TOS compliance check for all platforms."""
        if not platforms:
            platforms = ["Etsy", "Amazon KDP", "Printify", "Instagram", 
                        "TikTok", "OnlyFans", "Pinterest"]

        query = f"""
        Provide the latest Terms of Service updates and policy changes for:
        {', '.join(platforms)}
        
        Focus specifically on:
        1. AI-generated content policies (disclosure requirements)
        2. Automated posting/listing rules
        3. Affiliate link policies
        4. Copyright and trademark enforcement changes
        5. Account suspension triggers to avoid
        6. Any new features or programs beneficial for sellers/creators
        
        Flag any CRITICAL policy changes that could affect automated operations.
        Output as JSON with platform-level summaries and risk ratings.
        """
        return self.research(query)

    def save_research(self, data: dict, filename: str, 
                      output_dir: str = "/home/deployer/empire/context"):
        """Save research results to the shared context folder."""
        filepath = os.path.join(output_dir, filename)
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        logger.info(f"Research saved to {filepath}")
        return filepath


# Convenience function for quick use across engines
def quick_research(query: str, **kwargs) -> dict:
    """One-liner research function for use in engine scripts."""
    researcher = PerplexityResearcher()
    return researcher.research(query, **kwargs)
