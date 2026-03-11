"""
Shared image generator using Google Gemini 2.5 Flash Image (Nano Banana).
Generates images from text prompts and saves them as PNG files.
"""
import os
import base64
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False
    logger.warning("google-genai not installed. Run: pip install google-genai")


class ImageGenerator:
    """Generate images using Google Imagen 4.0 via the Gemini API."""

    MODEL = "imagen-4.0-generate-001"
    
    def __init__(self, api_key: str = None):
        if not GENAI_AVAILABLE:
            raise ImportError("google-genai package required: pip install google-genai")
        
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY", "")
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY not set")
        
        self.client = genai.Client(api_key=self.api_key)
        logger.info("ImageGenerator initialized with Imagen 4.0")

    def generate(self, prompt: str, output_path: str, 
                 width: int = 1024, height: int = 1024) -> str:
        """
        Generate an image from a text prompt using Imagen 4.0.
        
        Args:
            prompt: Text description of the image to generate
            output_path: Path to save the generated PNG file
            width: Image width (default 1024)
            height: Image height (default 1024)
            
        Returns:
            Path to the saved image file
        """
        logger.info(f"Generating image: {prompt[:80]}...")
        
        # Enhanced prompt for print-ready quality
        enhanced_prompt = (
            f"{prompt} "
            f"High resolution, professional quality, clean edges, suitable for printing."
        )
        
        os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
        
        response = self.client.models.generate_images(
            model=self.MODEL,
            prompt=enhanced_prompt,
            config=types.GenerateImagesConfig(
                number_of_images=1,
            ),
        )
        
        # Save the generated image
        image_saved = False
        for img in response.generated_images:
            img.image.save(output_path)
            file_size = os.path.getsize(output_path)
            logger.info(f"Image saved: {output_path} ({file_size:,} bytes)")
            image_saved = True
            break
        
        if not image_saved:
            raise RuntimeError("Imagen did not return an image")
        
        return output_path

    def generate_pod_design(self, design_brief: dict, output_dir: str) -> dict:
        """
        Generate a PoD-ready design from a design brief.
        
        Args:
            design_brief: Dict with ai_image_prompt, trend, products, etc.
            output_dir: Directory to save the design files
            
        Returns:
            Dict with paths to generated images for each product type
        """
        prompt = design_brief.get("ai_image_prompt", "")
        trend_name = design_brief.get("trend", "design").replace(" ", "_")[:30]
        
        if not prompt:
            raise ValueError("Design brief has no ai_image_prompt")
        
        results = {}
        dimensions = design_brief.get("dimensions", {})
        
        # Generate the main design image (t-shirt front)
        main_path = os.path.join(output_dir, f"{trend_name}_main.png")
        self.generate(prompt, main_path, width=1024, height=1024)
        results["main"] = main_path
        
        logger.info(f"Generated PoD design for '{trend_name}': {main_path}")
        return results


if __name__ == '__main__':
    # Quick test
    gen = ImageGenerator()
    gen.generate(
        "Modern minimalist typography design: 'STAY POSITIVE' in clean sans-serif font, "
        "white text on transparent background, centered, suitable for t-shirt print",
        "/tmp/test_design.png"
    )
    print("Test image generated at /tmp/test_design.png")
