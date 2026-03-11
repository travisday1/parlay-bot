"""
API Bridge — Flask REST endpoint for Antigravity → VPS task dispatch.
Accepts tasks from the local machine via SSH tunnel and dispatches them
to the appropriate engine via Claude Code CLI.
"""
from flask import Flask, request, jsonify
import subprocess
import os
import logging
from datetime import datetime

app = Flask(__name__)
API_SECRET = os.environ.get("BRIDGE_SECRET", "change_me_to_random_secret")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler('/home/deployer/empire/logs/api_bridge.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

VALID_ENGINES = [
    'digital-products', 'pod', 'affiliate', 'ebooks', 'influencer', 'scheduler'
]


@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})


@app.route('/trigger', methods=['POST'])
def trigger_task():
    """Dispatch a task to a specific engine via Claude Code CLI."""
    if request.headers.get('X-API-Key') != API_SECRET:
        logger.warning(f"Unauthorized request from {request.remote_addr}")
        return jsonify({"error": "unauthorized"}), 401

    data = request.json
    engine = data.get('engine')
    task = data.get('task')
    model = data.get('model', 'claude-sonnet-4-6')

    if not engine or not task:
        return jsonify({"error": "engine and task are required"}), 400

    if engine not in VALID_ENGINES:
        return jsonify({"error": f"invalid engine. valid: {VALID_ENGINES}"}), 400

    logger.info(f"Triggering engine={engine} model={model} task={task[:100]}...")

    try:
        result = subprocess.run(
            ['claude', '--model', model, '--print', task],
            capture_output=True, text=True, timeout=600,
            cwd=f'/home/deployer/empire/engines/{engine}',
            env={**os.environ, 'ANTHROPIC_API_KEY': os.environ.get('ANTHROPIC_API_KEY', '')}
        )

        logger.info(f"Engine {engine} completed. Exit code: {result.returncode}")

        return jsonify({
            "status": "complete" if result.returncode == 0 else "error",
            "engine": engine,
            "output": result.stdout[-2000:] if result.stdout else "",
            "errors": result.stderr[-500:] if result.stderr else "",
            "exit_code": result.returncode,
            "timestamp": datetime.now().isoformat()
        })

    except subprocess.TimeoutExpired:
        logger.error(f"Engine {engine} timed out after 600s")
        return jsonify({"status": "timeout", "engine": engine}), 504
    except Exception as e:
        logger.error(f"Engine {engine} failed: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/status', methods=['GET'])
def status():
    """Return current status of all engines."""
    return jsonify({
        "engines": VALID_ENGINES,
        "timestamp": datetime.now().isoformat(),
        "uptime": "running"
    })


if __name__ == '__main__':
    logger.info("API Bridge starting on port 5050...")
    app.run(host='127.0.0.1', port=5050)
