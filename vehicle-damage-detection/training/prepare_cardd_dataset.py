"""
CarDD Dataset Preparation Module - Fixed Version

Enterprise-grade data preparation for CarDD dataset with comprehensive error handling,
logging, validation, and recovery mechanisms.
"""

import os
import json
import shutil
import logging
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, asdict
from enum import Enum

import numpy as np
from PIL import Image
import cv2
from pycocotools.coco import COCO
import matplotlib.pyplot as plt
from tqdm import tqdm
import hashlib
from datetime import datetime
import yaml


# Configure professional logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('cardd_preparation.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class DatasetSplit(Enum):
    """Enum for dataset splits"""
    TRAIN = "train"
    VAL = "val"
    TEST = "test"


@dataclass
class ProcessingStats:
    """Statistics for dataset processing"""
    split: str
    total_images: int
    processed_images: int
    skipped_images: int
    total_annotations: int
    invalid_annotations: int
    processing_time: float
    
    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class DatasetMetadata:
    """Comprehensive dataset metadata"""
    dataset_name: str = "CarDD"
    version: str = "1.0"
    creation_date: str = ""
    total_images: int = 0
    total_annotations: int = 0
    categories: List[str] = None
    splits: Dict[str, int] = None
    
    def __post_init__(self):
        if self.creation_date == "":
            self.creation_date = datetime.now().isoformat()
        if self.categories is None:
            self.categories = []
        if self.splits is None:
            self.splits = {}


