"""
CarDD Training Module

Features:
- Multi-architecture support: YOLOv8 / YOLOv10 / YOLOv11 / RT-DETR
- Damage-specific augmentations and hyperparameters
- Class imbalance weighting
- Progressive resizing training
- Test-Time Augmentation (TTA) evaluation
- Ensemble support with simple NMS fusion
- Benchmarking, evaluation, export utilities
- Robust logging and config saving

Usage examples in the CLI help (see --help).
"""
from __future__ import annotations

import argparse
import json
import logging
import warnings
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import yaml

# Try to import ultralytics YOLO and RTDETR (if RTDETR not available, handle gracefully)
try:
    from ultralytics import YOLO
except Exception as e:
    raise ImportError("ultralytics package required. Install with `pip install ultralytics`.") from e

# RTDETR may not be an exported class — guard with try/except
try:
    # If ultralytics exposes RTDETR class
    from ultralytics import RTDETR  # type: ignore
    _RTDETR_AVAILABLE = True
except Exception:
    RTDETR = None  # type: ignore
    _RTDETR_AVAILABLE = False

# Visualization (optional)
try:
    import matplotlib.pyplot as plt
    import seaborn as sns
    _HAS_PLOTTING = True
except Exception:
    _HAS_PLOTTING = False

warnings.filterwarnings("ignore")

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.FileHandler("cardd_training.log"), logging.StreamHandler()],
)
logger = logging.getLogger("CarDDTrainer")


# -------------------------
# Enums & Config Dataclasses
# -------------------------
class ModelArchitecture(Enum):
    YOLOV8 = "yolov8"
    YOLOV10 = "yolov10"
    YOLOV11 = "yolov11"
    RTDETR = "rtdetr"


class ModelSize(Enum):
    NANO = "n"
    SMALL = "s"
    MEDIUM = "m"
    LARGE = "l"
    XLARGE = "x"


@dataclass
class EnhancedTrainingConfig:
    """Comprehensive training configuration for damage detection."""

    # Model selection
    architecture: str = "yolov10"  # 'yolov8', 'yolov10', 'yolov11', 'rtdetr'
    model_size: str = "m"

    # Training
    epochs: int = 200
    img_size: int = 800
    batch_size: int = -1  # -1 means let underlying API choose or user-specified
    patience: int = 50

    # Optimizer & LR
    optimizer: str = "Adam"
    lr0: float = 0.001
    lrf: float = 0.0001
    momentum: float = 0.937
    weight_decay: float = 0.0005
    warmup_epochs: float = 5.0

    # Augmentations tuned for damage detection
    hsv_h: float = 0.03
    hsv_s: float = 0.9
    hsv_v: float = 0.6
    degrees: float = 15.0
    translate: float = 0.15
    scale: float = 0.8
    shear: float = 2.0
    perspective: float = 0.0003
    flipud: float = 0.0
    fliplr: float = 0.5

    mosaic: float = 1.0
    mixup: float = 0.15
    copy_paste: float = 0.3
    auto_augment: str = "randaugment"
    erasing: float = 0.4
    crop_fraction: float = 1.0

    # Progressive training
    close_mosaic: int = 10
    progressive_resize: bool = True
    resize_schedule: Optional[List[int]] = None  # e.g. [640, 800]

    # Loss weights
    box: float = 10.0
    cls: float = 1.0
    dfl: float = 2.0

    # Validation & TTA
    val: bool = True
    plots: bool = True
    use_tta: bool = True
    save_period: int = 10

    # Misc
    workers: int = 8
    amp: bool = True

    def __post_init__(self):
        if self.resize_schedule is None:
            self.resize_schedule = [640, 800] if self.progressive_resize else [self.img_size]

    def validate(self) -> None:
        assert self.epochs > 0, "epochs must be > 0"
        assert 320 <= self.img_size <= 1536, "img_size must be reasonable (320-1536)"
        assert 0 < self.lr0 <= 1, "lr0 must be between 0 and 1"
        assert self.architecture in ["yolov8", "yolov10", "yolov11", "rtdetr"], "unsupported architecture"
        logger.info("EnhancedTrainingConfig validated")


