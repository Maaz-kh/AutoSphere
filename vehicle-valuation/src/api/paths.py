"""Resolved paths for the Vehicle Valuation project (works regardless of CWD)."""
from pathlib import Path

# inference_api.py lives at: <root>/src/api/inference_api.py
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

MODEL_DIR = _PROJECT_ROOT / "src" / "models"
DATA_DIR = _PROJECT_ROOT / "data"
