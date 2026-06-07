"""
Multi-View Car Damage Detection API - Production Grade

Complete API for Pakistani market with:
- Multi-image batch processing
- Damage deduplication across views
- Severity assessment
- PKR cost estimation
- YOLOv10m support

Author: Car Damage Detection System
Version: 3.0.0 - Multi-View
License: MIT
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
import numpy as np
from PIL import Image
import io
import torch
from ultralytics import YOLO
import cv2
from pathlib import Path
import base64
import logging
from datetime import datetime
import asyncio
from collections import deque
import time

# Import fusion module
from multiview_fusion import MultiViewDamageFusion, ConsolidatedDamage

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('api_multiview.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(
    title="CarDD Multi-View Damage Detection API",
    description="Production-grade multi-view car damage detection for Pakistani market",
    version="3.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
yolo_model = None
fusion_system = None
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model_loaded_at = None
request_count = 0
processing_times = deque(maxlen=100)

# Configuration
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB per image
MAX_IMAGES_PER_REQUEST = 10  # Maximum images in one request
MIN_IMAGE_SIZE = 100
MAX_IMAGE_SIZE = 4096

# CarDD Categories
CARDD_CATEGORIES = {
    0: "dent",
    1: "scratch",
    2: "crack",
    3: "glass_shatter",
    4: "lamp_broken",
    5: "tire_flat"
}


# Pydantic Models
class CostEstimatePKR(BaseModel):
    """PKR repair cost range and point estimate (currency is explicit for API consumers)."""

    min_pkr: float = Field(..., description="Minimum repair cost (PKR)")
    max_pkr: float = Field(..., description="Maximum repair cost (PKR)")
    estimated_pkr: float = Field(..., description="Point estimate (PKR)")
    currency: str = Field(default="PKR", description="ISO currency label")


class DamageDetail(BaseModel):
    damage_id: str = Field(..., description="Unique damage identifier")
    damage_type: str = Field(..., description="Type of damage")
    severity: str = Field(..., description="Severity level: minor, moderate, severe")
    severity_score: float = Field(..., ge=0, le=100, description="Numerical severity (0-100)")
    confidence_avg: float = Field(..., ge=0, le=1, description="Average detection confidence")
    view_count: int = Field(..., ge=1, description="Number of views where damage was detected")
    image_ids: List[str] = Field(..., description="List of image IDs showing this damage")
    total_area_pixels: float = Field(..., description="Total damaged area in pixels")
    damage_metrics: Dict[str, Any] = Field(..., description="Detailed damage-specific metrics")
    estimated_cost_pkr: CostEstimatePKR = Field(..., description="Cost estimation in Pakistani Rupees")
    cropped_images: List[str] = Field(default=[], description="Base64 encoded cropped damage images (one per view)")
    representative_image: Optional[str] = Field(None, description="Base64 encoded best view of this damage")


class MultiViewAnalysisResponse(BaseModel):
    car_id: str = Field(..., description="Unique identifier for this car/analysis")
    total_images_processed: int = Field(..., ge=1)
    total_damages_found: int = Field(..., ge=0)
    damages: List[DamageDetail]
    total_cost_estimate_pkr: CostEstimatePKR
    annotated_images: Dict[str, str] = Field(..., description="Base64 encoded annotated images with bounding boxes")
    processing_time_seconds: float
    timestamp: str
    model_version: str = "YOLOv10m-CarDD"
    
    class Config:
        schema_extra = {
            "example": {
                "car_id": "CAR_20241210_001",
                "total_images_processed": 4,
                "total_damages_found": 2,
                "damages": [
                    {
                        "damage_id": "DMG_000_DENT",
                        "damage_type": "dent",
                        "severity": "moderate",
                        "severity_score": 45.5,
                        "confidence_avg": 0.87,
                        "view_count": 2,
                        "image_ids": ["front_left", "side_left"],
                        "total_area_pixels": 12500.0,
                        "damage_metrics": {
                            "area_score": 43.75,
                            "depth_indicator": "medium"
                        },
                        "estimated_cost_pkr": {
                            "min_pkr": 9200,
                            "max_pkr": 23000,
                            "estimated_pkr": 16100,
                            "currency": "PKR"
                        }
                    }
                ],
                "total_cost_estimate_pkr": {
                    "min_pkr": 12000,
                    "max_pkr": 35000,
                    "estimated_pkr": 23500,
                    "currency": "PKR"
                },
                "processing_time_seconds": 2.45,
                "timestamp": "2024-12-10T12:30:45",
                "model_version": "YOLOv10m-CarDD"
            }
        }


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    fusion_system_ready: bool
    device: str
    uptime_seconds: float
    total_requests: int
    average_processing_time: Optional[float]


class ErrorResponse(BaseModel):
    error: str
    detail: str
    timestamp: str


def sanitize_json_values(obj: Any) -> Any:
    """Recursively convert numpy scalars to native Python types for Pydantic/JSON serialization."""
    if isinstance(obj, np.generic):
        return obj.item()
    if isinstance(obj, dict):
        return {k: sanitize_json_values(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize_json_values(v) for v in obj]
    return obj


# Utility functions
async def validate_image_file(file: UploadFile) -> None:
    """Validate uploaded image file"""
    if file.content_type not in ['image/jpeg', 'image/png', 'image/jpg']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type: {file.content_type}. Only JPEG/PNG allowed."
        )


async def load_and_validate_image(contents: bytes) -> np.ndarray:
    """Load and validate image content"""
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum: {MAX_FILE_SIZE / 1024 / 1024} MB"
        )
    
    try:
        image = Image.open(io.BytesIO(contents)).convert('RGB')
    except Exception as e:
        logger.error(f"Failed to load image: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image file"
        )
    
    # Check dimensions
    width, height = image.size
    if width < MIN_IMAGE_SIZE or height < MIN_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image too small. Minimum: {MIN_IMAGE_SIZE}x{MIN_IMAGE_SIZE}"
        )
    
    # Resize if too large
    if width > MAX_IMAGE_SIZE or height > MAX_IMAGE_SIZE:
        image.thumbnail((MAX_IMAGE_SIZE, MAX_IMAGE_SIZE), Image.LANCZOS)
        logger.info(f"Resized image from {width}x{height} to {image.size}")
    
    # Convert to numpy array
    return np.array(image)


def generate_car_id() -> str:
    """Generate unique car ID"""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    return f"CAR_{timestamp}_{np.random.randint(1000, 9999)}"


def crop_damage_region(image: np.ndarray, bbox_pixels: List[int], padding: int = 50) -> np.ndarray:
    """
    Crop damage region from image with padding
    
    Args:
        image: Full image (H, W, 3)
        bbox_pixels: [x1, y1, x2, y2]
        padding: Pixels of padding around damage
        
    Returns:
        Cropped image region
    """
    h, w = image.shape[:2]
    x1, y1, x2, y2 = bbox_pixels
    
    # Add padding
    x1_padded = max(0, x1 - padding)
    y1_padded = max(0, y1 - padding)
    x2_padded = min(w, x2 + padding)
    y2_padded = min(h, y2 + padding)
    
    # Crop
    cropped = image[y1_padded:y2_padded, x1_padded:x2_padded]
    
    return cropped


def image_to_base64(image: np.ndarray, quality: int = 85) -> str:
    """
    Convert numpy image to base64 string
    
    Args:
        image: Image array (H, W, 3)
        quality: JPEG quality (1-100)
        
    Returns:
        Base64 encoded string
    """
    # Convert RGB to BGR for OpenCV
    if len(image.shape) == 3 and image.shape[2] == 3:
        image_bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    else:
        image_bgr = image
    
    # Encode to JPEG
    _, buffer = cv2.imencode('.jpg', image_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    
    # Convert to base64
    img_base64 = base64.b64encode(buffer).decode('utf-8')
    
    return img_base64


def draw_bounding_boxes_on_image(image: np.ndarray, 
                                  detections: List,
                                  damage_type_map: Dict[int, str]) -> np.ndarray:
    """
    Draw bounding boxes on image for all detections
    
    Args:
        image: Image array (H, W, 3)
        detections: List of detection boxes
        damage_type_map: Mapping from class_id to damage name
        
    Returns:
        Annotated image
    """
    img_annotated = image.copy()
    h, w = img_annotated.shape[:2]
    
    # Color scheme for damage types
    colors = {
        'dent': (255, 165, 0),        # Orange
        'scratch': (255, 255, 0),     # Yellow
        'crack': (255, 0, 0),         # Red
        'glass_shatter': (255, 0, 255),  # Magenta
        'lamp_broken': (0, 255, 255),    # Cyan
        'tire_flat': (128, 128, 128)     # Gray
    }
    
    for box in detections:
        # Get bbox coordinates
        bbox_pixels = box.xyxy[0].cpu().numpy().astype(int)
        x1, y1, x2, y2 = bbox_pixels
        
        # Get damage type
        cls = int(box.cls[0])
        damage_type = damage_type_map.get(cls, "unknown")
        conf = float(box.conf[0])
        
        # Get color
        color = colors.get(damage_type, (255, 255, 255))
        
        # Draw rectangle
        cv2.rectangle(img_annotated, (x1, y1), (x2, y2), color, 3)
        
        # Prepare label
        label = f"{damage_type.replace('_', ' ').title()}"
        conf_label = f"{conf:.2f}"
        
        # Draw label background
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.6
        thickness = 2
        
        (label_w, label_h), baseline = cv2.getTextSize(label, font, font_scale, thickness)
        (conf_w, conf_h), _ = cv2.getTextSize(conf_label, font, font_scale - 0.1, thickness - 1)
        
        # Draw label box
        cv2.rectangle(img_annotated,
                     (x1, y1 - label_h - conf_h - 20),
                     (x1 + max(label_w, conf_w) + 10, y1),
                     color, -1)
        
        # Draw text
        cv2.putText(img_annotated, label,
                   (x1 + 5, y1 - conf_h - 12),
                   font, font_scale, (0, 0, 0), thickness)
        
        cv2.putText(img_annotated, conf_label,
                   (x1 + 5, y1 - 5),
                   font, font_scale - 0.1, (0, 0, 0), thickness - 1)
    
    return img_annotated


@app.on_event("startup")
async def load_models():
    """Load YOLO model and initialize fusion system"""
    global yolo_model, fusion_system, model_loaded_at
    
    logger.info("="*70)
    logger.info("Starting Multi-View Car Damage Detection API v3.0.0")
    logger.info("="*70)
    
    # Load YOLO model
    model_paths = [
        "./trained_model/cardd_exp_20251210_051751_yolov10m_stage2/weights/best.pt",
        "./trained_model/cardd_exp_20251210_051751_yolov10m_stage1/weights/best.pt",
        "./runs/cardd_yolov8s/weights/best.pt",
        "./best.pt"
    ]
    
    model_loaded = False
    for model_path in model_paths:
        if Path(model_path).exists():
            try:
                logger.info(f"Loading model: {model_path}")
                yolo_model = YOLO(model_path)
                yolo_model.to(device)
                model_loaded_at = datetime.now()
                model_loaded = True
                logger.info(f"Model loaded successfully: {model_path}")
                logger.info(f"Device: {device}")
                if device.type == 'cuda':
                    logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
                    logger.info(f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")
                break
            except Exception as e:
                logger.warning(f"Failed to load from {model_path}: {e}")
                continue
    
    if not model_loaded:
        logger.error("No model found in any expected location!")
        logger.error("Expected locations:")
        for path in model_paths:
            logger.error(f"  - {path}")
        raise RuntimeError("Model initialization failed - no model found")
    
    # Initialize fusion system
    try:
        logger.info("Initializing Multi-View Fusion System...")
        fusion_system = MultiViewDamageFusion(device=device)
        logger.info("Fusion system initialized")
    except Exception as e:
        logger.error(f"Failed to initialize fusion system: {e}")
        raise RuntimeError("Fusion system initialization failed")
    
    logger.info("="*70)
    logger.info("API Ready - Multi-View Damage Detection")
    logger.info("="*70)


@app.get("/", tags=["General"])
async def root():
    """API information"""
    return {
        "name": "Car Damage Detection API",
        "features": [
            "Multi-image batch processing",
            "Cross-view damage deduplication",
            "Severity assessment",
            "PKR cost estimation",
            "YOLOv10m support"
        ],
        "max_images_per_request": MAX_IMAGES_PER_REQUEST,
        "documentation": "/docs",
        "health_check": "/health"
    }


@app.get("/health", response_model=HealthResponse, tags=["Monitoring"])
async def health_check():
    """Comprehensive health check"""
    global request_count, model_loaded_at, processing_times
    
    uptime = (datetime.now() - model_loaded_at).total_seconds() if model_loaded_at else 0
    avg_time = sum(processing_times) / len(processing_times) if processing_times else None
    
    return HealthResponse(
        status="healthy" if (yolo_model is not None and fusion_system is not None) else "degraded",
        model_loaded=yolo_model is not None,
        fusion_system_ready=fusion_system is not None,
        device=str(device),
        uptime_seconds=uptime,
        total_requests=request_count,
        average_processing_time=avg_time
    )


@app.get("/categories", tags=["Information"])
async def get_categories():
    """Get damage categories and severity levels"""
    return {
        "damage_types": {
            id: {
                "id": id,
                "name": name,
                "name_urdu": {
                    "dent": "گڑھا",
                    "scratch": "خراش",
                    "crack": "شگاف",
                    "glass_shatter": "شیشہ ٹوٹا",
                    "lamp_broken": "لائٹ ٹوٹی",
                    "tire_flat": "ٹائر پنکچر"
                }.get(name, name)
            }
            for id, name in CARDD_CATEGORIES.items()
        },
        "severity_levels": {
            "minor": {"name": "Minor", "urdu": "معمولی", "range": "0-33"},
            "moderate": {"name": "Moderate", "urdu": "درمیانی", "range": "34-66"},
            "severe": {"name": "Severe", "urdu": "شدید", "range": "67-100"}
        },
        "currency": "PKR (Pakistani Rupees)"
    }


@app.post("/detect-multi-view", response_model=MultiViewAnalysisResponse, tags=["Detection"])
async def detect_multi_view_damage(
    files: List[UploadFile] = File(..., description="Multiple images of the same car from different angles")
):
    """
    Multi-view car damage detection with deduplication
    
    **How it works:**
    1. Accepts 1-10 images of the same car from different angles
    2. Detects damages in each image using YOLOv10m
    3. Uses CNN features to match damages across images
    4. Deduplicates same damage seen in multiple views
    5. Assesses comprehensive severity across all views
    6. Returns consolidated damage report with PKR costs
    
    **Best Practices:**
    - Upload 4-6 images for best results
    - Cover all angles: front, rear, left, right, front-left, front-right
    - Ensure good lighting and clear images
    - Use consistent distance from car
    
    **For Pakistani Cars:**
    - Cost estimates in PKR
    - Optimized for local repair market
    - Considers Pakistani vehicle types
    """
    global request_count, processing_times
    
    start_time = time.time()
    request_count += 1
    
    # Validation
    if len(files) < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least 1 image required"
        )
    
    if len(files) > MAX_IMAGES_PER_REQUEST:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_IMAGES_PER_REQUEST} images allowed per request"
        )
    
    try:
        # Generate car ID
        car_id = generate_car_id()
        
        logger.info(f"Processing {len(files)} images for car: {car_id}")
        
        # Load and validate all images
        images = []
        image_ids = []
        
        for idx, file in enumerate(files):
            await validate_image_file(file)
            contents = await file.read()
            image_np = await load_and_validate_image(contents)
            
            images.append(image_np)
            # Use original filename or generate ID
            img_id = Path(file.filename).stem if file.filename else f"view_{idx}"
            image_ids.append(img_id)
        
        logger.info(f"Loaded {len(images)} images")
        
        # Run YOLO detection on each image
        yolo_results = []
        for img in images:
            result = yolo_model(img, conf=0.25, iou=0.45, verbose=False)
            yolo_results.append(result[0])
        
        total_raw_detections = sum(len(r.boxes) for r in yolo_results)
        logger.info(f"YOLO detected {total_raw_detections} total damages (before deduplication)")
        
        # Generate annotated images with bounding boxes
        annotated_images = {}
        for img_id, img, result in zip(image_ids, images, yolo_results):
            annotated_img = draw_bounding_boxes_on_image(img, result.boxes, CARDD_CATEGORIES)
            annotated_images[img_id] = image_to_base64(annotated_img, quality=85)
        
        logger.info(f"Generated {len(annotated_images)} annotated images")
        
        # Run multi-view fusion
        consolidated_damages = fusion_system.process_detections(
            images=images,
            yolo_results=yolo_results,
            image_ids=image_ids
        )
        
        logger.info(f"Consolidated to {len(consolidated_damages)} unique damages")
        
        # Convert to response format with cropped images
        damage_details = []
        
        for damage in consolidated_damages:
            # Generate cropped images for each view of this damage
            cropped_images_base64 = []
            representative_image = None
            max_confidence = 0
            
            # Find the detections that belong to this damage
            for img_id, img, result in zip(image_ids, images, yolo_results):
                if img_id in damage.image_ids:
                    # Find matching detections in this image
                    for box in result.boxes:
                        cls = int(box.cls[0])
                        damage_type = CARDD_CATEGORIES.get(cls, "unknown")
                        
                        # Check if this detection matches our consolidated damage
                        if damage_type == damage.damage_type:
                            bbox_pixels = box.xyxy[0].cpu().numpy().astype(int).tolist()
                            conf = float(box.conf[0])
                            
                            # Crop damage region with padding
                            cropped = crop_damage_region(img, bbox_pixels, padding=50)
                            cropped_base64 = image_to_base64(cropped, quality=90)
                            cropped_images_base64.append(cropped_base64)
                            
                            # Keep track of best quality image
                            if conf > max_confidence:
                                max_confidence = conf
                                representative_image = cropped_base64
            
            damage_detail = DamageDetail(
                damage_id=damage.damage_id,
                damage_type=damage.damage_type,
                severity=damage.severity,
                severity_score=float(damage.severity_score),
                confidence_avg=float(damage.confidence_avg),
                view_count=int(damage.view_count),
                image_ids=damage.image_ids,
                total_area_pixels=float(damage.total_area_pixels),
                damage_metrics=sanitize_json_values(damage.damage_metrics),
                estimated_cost_pkr=sanitize_json_values(damage.estimated_cost_pkr),
                cropped_images=cropped_images_base64,
                representative_image=representative_image
            )
            damage_details.append(damage_detail)
        
        # Calculate total costs
        total_min = sum(d.estimated_cost_pkr['min_pkr'] for d in consolidated_damages)
        total_max = sum(d.estimated_cost_pkr['max_pkr'] for d in consolidated_damages)
        total_est = sum(d.estimated_cost_pkr['estimated_pkr'] for d in consolidated_damages)
        
        processing_time = time.time() - start_time
        processing_times.append(processing_time)
        
        logger.info(f"Processing complete in {processing_time:.2f}s")
        logger.info(f"  Annotated images: {len(annotated_images)}")
        logger.info(f"  Cropped damage regions: {sum(len(d.cropped_images) for d in damage_details)}")
        logger.info(f"  Total cost estimate: PKR {total_est:,.0f}")
        
        return MultiViewAnalysisResponse(
            car_id=car_id,
            total_images_processed=len(images),
            total_damages_found=len(consolidated_damages),
            damages=damage_details,
            total_cost_estimate_pkr=sanitize_json_values({
                'min_pkr': float(round(float(total_min), 0)),
                'max_pkr': float(round(float(total_max), 0)),
                'estimated_pkr': float(round(float(total_est), 0)),
                'currency': 'PKR'
            }),
            annotated_images=annotated_images,
            processing_time_seconds=round(processing_time, 2),
            timestamp=datetime.now().isoformat(),
            model_version="YOLOv10m-CarDD"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Detection error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Detection failed: {str(e)}"
        )


@app.post("/detect-single", tags=["Detection"])
async def detect_single_image(file: UploadFile = File(...)):
    """
    Single image detection (for backward compatibility)
    
    Note: For best results, use /detect-multi-view with multiple images
    """
    # Reuse multi-view endpoint with single image
    return await detect_multi_view_damage(files=[file])


# Exception handlers
@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ErrorResponse(
            error="Internal Server Error",
            detail="An unexpected error occurred",
            timestamp=datetime.now().isoformat()
        ).model_dump()
    )


if __name__ == "__main__":
    import uvicorn
    
    logger.info("Starting Multi-View Damage Detection API...")
    logger.info("For Pakistani market with PKR cost estimation")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8001,
        log_level="info",
        access_log=True
    )