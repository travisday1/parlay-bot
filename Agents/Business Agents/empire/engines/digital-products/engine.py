"""
Engine 1: Digital Product Factory
Generates hyper-niche digital products (printables, planners, templates, wall art)
and lists them on Etsy and Gumroad.
"""
import os
import sys
import json
import logging
from datetime import datetime

# Add shared modules to path (works in Docker /app/ and on VPS)
BASE_DIR = os.environ.get('EMPIRE_BASE', '/app')
sys.path.insert(0, os.path.join(BASE_DIR, 'shared'))
from perplexity_researcher import PerplexityResearcher

LOG_DIR = os.environ.get('LOG_DIR', os.path.join(BASE_DIR, 'logs'))
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [ENGINE-1] %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, 'engine1_digital.log')),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class DigitalProductFactory:
    """Autonomous digital product creation and listing engine."""

    def __init__(self):
        self.researcher = PerplexityResearcher()
        self.output_dir = os.environ.get('OUTPUT_DIR', '/app/outputs')
        self.context_dir = os.environ.get('CONTEXT_DIR', '/app/context')

    def research_niches(self):
        """Phase 1: Scan for trending digital product niches."""
        logger.info("Starting niche research...")

        query = """
        Research the top 10 trending digital product niches on Etsy right now.
        Focus on printables, planners, templates, and wall art.
        
        For each niche, provide as JSON array:
        {
            "niche": "name",
            "category": "planner|template|wall_art|printable|other",
            "demand_score": 1-10,
            "competition_score": 1-10,
            "opportunity_score": calculated,
            "trending_keywords": ["keyword1", "keyword2", ...],
            "price_range": {"min": X, "max": Y},
            "why_trending": "explanation",
            "product_ideas": ["idea1", "idea2", "idea3"]
        }
        
        Sort by opportunity_score (demand - competition) descending.
        Only include niches with demand > 5 and competition < 8.
        """

        result = self.researcher.research(query)
        
        output_path = os.path.join(self.context_dir, 'trending-digital-products.json')
        self.researcher.save_research(result, 'trending-digital-products.json', self.context_dir)
        
        logger.info(f"Research saved to {output_path}")
        return result

    def generate_product_brief(self, niche_data: dict):
        """Phase 2: Create a detailed product brief from niche data."""
        logger.info(f"Generating product brief for: {niche_data.get('niche', 'unknown')}")

        brief = {
            "niche": niche_data.get("niche"),
            "category": niche_data.get("category"),
            "product_type": "digital_download",
            "file_format": "PDF",
            "dimensions": "8.5x11 inches (US Letter)",
            "color_scheme": "to be determined by AI",
            "keywords": niche_data.get("trending_keywords", []),
            "price": niche_data.get("price_range", {}).get("max", 4.99),
            "created_at": datetime.now().isoformat(),
            "status": "brief_ready"
        }

        brief_path = os.path.join(
            self.output_dir,
            f"brief_{niche_data.get('niche', 'unknown').replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.json"
        )
        with open(brief_path, 'w') as f:
            json.dump(brief, f, indent=2)

        logger.info(f"Brief saved to {brief_path}")
        return brief

    def generate_etsy_listing(self, brief: dict):
        """Phase 3: Generate SEO-optimized Etsy listing copy."""
        logger.info("Generating Etsy listing copy...")

        query = f"""
        Create an SEO-optimized Etsy listing for a digital product:
        
        Niche: {brief.get('niche')}
        Category: {brief.get('category')}
        Format: {brief.get('file_format')}
        
        Generate:
        1. Title (max 140 chars, front-load keywords)
        2. Description (2000+ chars, structured with bullet points)
        3. Tags (13 tags, each max 20 chars)
        4. Price recommendation
        5. Suggested categories on Etsy
        
        Output as JSON with keys: title, description, tags, price, categories
        """

        result = self.researcher.research(query, model="sonar-pro")
        
        listing_path = os.path.join(
            self.output_dir,
            f"listing_{brief.get('niche', 'unknown').replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.json"
        )
        with open(listing_path, 'w') as f:
            json.dump({
                "brief": brief,
                "listing": result,
                "status": "listing_ready",
                "created_at": datetime.now().isoformat()
            }, f, indent=2)

        logger.info(f"Listing saved to {listing_path}")
        return result

    def run_full_pipeline(self):
        """Execute the complete digital product pipeline."""
        logger.info("=" * 50)
        logger.info("DIGITAL PRODUCT FACTORY — FULL PIPELINE")
        logger.info("=" * 50)

        # Step 1: Research
        research = self.research_niches()
        logger.info("Step 1/3: Research complete")

        # Step 2: Generate briefs for top 3 niches
        # Parse the research content for niches
        briefs = []
        try:
            content = research.get('content', '')
            # Try to extract JSON from the response
            if '[' in content:
                json_start = content.index('[')
                json_end = content.rindex(']') + 1
                niches = json.loads(content[json_start:json_end])
                for niche in niches[:3]:
                    brief = self.generate_product_brief(niche)
                    briefs.append(brief)
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(f"Could not parse niche JSON: {e}")
            # Create a default brief
            briefs.append(self.generate_product_brief({
                "niche": "trending_printable",
                "category": "printable",
                "trending_keywords": ["printable", "planner", "digital download"],
                "price_range": {"min": 2.99, "max": 7.99}
            }))

        logger.info(f"Step 2/3: Generated {len(briefs)} product briefs")

        # Step 3: Generate listings
        for brief in briefs:
            self.generate_etsy_listing(brief)
        
        logger.info(f"Step 3/3: Generated {len(briefs)} Etsy listings")
        logger.info("PIPELINE COMPLETE")

        return {"briefs": len(briefs), "status": "complete"}


if __name__ == '__main__':
    factory = DigitalProductFactory()
    factory.run_full_pipeline()