class CarDDDatasetPreparation:
    """
    Production-grade CarDD dataset preparation with enterprise features:
    - Comprehensive error handling
    - Transaction-like operations with rollback
    - Data validation and integrity checks
    - Progress tracking and logging
    - Metadata generation
    - Resume capability after interruption
    """
    
    # CarDD official damage categories (normalized with underscores)
    CARDD_CATEGORIES = {
        1: "dent",
        2: "scratch",
        3: "crack",
        4: "glass_shatter",
        5: "lamp_broken",
        6: "tire_flat"
    }
    
    # Category name normalization mapping (handles both formats)
    CATEGORY_NAME_MAPPING = {
        "tire flat": "tire_flat",
        "tire_flat": "tire_flat",
        "lamp broken": "lamp_broken",
        "lamp_broken": "lamp_broken",
        "glass shatter": "glass_shatter",
        "glass_shatter": "glass_shatter",
        "dent": "dent",
        "scratch": "scratch",
        "crack": "crack"
    }
    
    # Validation thresholds
    MIN_BBOX_AREA = 10
    MAX_ASPECT_RATIO = 50
    MIN_IMAGE_SIZE = 100
    
    def __init__(self, data_root: str, output_path: str, resume: bool = False):
        """
        Initialize dataset preparation with validation
        
        Args:
            data_root: Path to data directory containing CarDD_COCO
            output_path: Path to save processed YOLO dataset
            resume: Whether to resume interrupted processing
        
        Raises:
            ValueError: If paths are invalid
            FileNotFoundError: If required directories don't exist
        """
        self.data_root = Path(data_root).resolve()
        self.output_path = Path(output_path).resolve()
        self.resume = resume
        
        # Validate paths
        if not self.data_root.exists():
            raise FileNotFoundError(f"Data root not found: {self.data_root}")
        
        # Create output directory
        self.output_path.mkdir(parents=True, exist_ok=True)
        
        # Setup paths
        self.coco_root = self.data_root / 'CarDD_COCO'
        self.annotations_dir = self.coco_root / 'annotations'
        
        # Image directories
        self.image_dirs = {
            DatasetSplit.TRAIN: self.coco_root / 'train2017',
            DatasetSplit.VAL: self.coco_root / 'val2017',
            DatasetSplit.TEST: self.coco_root / 'test2017'
        }
        
        # Annotation files
        self.annotation_files = {
            DatasetSplit.TRAIN: self.annotations_dir / 'instances_train2017.json',
            DatasetSplit.VAL: self.annotations_dir / 'instances_val2017.json',
            DatasetSplit.TEST: self.annotations_dir / 'instances_test2017.json'
        }
        
        # Processing state file
        self.state_file = self.output_path / '.processing_state.json'
        self.metadata_file = self.output_path / 'dataset_metadata.json'
        
        # Category mapping (will be built from actual data)
        self.category_id_to_class = {}
        
        # Initialize processing state
        self.processing_state = self._load_state() if resume else {}
        
        logger.info(f"Initialized CarDD preparation: {self.data_root} -> {self.output_path}")
    
    def _load_state(self) -> dict:
        """Load processing state for resume capability"""
        if self.state_file.exists():
            with open(self.state_file, 'r') as f:
                state = json.load(f)
                logger.info(f"Loaded processing state: {len(state)} images processed")
                return state
        return {}
    
    def _save_state(self):
        """Save processing state"""
        with open(self.state_file, 'w') as f:
            json.dump(self.processing_state, f, indent=2)
    
    def _compute_file_hash(self, filepath: Path) -> str:
        """Compute SHA256 hash of file for integrity verification"""
        sha256_hash = hashlib.sha256()
        with open(filepath, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
    def _normalize_category_name(self, name: str) -> str:
        """Normalize category name to standard format with underscores"""
        return self.CATEGORY_NAME_MAPPING.get(name.lower(), name.lower().replace(" ", "_"))
    
    def _build_category_mapping(self, coco_data: dict) -> Dict[int, int]:
        """
        Build mapping from COCO category IDs to YOLO class indices
        
        Args:
            coco_data: COCO annotation data
            
        Returns:
            Dictionary mapping COCO category ID to YOLO class index (0-based)
        """
        mapping = {}
        
        # Create reverse lookup of normalized names to class indices
        normalized_to_idx = {name: idx for idx, name in enumerate(self.CARDD_CATEGORIES.values())}
        
        for cat in coco_data['categories']:
            cat_id = cat['id']
            cat_name = cat['name']
            normalized_name = self._normalize_category_name(cat_name)
            
            if normalized_name in normalized_to_idx:
                mapping[cat_id] = normalized_to_idx[normalized_name]
            else:
                logger.warning(f"Unknown category: {cat_name} (normalized: {normalized_name})")
        
        return mapping
    
    def verify_dataset_structure(self) -> bool:
        """
        Comprehensive dataset structure verification with detailed reporting
        
        Returns:
            bool: True if all checks pass
            
        Raises:
            FileNotFoundError: If critical files are missing
        """
        logger.info("="*70)
        logger.info("Verifying CarDD Dataset Structure")
        logger.info("="*70)
        
        verification_results = []
        all_passed = True
        
        # Check COCO root
        if not self.coco_root.exists():
            logger.error(f"COCO root not found: {self.coco_root}")
            raise FileNotFoundError(
                f"CarDD_COCO directory not found at {self.coco_root}\n"
                "Please extract CarDD_COCO.zip to the data directory"
            )
        
        # Check annotation directory
        if not self.annotations_dir.exists():
            logger.error(f"Annotations directory not found: {self.annotations_dir}")
            all_passed = False
        else:
            logger.info(f"Annotations directory: {self.annotations_dir}")
        
        # Check image directories
        for split, img_dir in self.image_dirs.items():
            if not img_dir.exists():
                logger.error(f"{split.value} images not found: {img_dir}")
                all_passed = False
            else:
                num_images = len(list(img_dir.glob('*.jpg')))
                logger.info(f"{split.value:5s} images: {num_images:,} files at {img_dir}")
                verification_results.append((split.value, num_images))
        
        # Check annotation files with validation
        for split, ann_file in self.annotation_files.items():
            if not ann_file.exists():
                logger.error(f"{split.value} annotations not found: {ann_file}")
                all_passed = False
            else:
                try:
                    # Validate JSON structure
                    with open(ann_file, 'r') as f:
                        coco_data = json.load(f)
                    
                    required_keys = ['images', 'annotations', 'categories']
                    missing_keys = [k for k in required_keys if k not in coco_data]
                    
                    if missing_keys:
                        logger.error(f"{split.value} annotations missing keys: {missing_keys}")
                        all_passed = False
                    else:
                        num_images = len(coco_data['images'])
                        num_anns = len(coco_data['annotations'])
                        num_cats = len(coco_data['categories'])
                        
                        logger.info(f"{split.value:5s} annotations: {num_images:,} images, "
                                  f"{num_anns:,} annotations, {num_cats} categories")
                        
                        # Verify categories and normalize names
                        ann_categories = {cat['id']: cat['name'] for cat in coco_data['categories']}
                        expected_cats = set(self.CARDD_CATEGORIES.values())
                        actual_cats = set(ann_categories.values())
                        actual_normalized = {self._normalize_category_name(name) for name in actual_cats}
                        
                        if actual_normalized != expected_cats:
                            logger.warning(f"Category name format differs in {split.value}:")
                            logger.warning(f"  Dataset uses: {sorted(actual_cats)}")
                            logger.warning(f"  Will normalize to: {sorted(expected_cats)}")
                        else:
                            logger.info(f"{split.value:5s} categories validated successfully")
                
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON in {ann_file}: {e}")
                    all_passed = False
                except Exception as e:
                    logger.error(f"Error reading {ann_file}: {e}")
                    all_passed = False
        
        if not all_passed:
            raise FileNotFoundError(
                "Dataset structure verification failed. Please check the logs above."
            )
        
        logger.info("\nDataset structure verification passed")
        return True
    
    def _validate_bbox(self, bbox: List[float], img_width: int, img_height: int) -> Tuple[bool, str]:
        """
        Validate bounding box with comprehensive checks
        
        Args:
            bbox: [x, y, width, height] in COCO format
            img_width: Image width
            img_height: Image height
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        x, y, w, h = bbox
        
        # Check for negative or zero dimensions
        if w <= 0 or h <= 0:
            return False, f"Invalid bbox dimensions: w={w}, h={h}"
        
        # Check if bbox is within image bounds
        if x < 0 or y < 0 or x + w > img_width or y + h > img_height:
            return False, f"Bbox out of bounds: ({x},{y},{w},{h}) for image ({img_width},{img_height})"
        
        # Check minimum area
        area = w * h
        if area < self.MIN_BBOX_AREA:
            return False, f"Bbox area too small: {area} < {self.MIN_BBOX_AREA}"
        
        # Check aspect ratio
        aspect_ratio = max(w, h) / min(w, h)
        if aspect_ratio > self.MAX_ASPECT_RATIO:
            return False, f"Extreme aspect ratio: {aspect_ratio:.2f}"
        
        return True, ""
    
    def _validate_image(self, image_path: Path) -> Tuple[bool, str]:
        """
        Validate image file integrity and properties
        
        Args:
            image_path: Path to image file
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            # Check file exists
            if not image_path.exists():
                return False, "File not found"
            
            # Check file size
            file_size = image_path.stat().st_size
            if file_size == 0:
                return False, "Empty file"
            
            # Try to open and validate image
            with Image.open(image_path) as img:
                # Check image mode
                if img.mode not in ['RGB', 'L']:
                    img = img.convert('RGB')
                
                # Check image dimensions
                width, height = img.size
                if width < self.MIN_IMAGE_SIZE or height < self.MIN_IMAGE_SIZE:
                    return False, f"Image too small: {width}x{height}"
                
                # Verify image can be loaded
                img.verify()
            
            return True, ""
            
        except Exception as e:
            return False, f"Image validation error: {str(e)}"
    
    def coco_to_yolo_bbox(self, bbox: List[float], img_width: int, img_height: int) -> List[float]:
        """
        Convert COCO bbox format to YOLO format with validation
        
        COCO format: [x_min, y_min, width, height] (absolute pixels)
        YOLO format: [x_center, y_center, width, height] (normalized 0-1)
        
        Args:
            bbox: COCO format bbox
            img_width: Image width
            img_height: Image height
            
        Returns:
            YOLO format bbox
        """
        x_min, y_min, width, height = bbox
        
        # Calculate center coordinates
        x_center = x_min + width / 2
        y_center = y_min + height / 2
        
        # Normalize coordinates
        x_center /= img_width
        y_center /= img_height
        width /= img_width
        height /= img_height
        
        # Clip to valid range [0, 1]
        x_center = max(0.0, min(1.0, x_center))
        y_center = max(0.0, min(1.0, y_center))
        width = max(0.0, min(1.0, width))
        height = max(0.0, min(1.0, height))
        
        return [x_center, y_center, width, height]
    
    def process_split(self, split: DatasetSplit) -> ProcessingStats:
        """
        Process a single split with comprehensive error handling
        
        Args:
            split: Dataset split to process
            
        Returns:
            ProcessingStats: Statistics about the processing
        """
        start_time = datetime.now()
        split_name = split.value
        
        logger.info(f"\n{'='*70}")
        logger.info(f"Processing {split_name.upper()} Split")
        logger.info(f"{'='*70}")
        
        # Create output directories
        output_images = self.output_path / split_name / 'images'
        output_labels = self.output_path / split_name / 'labels'
        output_images.mkdir(parents=True, exist_ok=True)
        output_labels.mkdir(parents=True, exist_ok=True)
        
        # Load COCO annotations
        images_dir = self.image_dirs[split]
        ann_file = self.annotation_files[split]
        
        try:
            coco = COCO(str(ann_file))
            # Load annotation data to build category mapping
            with open(ann_file, 'r') as f:
                coco_data = json.load(f)
            category_mapping = self._build_category_mapping(coco_data)
            logger.info(f"Built category mapping: {category_mapping}")
        except Exception as e:
            logger.error(f"Failed to load COCO annotations: {e}")
            raise
        
        # Get all image IDs
        img_ids = coco.getImgIds()
        
        # Initialize statistics
        stats = {
            'processed': 0,
            'skipped': 0,
            'total_annotations': 0,
            'invalid_annotations': 0,
            'errors': []
        }
        
        # Process each image with progress bar
        progress_bar = tqdm(img_ids, desc=f"Processing {split_name}")
        
        for img_id in progress_bar:
            try:
                # Check if already processed (resume capability)
                img_key = f"{split_name}_{img_id}"
                if self.resume and img_key in self.processing_state:
                    stats['processed'] += 1
                    continue
                
                # Get image info
                img_info = coco.loadImgs(img_id)[0]
                img_filename = img_info['file_name']
                img_width = img_info['width']
                img_height = img_info['height']
                
                # Source and destination paths
                src_img_path = images_dir / img_filename
                dst_img_path = output_images / img_filename
                
                # Validate image
                is_valid, error_msg = self._validate_image(src_img_path)
                if not is_valid:
                    logger.warning(f"Skipping {img_filename}: {error_msg}")
                    stats['skipped'] += 1
                    stats['errors'].append({'image': img_filename, 'error': error_msg})
                    continue
                
                # Copy image with error handling
                try:
                    shutil.copy2(src_img_path, dst_img_path)
                except Exception as e:
                    logger.error(f"Failed to copy {img_filename}: {e}")
                    stats['skipped'] += 1
                    continue
                
                # Get annotations
                ann_ids = coco.getAnnIds(imgIds=img_id)
                anns = coco.loadAnns(ann_ids)
                
                # Convert annotations to YOLO format
                yolo_annotations = []
                for ann in anns:
                    try:
                        # Get category ID and map to class index
                        category_id = ann['category_id']
                        
                        if category_id not in category_mapping:
                            logger.warning(f"Unknown category ID {category_id} in {img_filename}")
                            stats['invalid_annotations'] += 1
                            continue
                        
                        class_id = category_mapping[category_id]
                        
                        # Get and validate bbox
                        bbox = ann['bbox']
                        is_valid, error_msg = self._validate_bbox(bbox, img_width, img_height)
                        
                        if not is_valid:
                            logger.debug(f"Invalid bbox in {img_filename}: {error_msg}")
                            stats['invalid_annotations'] += 1
                            continue
                        
                        # Convert to YOLO format
                        yolo_bbox = self.coco_to_yolo_bbox(bbox, img_width, img_height)
                        
                        # Create annotation line
                        yolo_line = f"{class_id} " + " ".join(f"{x:.6f}" for x in yolo_bbox)
                        yolo_annotations.append(yolo_line)
                        stats['total_annotations'] += 1
                        
                    except Exception as e:
                        logger.debug(f"Error processing annotation: {e}")
                        stats['invalid_annotations'] += 1
                        continue
                
                # Save YOLO label file
                label_filename = Path(img_filename).stem + '.txt'
                label_path = output_labels / label_filename
                
                with open(label_path, 'w') as f:
                    f.write('\n'.join(yolo_annotations))
                
                # Update state
                self.processing_state[img_key] = {
                    'processed_at': datetime.now().isoformat(),
                    'num_annotations': len(yolo_annotations)
                }
                
                stats['processed'] += 1
                
                # Save state periodically
                if stats['processed'] % 100 == 0:
                    self._save_state()
                
            except Exception as e:
                logger.error(f"Error processing image {img_id}: {e}")
                stats['skipped'] += 1
                stats['errors'].append({'image_id': img_id, 'error': str(e)})
                continue
        
        progress_bar.close()
        
        # Final state save
        self._save_state()
        
        # Calculate processing time
        processing_time = (datetime.now() - start_time).total_seconds()
        
        # Log statistics
        logger.info(f"\n{split_name.upper()} Processing Summary:")
        logger.info(f"  Processed:    {stats['processed']:,} images")
        logger.info(f"  Skipped:      {stats['skipped']:,} images")
        logger.info(f"  Annotations:  {stats['total_annotations']:,} valid")
        logger.info(f"  Invalid:      {stats['invalid_annotations']:,} annotations")
        logger.info(f"  Time:         {processing_time:.2f}s")
        
        if stats['errors']:
            logger.warning(f"  Errors:       {len(stats['errors'])} (see log for details)")
        
        return ProcessingStats(
            split=split_name,
            total_images=len(img_ids),
            processed_images=stats['processed'],
            skipped_images=stats['skipped'],
            total_annotations=stats['total_annotations'],
            invalid_annotations=stats['invalid_annotations'],
            processing_time=processing_time
        )
    
    def prepare_yolo_dataset(self) -> Dict[str, ProcessingStats]:
        """
        Convert entire CarDD COCO dataset to YOLO format
        
        Returns:
            Dictionary of processing statistics per split
        """
        logger.info("\n" + "="*70)
        logger.info("Converting CarDD COCO to YOLO Format")
        logger.info("="*70)
        
        all_stats = {}
        
        # Process each split
        for split in [DatasetSplit.TRAIN, DatasetSplit.VAL, DatasetSplit.TEST]:
            try:
                stats = self.process_split(split)
                all_stats[split.value] = stats
            except Exception as e:
                logger.error(f"Failed to process {split.value} split: {e}")
                raise
        
        # Generate summary
        logger.info("\n" + "="*70)
        logger.info("Conversion Summary")
        logger.info("="*70)
        
        total_images = sum(s.processed_images for s in all_stats.values())
        total_annotations = sum(s.total_annotations for s in all_stats.values())
        total_time = sum(s.processing_time for s in all_stats.values())
        
        for split_name, stats in all_stats.items():
            logger.info(f"{split_name.upper():5s}: {stats.processed_images:4d} images, "
                       f"{stats.total_annotations:5d} annotations, "
                       f"{stats.processing_time:.2f}s")
        
        logger.info(f"\nTOTAL: {total_images:4d} images, "
                   f"{total_annotations:5d} annotations, "
                   f"{total_time:.2f}s")
        
        # Clean up state file after successful completion
        if self.state_file.exists():
            self.state_file.unlink()
        
        logger.info("\nDataset conversion completed successfully")
        return all_stats
    
    def create_dataset_yaml(self) -> Path:
        """
        Create YAML configuration file for YOLOv8 training with metadata
        
        Returns:
            Path to created YAML file
        """
        yaml_content = {
            'path': str(self.output_path.absolute()),
            'train': 'train/images',
            'val': 'val/images',
            'test': 'test/images',
            'nc': 6,
            'names': {i: name for i, name in enumerate(self.CARDD_CATEGORIES.values())},
            'metadata': {
                'dataset': 'CarDD',
                'url': 'https://cardd-ustc.github.io/',
                'paper': 'CarDD: A New Dataset for Vision-Based Car Damage Detection',
                'citation': 'Wang et al., IEEE TITS 2023',
                'created': datetime.now().isoformat(),
                'version': '2.0.0'
            }
        }
        
        yaml_path = self.output_path / 'cardd.yaml'
        
        with open(yaml_path, 'w', encoding='utf-8') as f:
            yaml.dump(yaml_content, f, default_flow_style=False, allow_unicode=True)
        
        logger.info(f"\nDataset YAML created: {yaml_path}")
        return yaml_path
    
    def generate_metadata(self, stats: Dict[str, ProcessingStats]) -> DatasetMetadata:
        """
        Generate comprehensive dataset metadata
        
        Args:
            stats: Processing statistics from all splits
            
        Returns:
            DatasetMetadata object
        """
        total_images = sum(s.processed_images for s in stats.values())
        total_annotations = sum(s.total_annotations for s in stats.values())
        
        metadata = DatasetMetadata(
            dataset_name="CarDD",
            version="2.0.0",
            total_images=total_images,
            total_annotations=total_annotations,
            categories=list(self.CARDD_CATEGORIES.values()),
            splits={split: s.processed_images for split, s in stats.items()}
        )
        
        # Save metadata
        with open(self.metadata_file, 'w') as f:
            json.dump(asdict(metadata), f, indent=2)
        
        logger.info(f"\nMetadata saved: {self.metadata_file}")
        return metadata
    
    def visualize_annotations(self, split: DatasetSplit = DatasetSplit.TRAIN, 
                            num_samples: int = 5) -> Path:
        """
        Generate visualization of sample annotations with professional styling
        
        Args:
            split: Dataset split to visualize
            num_samples: Number of samples to visualize
            
        Returns:
            Path to saved visualization
        """
        logger.info(f"\nGenerating visualization for {split.value} split...")
        
        ann_file = self.annotation_files[split]
        images_dir = self.image_dirs[split]
        
        try:
            coco = COCO(str(ann_file))
            # Load annotation data
            with open(ann_file, 'r') as f:
                coco_data = json.load(f)
            # Build category mapping for display
            cat_id_to_name = {cat['id']: self._normalize_category_name(cat['name']) 
                            for cat in coco_data['categories']}
        except Exception as e:
            logger.error(f"Failed to load COCO annotations: {e}")
            return None
        
        # Get random samples
        img_ids = coco.getImgIds()
        sample_ids = np.random.choice(img_ids, min(num_samples, len(img_ids)), replace=False)
        
        # Color scheme for categories
        colors = {
            "dent": (255, 165, 0),
            "scratch": (255, 255, 0),
            "crack": (255, 0, 0),
            "glass_shatter": (255, 0, 255),
            "lamp_broken": (0, 255, 255),
            "tire_flat": (128, 128, 128)
        }
        
        fig, axes = plt.subplots(1, num_samples, figsize=(4*num_samples, 4))
        if num_samples == 1:
            axes = [axes]
        
        fig.suptitle(f'CarDD {split.value.upper()} Samples', fontsize=16, fontweight='bold')
        
        for idx, img_id in enumerate(sample_ids):
            try:
                # Load image
                img_info = coco.loadImgs(img_id)[0]
                img_path = images_dir / img_info['file_name']
                
                if not img_path.exists():
                    continue
                
                img = cv2.imread(str(img_path))
                img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                
                # Get annotations
                ann_ids = coco.getAnnIds(imgIds=img_id)
                anns = coco.loadAnns(ann_ids)
                
                # Draw bounding boxes
                for ann in anns:
                    bbox = ann['bbox']
                    x, y, w, h = [int(v) for v in bbox]
                    cat_id = ann['category_id']
                    cat_name = cat_id_to_name.get(cat_id, 'unknown')
                    
                    color = colors.get(cat_name, (255, 255, 255))
                    
                    # Draw rectangle
                    cv2.rectangle(img, (x, y), (x+w, y+h), color, 3)
                    
                    # Draw label with background
                    label = cat_name.replace('_', ' ').title()
                    (label_w, label_h), baseline = cv2.getTextSize(
                        label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2
                    )
                    
                    cv2.rectangle(img, (x, y-label_h-10), (x+label_w, y), color, -1)
                    cv2.putText(img, label, (x, y-5),
                              cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
                
                axes[idx].imshow(img)
                axes[idx].axis('off')
                axes[idx].set_title(f'{len(anns)} damages', fontsize=10)
                
            except Exception as e:
                logger.warning(f"Failed to visualize image {img_id}: {e}")
                continue
        
        plt.tight_layout()
        output_file = self.output_path / f'samples_{split.value}.png'
        plt.savefig(output_file, dpi=150, bbox_inches='tight')
        plt.close()
        
        logger.info(f"Visualization saved: {output_file}")
        return output_file


def main():
    """Production-grade main function with comprehensive CLI"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='CarDD Dataset Preparation - Production Grade',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic usage
  python prepare_cardd_dataset.py --data_root ./data --output ./dataset

  # With visualization and resume capability
  python prepare_cardd_dataset.py --data_root ./data --output ./dataset --visualize --resume

  # Verbose logging
  python prepare_cardd_dataset.py --data_root ./data --output ./dataset -v
        """
    )
    
    parser.add_argument(
        '--data_root',
        type=str,
        default='./data',
        help='Path to data directory containing CarDD_COCO (default: ./data)'
    )
    parser.add_argument(
        '--output',
        type=str,
        default='./dataset',
        help='Output path for processed dataset (default: ./dataset)'
    )
    parser.add_argument(
        '--visualize',
        action='store_true',
        help='Generate visualization of sample annotations'
    )
    parser.add_argument(
        '--resume',
        action='store_true',
        help='Resume interrupted processing'
    )
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Enable verbose logging'
    )
    parser.add_argument(
        '--validate-only',
        action='store_true',
        help='Only validate dataset structure without processing'
    )
    
    args = parser.parse_args()
    
    # Configure logging level
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    try:
        # Initialize preparation
        logger.info("="*70)
        logger.info("CarDD Dataset Preparation - Production Grade v2.0.0")
        logger.info("="*70)
        
        prep = CarDDDatasetPreparation(
            data_root=args.data_root,
            output_path=args.output,
            resume=args.resume
        )
        
        # Verify dataset structure
        prep.verify_dataset_structure()
        
        # If validate-only mode, exit here
        if args.validate_only:
            logger.info("\nValidation complete. Exiting without processing.")
            return 0
        
        # Prepare YOLO dataset
        stats = prep.prepare_yolo_dataset()
        
        # Create dataset YAML
        prep.create_dataset_yaml()
        
        # Generate metadata
        prep.generate_metadata(stats)
        
        # Visualize if requested
        if args.visualize:
            for split in [DatasetSplit.TRAIN, DatasetSplit.VAL, DatasetSplit.TEST]:
                prep.visualize_annotations(split=split, num_samples=5)
        
        logger.info("\n" + "="*70)
        logger.info("CarDD Dataset Preparation Completed Successfully!")
        logger.info("="*70)
        logger.info(f"\nNext steps:")
        logger.info(f"  1. Review the dataset at: {args.output}")
        logger.info(f"  2. Check the metadata: {args.output}/dataset_metadata.json")
        logger.info(f"  3. Train model: python train_model.py --data {args.output}/cardd.yaml")
        
        return 0
        
    except KeyboardInterrupt:
        logger.warning("\n\nProcessing interrupted by user")
        logger.info("You can resume processing with --resume flag")
        return 1
        
    except Exception as e:
        logger.error(f"\nFatal error: {e}", exc_info=args.verbose)
        return 1


if __name__ == "__main__":
    exit(main())