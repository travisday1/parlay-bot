"""
Empire Scheduler — APScheduler orchestrator that triggers engines on cron schedules.
Phase 1: Only Digital Products and PoD engines are enabled.
"""
import subprocess
import os
import json
import logging
from datetime import datetime
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_EXECUTED

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler('/app/logs/scheduler.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

scheduler = BlockingScheduler(timezone='US/Pacific')


def trigger_claude(task_description: str, engine: str,
                   model: str = 'claude-sonnet-4-6', timeout: int = 600):
    """Execute a task via Claude Code CLI for a specific engine."""
    logger.info(f"[{engine}] Starting task: {task_description[:100]}...")
    start = datetime.now()

    try:
        result = subprocess.run(
            ['claude', '--model', model, '--print', task_description],
            capture_output=True, text=True, timeout=timeout,
            cwd=f'/app/engines/{engine}' if os.path.exists(f'/app/engines/{engine}') else '/app',
            env={**os.environ}
        )

        duration = (datetime.now() - start).total_seconds()
        status = "SUCCESS" if result.returncode == 0 else "FAILED"
        logger.info(f"[{engine}] {status} in {duration:.1f}s")

        # Log result
        log_entry = {
            "engine": engine,
            "task": task_description[:200],
            "model": model,
            "status": status,
            "duration_seconds": duration,
            "timestamp": datetime.now().isoformat(),
            "output_preview": result.stdout[:500] if result.stdout else "",
            "errors": result.stderr[:200] if result.stderr else ""
        }
        log_file = f'/app/logs/{engine}_{datetime.now().strftime("%Y%m%d")}.jsonl'
        with open(log_file, 'a') as f:
            f.write(json.dumps(log_entry) + '\n')

        return result.stdout

    except subprocess.TimeoutExpired:
        logger.error(f"[{engine}] TIMEOUT after {timeout}s")
    except Exception as e:
        logger.error(f"[{engine}] ERROR: {str(e)}")


def job_listener(event):
    """Log job execution results."""
    if event.exception:
        logger.error(f"Job {event.job_id} failed: {event.exception}")
    else:
        logger.info(f"Job {event.job_id} completed successfully")


# ═══════════════════════════════════════
# PHASE 1 JOBS — Digital Products + PoD
# ═══════════════════════════════════════

# Engine 1: Digital Products - Daily research at 6 AM
@scheduler.scheduled_job('cron', id='dp_research', hour=6, minute=0)
def digital_products_research():
    trigger_claude(
        'Read /app/context/digital-products-config.json if it exists. '
        'Use the Perplexity researcher module to find 5 trending digital '
        'product niches on Etsy and Pinterest. '
        'Save results to /app/context/trending-digital-products.json',
        engine='digital-products'
    )


# Engine 1: Digital Products - Generate products at 8 AM
@scheduler.scheduled_job('cron', id='dp_generate', hour=8, minute=0)
def digital_products_generate():
    trigger_claude(
        'Read /app/context/trending-digital-products.json. '
        'Pick the top 3 opportunities. Generate complete product bundles '
        '(PDF + mockup description + Etsy listing copy). '
        'Save to /app/outputs/digital-products/',
        engine='digital-products',
        model='claude-sonnet-4-6'
    )


# Engine 1: Digital Products - Weekly optimization on Monday 10 AM
@scheduler.scheduled_job('cron', id='dp_optimize', day_of_week='mon', hour=10)
def digital_products_optimize():
    trigger_claude(
        'Analyze sales data from /app/context/etsy-analytics.json if available. '
        'Identify underperforming listings. Generate updated titles, tags, and '
        'descriptions for the bottom 20%%. Save to /app/outputs/listing-updates/',
        engine='digital-products',
        model='claude-sonnet-4-6'
    )


# Engine 4: PoD - Daily trend scan at 5 AM
@scheduler.scheduled_job('cron', id='pod_research', hour=5, minute=0)
def pod_trend_research():
    trigger_claude(
        'Scan TikTok, X/Twitter, and Reddit for 5 rising text-based memes '
        'or aesthetic trends from the last 24 hours. Filter anything with '
        'copyright risk > 5. Save to /app/context/trending-pod-designs.json',
        engine='pod'
    )


# Engine 4: PoD - Generate designs at 7 AM
@scheduler.scheduled_job('cron', id='pod_generate', hour=7, minute=0)
def pod_generate_designs():
    trigger_claude(
        'Read /app/context/trending-pod-designs.json. '
        'Create 5 design briefs with typography, color palettes, and '
        'AI image generation prompts for t-shirts and mugs. '
        'Save to /app/outputs/pod/designs/',
        engine='pod'
    )


# Engine 4: PoD - Publish at 9 AM
@scheduler.scheduled_job('cron', id='pod_publish', hour=9, minute=0)
def pod_publish():
    trigger_claude(
        'Check /app/outputs/pod/designs/ for new unpublished designs. '
        'Use the Printify API to create products and publish to Etsy. '
        'Move published designs to /app/outputs/pod/published/',
        engine='pod'
    )


# Engine 4: PoD - Weekly optimization on Wednesday
@scheduler.scheduled_job('cron', id='pod_optimize', day_of_week='wed', hour=12)
def pod_optimize():
    trigger_claude(
        'Pull PoD sales analytics. Retire underperforming designs. '
        'Boost winners with updated tags. Save report to /app/logs/',
        engine='pod'
    )


# ═══════════════════════════════════════
# PHASE 2 JOBS — Uncomment when ready
# ═══════════════════════════════════════
# (E-books + Affiliate — kept commented until Phase 2)

# ═══════════════════════════════════════
# PHASE 3 JOBS — Uncomment when ready
# ═══════════════════════════════════════
# (AI Influencer — kept commented until Phase 3)


if __name__ == '__main__':
    scheduler.add_listener(job_listener, EVENT_JOB_ERROR | EVENT_JOB_EXECUTED)
    logger.info("═══════════════════════════════════════")
    logger.info("  DIGITAL EMPIRE SCHEDULER — ONLINE")
    logger.info(f"  Phase 1 engines active: Digital Products, PoD")
    logger.info(f"  Jobs scheduled: {len(scheduler.get_jobs())}")
    logger.info("═══════════════════════════════════════")
    scheduler.start()
