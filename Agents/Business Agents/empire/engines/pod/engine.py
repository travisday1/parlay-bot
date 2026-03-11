"""
Engine 4: Print on Demand Empire
Generates trend-jacked designs for t-shirts, mugs, and apparel,
then publishes via Printify API to connected storefronts.
"""
import os
import sys
import json
import logging
import requests
from datetime import datetime

BASE_DIR = os.environ.get('EMPIRE_BASE', '/app')
sys.path.insert(0, os.path.join(BASE_DIR, 'shared'))
from perplexity_researcher import PerplexityResearcher

LOG_DIR = os.environ.get('LOG_DIR', os.path.join(BASE_DIR, 'logs'))
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [ENGINE-4] %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, 'engine4_pod.log')),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

PRINTIFY_API_URL = "https://api.printify.com/v1"
PRINTIFY_TOKEN = os.environ.get("PRINTIFY_TOKEN", "")
PRINTIFY_SHOP_ID = os.environ.get("PRINTIFY_SHOP_ID", "")


class PrintOnDemandEngine:
    """Autonomous PoD design creation and Printify publishing engine."""

    def __init__(self):
        self.researcher = PerplexityResearcher()
        self.output_dir = os.environ.get('OUTPUT_DIR', '/app/outputs')
        self.context_dir = os.environ.get('CONTEXT_DIR', '/app/context')
        self.headers = {
            "Authorization": f"Bearer {PRINTIFY_TOKEN}",
            "Content-Type": "application/json"
        }

    def research_trends(self):
        """Scan for trending memes, phrases, and design aesthetics."""
        logger.info("Scanning for PoD design trends...")

        query = """
        Research the top trending design opportunities for print-on-demand 
        (t-shirts, mugs, tote bags) right now.
        
        Scan: TikTok trends, Reddit memes, X/Twitter viral phrases, 
        Pinterest aesthetic boards, Etsy search trends.
        
        For each trend, provide as JSON array:
        {
            "trend": "name/phrase",
            "source_platform": "tiktok|reddit|x|pinterest|etsy",
            "design_type": "text_based|illustration|typography|meme",
            "target_audience": "description",
            "copyright_risk": 1-10 (10 = high risk, avoid),
            "virality_score": 1-10,
            "suggested_products": ["t-shirt", "mug", "tote"],
            "design_direction": "brief creative direction",
            "suggested_text": "exact text for the design if text-based",
            "color_palette": ["#hex1", "#hex2", "#hex3"]
        }
        
        CRITICAL: Filter OUT anything with copyright_risk > 5.
        No copyrighted characters, logos, trademarks, or "inspired by" content.
        Sort by virality_score descending.
        Return top 10 opportunities.
        """

        result = self.researcher.research(query)
        self.researcher.save_research(result, 'trending-pod-designs.json', self.context_dir)
        logger.info("Trend research saved")
        return result

    def generate_design_brief(self, trend_data: dict):
        """Create a detailed design brief from trend data."""
        logger.info(f"Generating design brief: {trend_data.get('trend', 'unknown')}")

        brief = {
            "trend": trend_data.get("trend"),
            "design_type": trend_data.get("design_type"),
            "target_audience": trend_data.get("target_audience"),
            "products": trend_data.get("suggested_products", ["t-shirt"]),
            "design_direction": trend_data.get("design_direction"),
            "text_content": trend_data.get("suggested_text", ""),
            "color_palette": trend_data.get("color_palette", ["#FFFFFF", "#000000"]),
            "dimensions": {
                "t-shirt": "4500x5400px (300 DPI)",
                "mug": "2700x1350px (300 DPI)",
                "tote": "4500x4500px (300 DPI)"
            },
            "ai_image_prompt": self._build_image_prompt(trend_data),
            "status": "brief_ready",
            "created_at": datetime.now().isoformat()
        }

        brief_path = os.path.join(
            self.output_dir,
            'designs',
            f"pod_brief_{trend_data.get('trend', 'unknown').replace(' ', '_')[:30]}_{datetime.now().strftime('%Y%m%d_%H%M')}.json"
        )
        os.makedirs(os.path.dirname(brief_path), exist_ok=True)
        with open(brief_path, 'w') as f:
            json.dump(brief, f, indent=2)

        logger.info(f"Design brief saved: {brief_path}")
        return brief

    def _build_image_prompt(self, trend: dict):
        """Build an AI image generation prompt from trend data."""
        design_type = trend.get("design_type", "typography")
        text = trend.get("suggested_text", "")
        direction = trend.get("design_direction", "")
        colors = trend.get("color_palette", ["#FFFFFF"])

        if design_type == "text_based":
            return (
                f"Clean typography design for t-shirt print. "
                f"Text: \"{text}\". "
                f"Style: {direction}. "
                f"Colors: {', '.join(colors)}. "
                f"Transparent background, high contrast, print-ready. "
                f"No watermarks, no borders, centered composition."
            )
        else:
            return (
                f"Modern {design_type} design for apparel print. "
                f"Theme: {trend.get('trend', '')}. "
                f"Style: {direction}. "
                f"Colors: {', '.join(colors)}. "
                f"Transparent background, vector-clean edges, print-ready. "
                f"No watermarks, no text unless specified."
            )

    # ── Printify API Integration ──

    def list_shops(self):
        """Get all Printify shops."""
        resp = requests.get(f"{PRINTIFY_API_URL}/shops.json", headers=self.headers)
        resp.raise_for_status()
        return resp.json()

    def get_catalog(self, blueprint_id: int = 12):
        """Get print providers for a blueprint (default: Bella+Canvas 3001)."""
        resp = requests.get(
            f"{PRINTIFY_API_URL}/catalog/blueprints/{blueprint_id}/print_providers.json",
            headers=self.headers
        )
        resp.raise_for_status()
        return resp.json()

    def upload_image(self, image_url: str, filename: str):
        """Upload an image to Printify."""
        resp = requests.post(
            f"{PRINTIFY_API_URL}/uploads/images.json",
            headers=self.headers,
            json={
                "file_name": filename,
                "url": image_url
            }
        )
        resp.raise_for_status()
        return resp.json()

    def create_product(self, title: str, description: str, 
                       image_id: str, blueprint_id: int = 12,
                       print_provider_id: int = 29):
        """Create a product on Printify."""
        product_data = {
            "title": title,
            "description": description,
            "blueprint_id": blueprint_id,
            "print_provider_id": print_provider_id,
            "variants": [
                {"id": variant_id, "price": 2499, "is_enabled": True}
                for variant_id in self._get_variant_ids(blueprint_id, print_provider_id)
            ],
            "print_areas": [
                {
                    "variant_ids": self._get_variant_ids(blueprint_id, print_provider_id),
                    "placeholders": [
                        {
                            "position": "front",
                            "images": [
                                {
                                    "id": image_id,
                                    "x": 0.5, "y": 0.5,
                                    "scale": 1,
                                    "angle": 0
                                }
                            ]
                        }
                    ]
                }
            ]
        }

        resp = requests.post(
            f"{PRINTIFY_API_URL}/shops/{PRINTIFY_SHOP_ID}/products.json",
            headers=self.headers,
            json=product_data
        )
        resp.raise_for_status()
        return resp.json()

    def publish_product(self, product_id: str):
        """Publish a product to connected sales channels."""
        resp = requests.post(
            f"{PRINTIFY_API_URL}/shops/{PRINTIFY_SHOP_ID}/products/{product_id}/publish.json",
            headers=self.headers,
            json={
                "title": True,
                "description": True,
                "images": True,
                "variants": True,
                "tags": True,
                "keyFeatures": True,
                "shipping_template": True
            }
        )
        resp.raise_for_status()
        return resp.json()

    def _get_variant_ids(self, blueprint_id: int, print_provider_id: int):
        """Get variant IDs for a blueprint/provider combination."""
        try:
            resp = requests.get(
                f"{PRINTIFY_API_URL}/catalog/blueprints/{blueprint_id}/print_providers/{print_provider_id}/variants.json",
                headers=self.headers
            )
            resp.raise_for_status()
            variants = resp.json()
            return [v["id"] for v in variants[:10]]  # Limit to 10 variants
        except Exception as e:
            logger.warning(f"Could not get variants: {e}")
            return []

    def run_full_pipeline(self):
        """Execute the complete PoD pipeline."""
        logger.info("=" * 50)
        logger.info("PRINT ON DEMAND ENGINE — FULL PIPELINE")
        logger.info("=" * 50)

        # Step 1: Research trends
        research = self.research_trends()
        logger.info("Step 1/3: Trend research complete")

        # Step 2: Generate design briefs
        briefs = []
        try:
            content = research.get('content', '')
            if '[' in content:
                json_start = content.index('[')
                json_end = content.rindex(']') + 1
                trends = json.loads(content[json_start:json_end])
                for trend in trends[:5]:
                    if trend.get('copyright_risk', 10) <= 5:
                        brief = self.generate_design_brief(trend)
                        briefs.append(brief)
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(f"Could not parse trend JSON: {e}")

        logger.info(f"Step 2/3: Generated {len(briefs)} design briefs")

        # Step 3: Log results (actual Printify publishing requires image generation)
        summary = {
            "run_date": datetime.now().isoformat(),
            "trends_found": len(briefs),
            "briefs_generated": len(briefs),
            "status": "briefs_ready_for_design",
            "next_step": "Generate images from AI prompts, then upload to Printify"
        }

        summary_path = os.path.join(self.output_dir, f"pod_run_{datetime.now().strftime('%Y%m%d')}.json")
        with open(summary_path, 'w') as f:
            json.dump(summary, f, indent=2)

        logger.info(f"Step 3/3: Run summary saved to {summary_path}")
        logger.info("PIPELINE COMPLETE")
        return summary


if __name__ == '__main__':
    engine = PrintOnDemandEngine()
    engine.run_full_pipeline()