# -------------------------
# Trainer Implementation
# -------------------------
class EnhancedCarDDTrainer:
    DAMAGE_CATEGORIES = [
        "dent",
        "scratch",
        "crack",
        "glass_shatter",
        "lamp_broken",
        "tire_flat",
    ]

    def __init__(self, dataset_yaml: str, output_dir: str = "./runs", experiment_name: Optional[str] = None):
        self.dataset_yaml = Path(dataset_yaml)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        if experiment_name is None:
            experiment_name = f"cardd_exp_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.experiment_name = experiment_name

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        if self.device == "cuda":
            try:
                logger.info(f"Using GPU: {torch.cuda.get_device_name(0)}")
                logger.info(f"  GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")
            except Exception:
                logger.info("CUDA available")
        else:
            logger.warning("CUDA not available — training on CPU will be slow")

        self._validate_dataset_config()
        self.class_weights = self._compute_class_weights()
        logger.info(f"Trainer initialized: {self.experiment_name}")

    # -------------------------
    # Dataset & Class Weights
    # -------------------------
    def _validate_dataset_config(self) -> None:
        if not self.dataset_yaml.exists():
            raise FileNotFoundError(f"Dataset YAML not found: {self.dataset_yaml}")
        with open(self.dataset_yaml) as f:
            self.dataset_config = yaml.safe_load(f)

        required = ["path", "train", "val", "nc", "names"]
        missing = [r for r in required if r not in self.dataset_config]
        if missing:
            raise ValueError(f"Dataset YAML missing fields: {missing}")

        if int(self.dataset_config.get("nc", 0)) != len(self.DAMAGE_CATEGORIES):
            logger.warning(
                "Dataset 'nc' does not match DAMAGE_CATEGORIES length. "
                "Proceeding but you should verify your dataset YAML."
            )

        logger.info(f"Dataset config loaded: {self.dataset_yaml}")

    def _compute_class_weights(self) -> Dict[str, float]:
        """Compute inverse-frequency class weights from training label files."""
        logger.info("Computing class weights from dataset (if possible)...")
        dataset_path = Path(self.dataset_config["path"])
        train_labels_dir = dataset_path / "train" / "labels"
        if not train_labels_dir.exists():
            logger.warning("Labels directory not found; returning uniform weights")
            return {c: 1.0 for c in self.DAMAGE_CATEGORIES}

        class_counts = Counter()
        total = 0
        for fpath in train_labels_dir.glob("*.txt"):
            try:
                with open(fpath) as f:
                    for line in f:
                        parts = line.strip().split()
                        if not parts:
                            continue
                        cid = int(parts[0])
                        class_counts[cid] += 1
                        total += 1
            except Exception:
                continue

        weights = {}
        num_classes = max(1, len(self.DAMAGE_CATEGORIES))
        for i, cname in enumerate(self.DAMAGE_CATEGORIES):
            cnt = class_counts.get(i, 0)
            if cnt > 0:
                w = total / (num_classes * cnt)
            else:
                w = 1.0
            weights[cname] = float(w)

        logger.info("Class weights computed:")
        for cname, w in weights.items():
            logger.info(f"  {cname:<15s} -> {w:.3f}")
        return weights

    # -------------------------
    # Model Loading Helpers
    # -------------------------
    def _get_model_identifier(self, architecture: str, size: str) -> str:
        """Return a model string used by the ultralytics loader (best-effort)."""
        architecture = architecture.lower()
        size = size.lower()
        if architecture == "rtdetr":
            # common rtdetr naming if available (fallback)
            return f"rtdetr-{size}"
        return f"{architecture}{size}"

    def _load_model(self, architecture: str, size: str):
        """Robust model loader that attempts to instantiate YOLO or RTDETR objects."""
        arch = architecture.lower()
        identifier = self._get_model_identifier(architecture, size)
        logger.info(f"Loading model: {identifier}")

        # Try YOLO first (works for yolov8, newly for yolov10/11 if ultralytics supports)
        try:
            model = YOLO(identifier)
            logger.info(f"YOLO-style model loaded: {identifier}")
            return model
        except Exception as e:
            logger.debug(f"YOLO loader failed for {identifier}: {e}")

        # Try RTDETR if available
        if arch == "rtdetr" and _RTDETR_AVAILABLE:
            try:
                model = RTDETR(identifier)  # type: ignore
                logger.info(f"RTDETR model loaded: {identifier}")
                return model
            except Exception as e:
                logger.debug(f"RTDETR loader failed: {e}")

        # Last-resort: raise
        raise RuntimeError(f"Unable to load model for architecture '{architecture}' and size '{size}'")

    # -------------------------
    # Training arg builder
    # -------------------------
    def _create_train_args(self, cfg: EnhancedTrainingConfig) -> dict:
        args = dict(
            data=str(self.dataset_yaml),
            epochs=cfg.epochs,
            imgsz=cfg.img_size,
            batch=cfg.batch_size,
            device=self.device,
            project=str(self.output_dir),
            name=f"{self.experiment_name}_{cfg.architecture}{cfg.model_size}",
            exist_ok=True,
            patience=cfg.patience,
            save=True,
            save_period=cfg.save_period,
            optimizer=cfg.optimizer,
            lr0=cfg.lr0,
            lrf=cfg.lrf,
            momentum=cfg.momentum,
            weight_decay=cfg.weight_decay,
            warmup_epochs=cfg.warmup_epochs,
            warmup_momentum=0.8,
            warmup_bias_lr=0.1,
            hsv_h=cfg.hsv_h,
            hsv_s=cfg.hsv_s,
            hsv_v=cfg.hsv_v,
            degrees=cfg.degrees,
            translate=cfg.translate,
            scale=cfg.scale,
            shear=cfg.shear,
            perspective=cfg.perspective,
            flipud=cfg.flipud,
            fliplr=cfg.fliplr,
            mosaic=cfg.mosaic,
            mixup=cfg.mixup,
            copy_paste=cfg.copy_paste,
            close_mosaic=cfg.close_mosaic,
            box=cfg.box,
            cls=cfg.cls,
            dfl=cfg.dfl,
            val=cfg.val,
            plots=cfg.plots,
            verbose=True,
            workers=cfg.workers,
            amp=cfg.amp,
        )

        # Optional augmentations
        if cfg.auto_augment:
            args["auto_augment"] = cfg.auto_augment
        if cfg.erasing:
            args["erasing"] = cfg.erasing

        return args

    # -------------------------
    # Training: progressive and standard
    # -------------------------
    def train(self, cfg: Optional[EnhancedTrainingConfig] = None):
        if cfg is None:
            cfg = EnhancedTrainingConfig()
        cfg.validate()

        logger.info("=" * 70)
        logger.info(f"Starting training: {cfg.architecture.upper()}{cfg.model_size.upper()}")
        logger.info(f"Experiment: {self.experiment_name}")
        logger.info(f"Device: {self.device}")
        logger.info(f"Epochs: {cfg.epochs}, img_size: {cfg.img_size}, batch: {cfg.batch_size}")
        logger.info("=" * 70)

        # Save config
        cfg_file = self.output_dir / f"config_{self.experiment_name}.json"
        with open(cfg_file, "w") as f:
            json.dump(asdict(cfg), f, indent=2)
        logger.info(f"Config saved: {cfg_file}")

        model = self._load_model(cfg.architecture, cfg.model_size)
        train_args = self._create_train_args(cfg)

        # Progressive resizing across schedule
        if cfg.progressive_resize and cfg.resize_schedule and len(cfg.resize_schedule) > 1:
            return self._train_progressive(model, cfg, train_args)

        # Single-stage training
        return self._train_stage(model, train_args)

    def _train_stage(self, model, train_args: dict):
        """Train a single stage and return (model, results)."""
        start = datetime.now()
        try:
            results = model.train(**train_args)  # Delegates to ultralytics training
            elapsed = (datetime.now() - start).total_seconds()
            logger.info(f"Training stage done in {elapsed:.2f}s ({elapsed/60:.2f}m)")
            try:
                metrics = self._extract_metrics_from_results(results)
                self._log_metrics(metrics)
            except Exception:
                logger.debug("Could not extract metrics from results object.")
            return model, results
        except KeyboardInterrupt:
            logger.warning("Training interrupted by user.")
            raise
        except Exception as e:
            logger.error(f"Training failed: {e}", exc_info=True)
            raise

    def _train_progressive(self, model, cfg: EnhancedTrainingConfig, base_args: dict):
        """Progressive resizing: multiple stages with increasing img size."""
        logger.info("Starting progressive resizing training...")
        total_stages = len(cfg.resize_schedule)
        epochs_per_stage = max(1, cfg.epochs // total_stages)
        last_results = None
        for i, size in enumerate(cfg.resize_schedule):
            stage_name = f"{base_args['name']}_stage{i+1}"
            stage_args = dict(base_args)
            stage_args["imgsz"] = size
            stage_args["epochs"] = epochs_per_stage
            stage_args["name"] = stage_name
            logger.info(f"\n--- Stage {i+1}/{total_stages}: imgsz={size}, epochs={epochs_per_stage} ---")
            # Resume if previous stage saved weights
            # ultralytics saves weights in project/name/weights/last.pt
            prev_weights_dir = self.output_dir / base_args["name"] / "weights"
            if i > 0:
                expected_last = self.output_dir / f"{base_args['name']}_stage{i}" / "weights" / "last.pt"
                if expected_last.exists():
                    try:
                        model = YOLO(str(expected_last))
                        logger.info(f"Resuming from {expected_last}")
                    except Exception:
                        logger.debug(f"Failed to resume from {expected_last}")
            _, last_results = self._train_stage(model, stage_args)
        return model, last_results

    # -------------------------
    # Metrics extraction & logging
    # -------------------------
    @staticmethod
    def _extract_metrics_from_results(results) -> dict:
        """Attempt to extract common metrics from results object returned by ultralytics."""
        metrics = {}
        try:
            # ultralytics v8+/v9 returns dict-like attributes; try common keys
            if hasattr(results, "results_dict"):
                rd = results.results_dict
                metrics["map50"] = float(rd.get("metrics/mAP50(B)", 0))
                metrics["map50_95"] = float(rd.get("metrics/mAP50-95(B)", 0))
                metrics["precision"] = float(rd.get("metrics/precision(B)", 0))
                metrics["recall"] = float(rd.get("metrics/recall(B)", 0))
            elif hasattr(results, "box"):
                metrics["map50"] = float(getattr(results.box, "map50", 0))
                metrics["map50_95"] = float(getattr(results.box, "map", 0))
                metrics["precision"] = float(getattr(results.box, "mp", 0))
                metrics["recall"] = float(getattr(results.box, "mr", 0))
        except Exception:
            pass
        return metrics

    @staticmethod
    def _log_metrics(metrics: dict):
        logger.info("\n" + "=" * 70)
        logger.info("Training Metrics Summary")
        logger.info("=" * 70)
        logger.info(f"mAP50:      {metrics.get('map50', 0):.4f}")
        logger.info(f"mAP50-95:   {metrics.get('map50_95', 0):.4f}")
        logger.info(f"Precision:  {metrics.get('precision', 0):.4f}")
        logger.info(f"Recall:     {metrics.get('recall', 0):.4f}")
        logger.info("=" * 70)

    # -------------------------
    # Evaluation (including TTA)
    # -------------------------
    def evaluate_with_tta(self, model_path: str, split: str = "test") -> dict:
        """Evaluate with Test-Time Augmentation (TTA)."""
        logger.info(f"Evaluating {model_path} with TTA on split='{split}'")
        if not Path(model_path).exists():
            raise FileNotFoundError(f"Model weights not found: {model_path}")

        # Load model by trying YOLO; RTDETR path detection would require specific handling
        model = None
        try:
            model = YOLO(str(model_path))
        except Exception:
            if _RTDETR_AVAILABLE and "rtdetr" in str(model_path).lower():
                model = RTDETR(str(model_path))  # type: ignore
            else:
                raise RuntimeError("Could not load model for TTA evaluation.")

        # ultralytics val() supports augment=True to enable TTA
        try:
            results = model.val(
                data=str(self.dataset_yaml),
                split=split,
                batch=8,
                imgsz=640,
                device=self.device,
                plots=self._safe_plots_flag(),
                save_json=True,
                conf=0.001,
                iou=0.6,
                max_det=300,
                augment=True,
                verbose=True,
            )
        except TypeError:
            # Some older versions require imgsz -> imgsz
            results = model.val(data=str(self.dataset_yaml), augment=True)

        metrics = self._extract_metrics_from_results(results)
        self._log_metrics(metrics)
        try:
            self._log_per_class_metrics(results)
        except Exception:
            logger.debug("Could not extract per-class metrics from results")
        return metrics

    def _safe_plots_flag(self):
        # If plotting libraries aren't available, disable plots.
        return _HAS_PLOTTING and True

    def _log_per_class_metrics(self, results):
        """Log per-class metrics (precision/recall/mAP) if available."""
        logger.info("\n" + "=" * 70)
        logger.info("Per-class Metrics (if available)")
        logger.info("=" * 70)
        try:
            box = results.box
            # Many ultralytics results have arrays: p (precision), r (recall), ap50, ap
            p = getattr(box, "p", None)
            r = getattr(box, "r", None)
            ap50 = getattr(box, "ap50", None)
            ap = getattr(box, "ap", None)
            n = len(self.DAMAGE_CATEGORIES)
            for i in range(n):
                cname = self.DAMAGE_CATEGORIES[i]
                prec = float(p[i]) if p is not None and i < len(p) else 0.0
                rec = float(r[i]) if r is not None and i < len(r) else 0.0
                m50 = float(ap50[i]) if ap50 is not None and i < len(ap50) else 0.0
                m5095 = float(ap[i]) if ap is not None and i < len(ap) else 0.0
                logger.info(f"{cname:<15s} | Precision: {prec:0.4f} | Recall: {rec:0.4f} | mAP50: {m50:0.4f} | mAP50-95: {m5095:0.4f}")
        except Exception:
            logger.info("Per-class metrics not available from results object.")

    # -------------------------
    # Ensemble support
    # -------------------------
    def create_ensemble(self, model_paths: List[str]):
        """Create a simple ensemble wrapper that runs each model and fuses outputs via NMS."""
        models = []
        for p in model_paths:
            if not Path(p).exists():
                logger.warning(f"Model path does not exist for ensemble: {p}")
                continue
            try:
                models.append(YOLO(str(p)))
                logger.info(f"Loaded ensemble model: {p}")
            except Exception:
                logger.warning(f"Failed to load ensemble model: {p}")

        class Ensemble:
            def __init__(self, models, device):
                self.models = models
                self.device = device

            def predict(self, imgs, conf: float = 0.25, iou: float = 0.45, max_det: int = 300):
                # gather predictions from each model and perform simple NMS fusion
                all_preds = []
                for m in self.models:
                    preds = m.predict(imgs, conf=conf, iou=iou, max_det=max_det)
                    all_preds.append(preds)

                # For simplicity, if only one model return its preds
                if len(all_preds) == 1:
                    return all_preds[0]

                # Otherwise, fuse per-image predictions
                fused_results = []
                for img_idx in range(len(all_preds[0])):
                    # collect all boxes for this image
                    boxes, scores, labels = [], [], []
                    for model_preds in all_preds:
                        try:
                            r = model_preds[img_idx]
                            # r.boxes.xyxy, r.boxes.conf, r.boxes.cls
                            if hasattr(r, "boxes"):
                                bxy = getattr(r.boxes, "xyxy", None)
                                bconf = getattr(r.boxes, "conf", None)
                                bcls = getattr(r.boxes, "cls", None)
                                if bxy is None:
                                    continue
                                for j, box in enumerate(bxy):
                                    boxes.append(box.cpu().numpy())
                                    scores.append(float(bconf[j]) if bconf is not None else 0.0)
                                    labels.append(int(bcls[j]) if bcls is not None else 0)
                        except Exception:
                            continue

                    if not boxes:
                        fused_results.append(None)
                        continue

                    boxes_np = np.array(boxes)
                    scores_np = np.array(scores)
                    labels_np = np.array(labels)

                    # Apply class-wise NMS fusion: keep boxes with highest score per class using torchvision nms
                    try:
                        import torchvision
                        keep_indices = []
                        for cls in np.unique(labels_np):
                            idxs = np.where(labels_np == cls)[0].tolist()
                            cls_boxes = torch.tensor(boxes_np[idxs], dtype=torch.float32)
                            cls_scores = torch.tensor(scores_np[idxs], dtype=torch.float32)
                            if len(cls_boxes) == 0:
                                continue
                            keep = torchvision.ops.nms(cls_boxes, cls_scores, iou)
                            keep_indices.extend([idxs[k] for k in keep.tolist()])
                        # Build a pseudo-result object: keep raw lists
                        fused = {"boxes": boxes_np[keep_indices], "scores": scores_np[keep_indices], "labels": labels_np[keep_indices]}
                        fused_results.append(fused)
                    except Exception:
                        # If torchvision not available, return concatenated results
                        fused_results.append({"boxes": boxes_np, "scores": scores_np, "labels": labels_np})

                return fused_results

        return Ensemble(models, self.device)

    # -------------------------
    # Export utilities
    # -------------------------
    def export_model(self, model_path: str, formats: List[str] = ["onnx"]) -> List[str]:
        logger.info(f"Exporting model {model_path} to formats: {formats}")
        if not Path(model_path).exists():
            raise FileNotFoundError(f"Model path not found: {model_path}")
        model = YOLO(str(model_path))
        exported = []
        for fmt in formats:
            try:
                out = model.export(format=fmt, imgsz=640, simplify=True if fmt == "onnx" else False, dynamic=False, half=True if fmt in ["engine", "onnx"] else False)
                logger.info(f"Exported {fmt}: {out}")
                exported.append(str(out))
            except Exception as e:
                logger.error(f"Export to {fmt} failed: {e}")
        return exported

    # -------------------------
    # Benchmark helpers (simple)
    # -------------------------
    def benchmark_models(self, sizes: List[str], cfg: EnhancedTrainingConfig) -> Dict[str, dict]:
        results = {}
        for s in sizes:
            logger.info(f"Benchmarking {cfg.architecture}{s}")
            local_cfg = EnhancedTrainingConfig(**asdict(cfg))
            local_cfg.model_size = s
            # adjust batch for big models (conservative)
            if s in ["l", "x"]:
                local_cfg.batch_size = max(2, local_cfg.batch_size if local_cfg.batch_size > 0 else 2)
            try:
                model, res = self.train(local_cfg)
                best_weights = self.output_dir / f"{self.experiment_name}_{local_cfg.architecture}{local_cfg.model_size}" / "weights" / "best.pt"
                if best_weights.exists():
                    eval_metrics = self.evaluate_with_tta(str(best_weights), split="test")
                    results[f"{local_cfg.architecture}{s}"] = eval_metrics
            except Exception as e:
                logger.error(f"Benchmark failed for {s}: {e}")
        # Optionally plot (if plotting libs available)
        if _HAS_PLOTTING and results:
            try:
                self._plot_benchmark(results)
            except Exception:
                logger.debug("Plotting benchmark failed.")
        return results

    def _plot_benchmark(self, results: Dict[str, dict]) -> None:
        if not _HAS_PLOTTING:
            return
        models = list(results.keys())
        metric = "map50"
        values = [results[m].get(metric, 0) for m in models]
        plt.figure(figsize=(10, 5))
        sns.barplot(x=models, y=values)
        plt.title("Benchmark - mAP50")
        plt.xticks(rotation=45)
        out = self.output_dir / "benchmark_map50.png"
        plt.tight_layout()
        plt.savefig(out, bbox_inches="tight", dpi=200)
        plt.close()
        logger.info(f"Benchmark plot saved: {out}")


# -------------------------
# CLI
# -------------------------
def build_args():
    p = argparse.ArgumentParser(description="CarDD Enhanced Trainer", formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data", type=str, required=True, help="Path to dataset YAML")
    p.add_argument("--arch", type=str, default="yolov10", choices=["yolov8", "yolov10", "yolov11", "rtdetr"], help="Model architecture")
    p.add_argument("--model", type=str, default="m", choices=["n", "s", "m", "l", "x"], help="Model size")
    p.add_argument("--epochs", type=int, default=200, help="Total epochs")
    p.add_argument("--batch", type=int, default=-1, help="Batch size (-1 for auto)")
    p.add_argument("--imgsz", type=int, default=800, help="Image size")
    p.add_argument("--experiment", type=str, default=None, help="Experiment name")
    p.add_argument("--output", type=str, default="./runs", help="Output directory")
    p.add_argument("--tta", action="store_true", help="Run evaluation with TTA")
    p.add_argument("--evaluate", type=str, default=None, help="Model path to evaluate")
    p.add_argument("--export", type=str, default=None, help="Model path to export")
    p.add_argument("--formats", nargs="+", default=["onnx"], help="Export formats")
    p.add_argument("--benchmark", action="store_true", help="Run benchmark on multiple sizes")
    p.add_argument("--no-progressive", dest="progressive", action="store_false", help="Disable progressive resizing")
    return p


def main():
    args = build_args().parse_args()
    trainer = EnhancedCarDDTrainer(dataset_yaml=args.data, output_dir=args.output, experiment_name=args.experiment)

    base_cfg = EnhancedTrainingConfig(
        architecture=args.arch,
        model_size=args.model,
        epochs=args.epochs,
        img_size=args.imgsz,
        batch_size=args.batch,
        progressive_resize=args.progressive,
    )

    # Modes
    if args.evaluate:
        trainer.evaluate_with_tta(args.evaluate, split="test" if args.tta else "val")
        return 0

    if args.export:
        exported = trainer.export_model(args.export, formats=args.formats)
        logger.info(f"Exported files: {exported}")
        return 0

    if args.benchmark:
        sizes = ["n", "s", "m"]
        trainer.benchmark_models(sizes, base_cfg)
        return 0

    # Train normally
    model, results = trainer.train(cfg=base_cfg)

    # After training, attempt evaluation of best.pt if present
    weights_dir = trainer.output_dir / f"{trainer.experiment_name}_{base_cfg.architecture}{base_cfg.model_size}" / "weights"
    best = weights_dir / "best.pt"
    last = weights_dir / "last.pt"
    to_eval = str(best if best.exists() else (last if last.exists() else None)) if (best.exists() or last.exists()) else None
    if to_eval:
        logger.info(f"Evaluating resulting weights: {to_eval}")
        trainer.evaluate_with_tta(to_eval, split="test" if base_cfg.use_tta else "val")
    else:
        logger.warning("No weights found to evaluate after training.")

    logger.info("All done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
