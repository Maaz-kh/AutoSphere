"""
Multi-View Damage Fusion & Deduplication Module - Production Grade

Advanced damage detection system for multi-angle car images with:
- CNN-based feature extraction for damage matching
- Cross-image deduplication
- Severity assessment per damage type
- Consolidated damage reporting
- Pakistani market cost estimation

Author: Car Damage Detection System
Version: 3.0.0
License: MIT
"""

import numpy as np
import cv2
import torch
import torch.nn as nn
from torchvision import models, transforms
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.cluster import DBSCAN
from scipy.spatial.distance import euclidean
from typing import List, Dict, Tuple, Optional, Any
import logging
from dataclasses import dataclass, asdict
from pathlib import Path
from PIL import Image
import hashlib

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class DamageDetection:
    """Single damage detection from one image"""
    image_id: str
    damage_type: str
    confidence: float
    bbox: List[float]  # [x_center, y_center, width, height] normalized
    bbox_pixels: List[int]  # [x1, y1, x2, y2] absolute pixels
    area_pixels: float
    damage_features: Optional[np.ndarray] = None
    color_histogram: Optional[np.ndarray] = None
    texture_features: Optional[np.ndarray] = None
    image_shape: Optional[Tuple[int, int]] = None


@dataclass
class ConsolidatedDamage:
    """Consolidated damage across multiple views"""
    damage_id: str
    damage_type: str
    severity: str
    severity_score: float  # 0-100
    confidence_avg: float
    view_count: int
    total_area_pixels: float
    image_ids: List[str]
    representative_bbox: List[float]
    damage_metrics: Dict
    estimated_cost_pkr: Dict[str, Any]  # min_pkr, max_pkr, estimated_pkr (floats) + currency (str)


class DamageFeatureExtractor:
    """
    Extract visual features from damage regions for matching across images
    """
    
    def __init__(self, device='cuda' if torch.cuda.is_available() else 'cpu'):
        self.device = device
        
        # Load pre-trained CNN for feature extraction
        logger.info("Loading ResNet50 for feature extraction...")
        self.feature_extractor = models.resnet50(pretrained=True)
        # Remove final classification layer
        self.feature_extractor = nn.Sequential(*list(self.feature_extractor.children())[:-1])
        self.feature_extractor.to(device)
        self.feature_extractor.eval()
        
        # Image transformation
        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])
        
        logger.info(f"✓ Feature extractor initialized on {device}")
    
    def extract_cnn_features(self, image_crop: np.ndarray) -> np.ndarray:
        """
        Extract deep CNN features from damage region
        
        Args:
            image_crop: Cropped damage region (H, W, 3)
            
        Returns:
            Feature vector (2048,)
        """
        try:
            # Convert to PIL Image
            if image_crop.shape[0] < 10 or image_crop.shape[1] < 10:
                # Too small, return zero features
                return np.zeros(2048)
            
            pil_image = Image.fromarray(cv2.cvtColor(image_crop, cv2.COLOR_BGR2RGB))
            
            # Transform and add batch dimension
            image_tensor = self.transform(pil_image).unsqueeze(0).to(self.device)
            
            # Extract features
            with torch.no_grad():
                features = self.feature_extractor(image_tensor)
            
            # Flatten and convert to numpy
            features = features.squeeze().cpu().numpy()
            
            # L2 normalize
            features = features / (np.linalg.norm(features) + 1e-8)
            
            return features
            
        except Exception as e:
            logger.warning(f"CNN feature extraction failed: {e}")
            return np.zeros(2048)
    
    def extract_color_histogram(self, image_crop: np.ndarray, bins: int = 32) -> np.ndarray:
        """
        Extract color histogram features
        
        Args:
            image_crop: Cropped damage region
            bins: Number of bins per channel
            
        Returns:
            Concatenated histogram (bins * 3,)
        """
        try:
            # Convert to HSV for better color representation
            hsv = cv2.cvtColor(image_crop, cv2.COLOR_BGR2HSV)
            
            # Calculate histogram for each channel
            hist_h = cv2.calcHist([hsv], [0], None, [bins], [0, 180])
            hist_s = cv2.calcHist([hsv], [1], None, [bins], [0, 256])
            hist_v = cv2.calcHist([hsv], [2], None, [bins], [0, 256])
            
            # Normalize
            hist_h = hist_h.flatten() / (hist_h.sum() + 1e-8)
            hist_s = hist_s.flatten() / (hist_s.sum() + 1e-8)
            hist_v = hist_v.flatten() / (hist_v.sum() + 1e-8)
            
            # Concatenate
            color_features = np.concatenate([hist_h, hist_s, hist_v])
            
            return color_features
            
        except Exception as e:
            logger.warning(f"Color histogram extraction failed: {e}")
            return np.zeros(bins * 3)
    
    def extract_texture_features_lbp(self, image_crop: np.ndarray) -> np.ndarray:
        """
        Extract Local Binary Pattern (LBP) texture features
        
        Args:
            image_crop: Cropped damage region
            
        Returns:
            LBP histogram (256,)
        """
        try:
            # Convert to grayscale
            gray = cv2.cvtColor(image_crop, cv2.COLOR_BGR2GRAY)
            
            # Simple LBP implementation
            h, w = gray.shape
            lbp = np.zeros_like(gray)
            
            for i in range(1, h - 1):
                for j in range(1, w - 1):
                    center = gray[i, j]
                    code = 0
                    code |= (gray[i-1, j-1] > center) << 7
                    code |= (gray[i-1, j] > center) << 6
                    code |= (gray[i-1, j+1] > center) << 5
                    code |= (gray[i, j+1] > center) << 4
                    code |= (gray[i+1, j+1] > center) << 3
                    code |= (gray[i+1, j] > center) << 2
                    code |= (gray[i+1, j-1] > center) << 1
                    code |= (gray[i, j-1] > center) << 0
                    lbp[i, j] = code
            
            # Calculate histogram
            hist, _ = np.histogram(lbp.ravel(), bins=256, range=(0, 256))
            hist = hist.astype(float) / (hist.sum() + 1e-8)
            
            return hist
            
        except Exception as e:
            logger.warning(f"Texture feature extraction failed: {e}")
            return np.zeros(256)
    
    def extract_all_features(self, image: np.ndarray, bbox_pixels: List[int]) -> Dict:
        """
        Extract all features for a damage region
        
        Args:
            image: Full image (H, W, 3)
            bbox_pixels: [x1, y1, x2, y2]
            
        Returns:
            Dictionary of features
        """
        x1, y1, x2, y2 = bbox_pixels
        x1, y1, x2, y2 = max(0, x1), max(0, y1), min(image.shape[1], x2), min(image.shape[0], y2)
        
        # Crop damage region
        damage_crop = image[y1:y2, x1:x2]
        
        if damage_crop.size == 0:
            logger.warning("Empty crop, returning zero features")
            return {
                'cnn_features': np.zeros(2048),
                'color_histogram': np.zeros(96),
                'texture_features': np.zeros(256)
            }
        
        # Extract features
        cnn_features = self.extract_cnn_features(damage_crop)
        color_histogram = self.extract_color_histogram(damage_crop)
        texture_features = self.extract_texture_features_lbp(damage_crop)
        
        return {
            'cnn_features': cnn_features,
            'color_histogram': color_histogram,
            'texture_features': texture_features
        }


class DamageDeduplicator:
    """
    Cross-image damage matching and deduplication
    """
    
    def __init__(self, 
                 cnn_weight: float = 0.7,
                 color_weight: float = 0.2,
                 texture_weight: float = 0.1,
                 similarity_threshold: float = 0.75):
        """
        Initialize deduplicator with feature weights
        
        Args:
            cnn_weight: Weight for CNN features (most important)
            color_weight: Weight for color histogram
            texture_weight: Weight for texture features
            similarity_threshold: Threshold for matching (0-1)
        """
        self.cnn_weight = cnn_weight
        self.color_weight = color_weight
        self.texture_weight = texture_weight
        self.similarity_threshold = similarity_threshold
        
        logger.info(f"✓ Deduplicator initialized (threshold={similarity_threshold})")
    
    def compute_similarity(self, det1: DamageDetection, det2: DamageDetection) -> float:
        """
        Compute multi-modal similarity between two detections
        
        Returns:
            Similarity score (0-1), higher = more similar
        """
        # Must be same damage type
        if det1.damage_type != det2.damage_type:
            return 0.0
        
        # CNN feature similarity (cosine)
        cnn_sim = cosine_similarity(
            det1.damage_features.reshape(1, -1),
            det2.damage_features.reshape(1, -1)
        )[0, 0]
        
        # Color histogram similarity
        color_sim = cosine_similarity(
            det1.color_histogram.reshape(1, -1),
            det2.color_histogram.reshape(1, -1)
        )[0, 0]
        
        # Texture similarity
        texture_sim = cosine_similarity(
            det1.texture_features.reshape(1, -1),
            det2.texture_features.reshape(1, -1)
        )[0, 0]
        
        # Size similarity (relative bbox size)
        size1 = det1.bbox[2] * det1.bbox[3]  # normalized area
        size2 = det2.bbox[2] * det2.bbox[3]
        size_ratio = min(size1, size2) / (max(size1, size2) + 1e-8)
        
        # Weighted combination
        total_similarity = (
            self.cnn_weight * cnn_sim +
            self.color_weight * color_sim +
            self.texture_weight * texture_sim
        )
        
        # Apply size penalty if sizes are very different
        if size_ratio < 0.5:
            total_similarity *= 0.8
        
        return total_similarity
    
    def build_similarity_matrix(self, detections: List[DamageDetection]) -> np.ndarray:
        """
        Build NxN similarity matrix for all detections
        
        Returns:
            Similarity matrix (N, N)
        """
        n = len(detections)
        sim_matrix = np.zeros((n, n))
        
        for i in range(n):
            for j in range(i + 1, n):
                # Don't compare detections from same image
                if detections[i].image_id == detections[j].image_id:
                    sim_matrix[i, j] = 0.0
                else:
                    sim = self.compute_similarity(detections[i], detections[j])
                    sim_matrix[i, j] = sim
                    sim_matrix[j, i] = sim
        
        return sim_matrix
    
    def cluster_detections(self, detections: List[DamageDetection]) -> List[List[int]]:
        """
        Cluster detections into groups (same damage across views)
        
        Returns:
            List of clusters, each cluster is list of detection indices
        """
        if len(detections) <= 1:
            return [[0]] if len(detections) == 1 else []
        
        # Build similarity matrix
        sim_matrix = self.build_similarity_matrix(detections)
        
        # Convert similarity to distance
        distance_matrix = 1 - sim_matrix
        
        # DBSCAN clustering
        clustering = DBSCAN(
            eps=1 - self.similarity_threshold,
            min_samples=1,
            metric='precomputed'
        )
        
        labels = clustering.fit_predict(distance_matrix)
        
        # Group detections by cluster
        clusters = {}
        for idx, label in enumerate(labels):
            if label not in clusters:
                clusters[label] = []
            clusters[label].append(idx)
        
        cluster_list = list(clusters.values())
        
        logger.info(f"Clustered {len(detections)} detections into {len(cluster_list)} unique damages")
        
        return cluster_list


class SeverityAssessor:
    """
    Assess damage severity based on damage type and metrics
    """
    
    # Severity thresholds per damage type
    SEVERITY_THRESHOLDS = {
        'dent': {
            'minor': {'area_max': 5000, 'depth': 'shallow'},
            'moderate': {'area_max': 15000, 'depth': 'medium'},
            'severe': {'area_max': float('inf'), 'depth': 'deep'}
        },
        'scratch': {
            'minor': {'length': 100, 'width': 3},
            'moderate': {'length': 300, 'width': 10},
            'severe': {'length': float('inf'), 'width': float('inf')}
        },
        'crack': {
            'minor': {'length': 50, 'branches': 1},
            'moderate': {'length': 150, 'branches': 3},
            'severe': {'length': float('inf'), 'branches': float('inf')}
        },
        'glass_shatter': {
            'minor': {'area_max': 3000, 'fragments': 5},
            'moderate': {'area_max': 10000, 'fragments': 15},
            'severe': {'area_max': float('inf'), 'fragments': float('inf')}
        },
        'lamp_broken': {
            'minor': {'area_max': 2000, 'broken_percent': 30},
            'moderate': {'area_max': 5000, 'broken_percent': 60},
            'severe': {'area_max': float('inf'), 'broken_percent': 100}
        },
        'tire_flat': {
            'minor': {'deflation': 'partial'},
            'moderate': {'deflation': 'significant'},
            'severe': {'deflation': 'complete'}
        }
    }
    
    def assess_severity(self, damage_type: str, detections: List[DamageDetection]) -> Tuple[str, float, Dict]:
        """
        Assess severity for a consolidated damage
        
        Args:
            damage_type: Type of damage
            detections: List of detections for this damage
            
        Returns:
            (severity_level, severity_score, damage_metrics)
        """
        # Calculate aggregate metrics
        total_area = sum(det.area_pixels for det in detections)
        avg_confidence = np.mean([det.confidence for det in detections])
        max_area = max(det.area_pixels for det in detections)
        
        # Type-specific severity assessment
        if damage_type == 'dent':
            severity_score, metrics = self._assess_dent_severity(total_area, detections)
        
        elif damage_type == 'scratch':
            severity_score, metrics = self._assess_scratch_severity(detections)
        
        elif damage_type == 'crack':
            severity_score, metrics = self._assess_crack_severity(detections)
        
        elif damage_type == 'glass_shatter':
            severity_score, metrics = self._assess_glass_severity(total_area, detections)
        
        elif damage_type == 'lamp_broken':
            severity_score, metrics = self._assess_lamp_severity(total_area, detections)
        
        elif damage_type == 'tire_flat':
            severity_score, metrics = self._assess_tire_severity(detections)
        
        else:
            # Generic assessment
            severity_score = min(100, (total_area / 10000) * 100)
            metrics = {'total_area_pixels': total_area}
        
        # Determine severity level
        if severity_score < 33:
            severity_level = 'minor'
        elif severity_score < 66:
            severity_level = 'moderate'
        else:
            severity_level = 'severe'
        
        metrics['total_area_pixels'] = total_area
        metrics['max_area_pixels'] = max_area
        metrics['avg_confidence'] = avg_confidence
        metrics['view_count'] = len(detections)
        
        return severity_level, severity_score, metrics
    
    def _assess_dent_severity(self, total_area: float, detections: List[DamageDetection]) -> Tuple[float, Dict]:
        """Assess dent severity based on area and depth estimation"""
        # Area-based scoring (0-70 points)
        area_score = min(70, (total_area / 20000) * 70)
        
        # Multi-view penalty (if seen from multiple angles, likely deeper) (0-30 points)
        view_score = min(30, len(detections) * 10)
        
        severity_score = area_score + view_score
        
        metrics = {
            'area_score': area_score,
            'depth_indicator': 'high' if len(detections) >= 3 else 'medium' if len(detections) == 2 else 'low'
        }
        
        return severity_score, metrics
    
    def _assess_scratch_severity(self, detections: List[DamageDetection]) -> Tuple[float, Dict]:
        """Assess scratch severity based on length and width"""
        # Estimate length from bbox dimensions
        max_length = 0
        total_width = 0
        
        for det in detections:
            # Use larger dimension as length
            length = max(det.bbox_pixels[2] - det.bbox_pixels[0],
                        det.bbox_pixels[3] - det.bbox_pixels[1])
            width = min(det.bbox_pixels[2] - det.bbox_pixels[0],
                       det.bbox_pixels[3] - det.bbox_pixels[1])
            
            max_length = max(max_length, length)
            total_width += width
        
        avg_width = total_width / len(detections)
        
        # Length score (0-60 points)
        length_score = min(60, (max_length / 400) * 60)
        
        # Width score (0-40 points)
        width_score = min(40, (avg_width / 20) * 40)
        
        severity_score = length_score + width_score
        
        metrics = {
            'estimated_length_px': max_length,
            'estimated_width_px': avg_width
        }
        
        return severity_score, metrics
    
    def _assess_crack_severity(self, detections: List[DamageDetection]) -> Tuple[float, Dict]:
        """Assess crack severity based on extent and branching"""
        # Total area covered by cracks
        total_area = sum(det.area_pixels for det in detections)
        
        # Number of separate crack detections indicates branching
        branch_count = len(detections)
        
        # Area score (0-60 points)
        area_score = min(60, (total_area / 15000) * 60)
        
        # Branch score (0-40 points)
        branch_score = min(40, branch_count * 13)
        
        severity_score = area_score + branch_score
        
        metrics = {
            'branch_count': branch_count,
            'crack_extent': 'extensive' if total_area > 10000 else 'moderate' if total_area > 5000 else 'limited'
        }
        
        return severity_score, metrics
    
    def _assess_glass_severity(self, total_area: float, detections: List[DamageDetection]) -> Tuple[float, Dict]:
        """Assess glass shatter severity"""
        # Area score (0-70 points)
        area_score = min(70, (total_area / 12000) * 70)
        
        # Fragment count (more views = more fragments) (0-30 points)
        fragment_score = min(30, len(detections) * 10)
        
        severity_score = area_score + fragment_score
        
        metrics = {
            'estimated_fragments': len(detections) * 2,
            'shatter_pattern': 'spider_web' if len(detections) > 2 else 'localized'
        }
        
        return severity_score, metrics
    
    def _assess_lamp_severity(self, total_area: float, detections: List[DamageDetection]) -> Tuple[float, Dict]:
        """Assess lamp damage severity"""
        # Area-based (0-100 points)
        severity_score = min(100, (total_area / 8000) * 100)
        
        metrics = {
            'broken_percentage': min(100, (total_area / 8000) * 100)
        }
        
        return severity_score, metrics
    
    def _assess_tire_severity(self, detections: List[DamageDetection]) -> Tuple[float, Dict]:
        """Assess tire damage severity"""
        # Average area
        avg_area = np.mean([det.area_pixels for det in detections])
        
        # Larger area = more deflated
        severity_score = min(100, (avg_area / 15000) * 100)
        
        metrics = {
            'deflation_level': 'complete' if severity_score > 66 else 'significant' if severity_score > 33 else 'partial'
        }
        
        return severity_score, metrics


class MultiViewDamageFusion:
    """
    Main fusion module - orchestrates the entire multi-view pipeline
    """
    
    def __init__(self, device='cuda' if torch.cuda.is_available() else 'cpu'):
        """Initialize fusion system"""
        self.device = device
        self.feature_extractor = DamageFeatureExtractor(device)
        self.deduplicator = DamageDeduplicator(
            similarity_threshold=0.75  # Tune based on performance
        )
        self.severity_assessor = SeverityAssessor()
        
        logger.info("✓ Multi-View Damage Fusion System initialized")
    
    def process_detections(self,
                          images: List[np.ndarray],
                          yolo_results: List,
                          image_ids: Optional[List[str]] = None) -> List[ConsolidatedDamage]:
        """
        Process multiple images and consolidate damages
        
        Args:
            images: List of images (H, W, 3)
            yolo_results: List of YOLO detection results
            image_ids: Optional list of image identifiers
            
        Returns:
            List of consolidated damages (deduplicated)
        """
        if image_ids is None:
            image_ids = [f"img_{i}" for i in range(len(images))]
        
        logger.info(f"Processing {len(images)} images...")
        
        # Step 1: Extract all detections with features
        all_detections = []
        
        for img_idx, (image, result, img_id) in enumerate(zip(images, yolo_results, image_ids)):
            boxes = result.boxes
            
            for box in boxes:
                # Extract bbox information
                bbox_norm = box.xywhn[0].cpu().numpy()  # normalized
                bbox_pixels = box.xyxy[0].cpu().numpy().astype(int)  # absolute
                conf = float(box.conf[0])
                cls = int(box.cls[0])
                
                # Get damage type
                damage_type = self._get_damage_type(cls)
                
                # Calculate area
                x1, y1, x2, y2 = bbox_pixels
                area_pixels = (x2 - x1) * (y2 - y1)
                
                # Extract features
                features = self.feature_extractor.extract_all_features(image, bbox_pixels.tolist())
                
                # Create detection object
                detection = DamageDetection(
                    image_id=img_id,
                    damage_type=damage_type,
                    confidence=conf,
                    bbox=bbox_norm.tolist(),
                    bbox_pixels=bbox_pixels.tolist(),
                    area_pixels=area_pixels,
                    damage_features=features['cnn_features'],
                    color_histogram=features['color_histogram'],
                    texture_features=features['texture_features'],
                    image_shape=image.shape[:2]
                )
                
                all_detections.append(detection)
        
        logger.info(f"Extracted {len(all_detections)} total detections")
        
        if len(all_detections) == 0:
            logger.warning("No detections found!")
            return []
        
        # Step 2: Cluster detections (deduplication)
        clusters = self.deduplicator.cluster_detections(all_detections)
        
        logger.info(f"Deduplicated to {len(clusters)} unique damages")
        
        # Step 3: Consolidate each cluster
        consolidated_damages = []
        
        for cluster_idx, cluster_indices in enumerate(clusters):
            cluster_detections = [all_detections[i] for i in cluster_indices]
            
            # Get damage type (should be same for all in cluster)
            damage_type = cluster_detections[0].damage_type
            
            # Assess severity
            severity_level, severity_score, metrics = self.severity_assessor.assess_severity(
                damage_type, cluster_detections
            )
            
            # Calculate average confidence
            avg_confidence = np.mean([det.confidence for det in cluster_detections])
            
            # Get representative bbox (from detection with highest confidence)
            best_det = max(cluster_detections, key=lambda d: d.confidence)
            
            # Get unique image IDs
            unique_image_ids = list(set(det.image_id for det in cluster_detections))
            
            # Create consolidated damage
            consolidated = ConsolidatedDamage(
                damage_id=f"DMG_{cluster_idx:03d}_{damage_type[:4].upper()}",
                damage_type=damage_type,
                severity=severity_level,
                severity_score=round(severity_score, 2),
                confidence_avg=round(avg_confidence, 3),
                view_count=len(unique_image_ids),
                total_area_pixels=sum(det.area_pixels for det in cluster_detections),
                image_ids=unique_image_ids,
                representative_bbox=best_det.bbox,
                damage_metrics=metrics,
                estimated_cost_pkr=self._estimate_cost_pkr(damage_type, severity_level, metrics)
            )
            
            consolidated_damages.append(consolidated)
        
        # Sort by severity score (highest first)
        consolidated_damages.sort(key=lambda x: x.severity_score, reverse=True)
        
        logger.info(f"✓ Consolidated {len(all_detections)} detections into {len(consolidated_damages)} unique damages")
        
        return consolidated_damages
    
    def _get_damage_type(self, class_id: int) -> str:
        """Map class ID to damage type name"""
        CARDD_CATEGORIES = {
            0: "dent",
            1: "scratch",
            2: "crack",
            3: "glass_shatter",
            4: "lamp_broken",
            5: "tire_flat"
        }
        return CARDD_CATEGORIES.get(class_id, "unknown")
    
    def _estimate_cost_pkr(self, damage_type: str, severity: str, metrics: Dict) -> Dict[str, Any]:
        """
        Estimate repair cost in Pakistani Rupees (PKR)
        
        Based on Pakistani market rates (2024)
        """
        # Base costs in PKR
        BASE_COSTS_PKR = {
            'dent': {
                'minor': {'min': 3000, 'max': 8000},
                'moderate': {'min': 8000, 'max': 20000},
                'severe': {'min': 20000, 'max': 50000}
            },
            'scratch': {
                'minor': {'min': 2000, 'max': 5000},
                'moderate': {'min': 5000, 'max': 15000},
                'severe': {'min': 15000, 'max': 40000}
            },
            'crack': {
                'minor': {'min': 5000, 'max': 12000},
                'moderate': {'min': 12000, 'max': 30000},
                'severe': {'min': 30000, 'max': 80000}
            },
            'glass_shatter': {
                'minor': {'min': 8000, 'max': 15000},
                'moderate': {'min': 15000, 'max': 35000},
                'severe': {'min': 35000, 'max': 70000}
            },
            'lamp_broken': {
                'minor': {'min': 5000, 'max': 12000},
                'moderate': {'min': 12000, 'max': 30000},
                'severe': {'min': 30000, 'max': 60000}
            },
            'tire_flat': {
                'minor': {'min': 800, 'max': 2000},     # Puncture repair
                'moderate': {'min': 2000, 'max': 8000},  # Tire replacement (local)
                'severe': {'min': 8000, 'max': 25000}    # Multiple tires/rim damage
            }
        }
        
        costs = BASE_COSTS_PKR.get(damage_type, BASE_COSTS_PKR['dent'])[severity]
        
        # Area-based adjustment
        area = metrics.get('total_area_pixels', 0)
        if area > 20000:
            multiplier = 1.3
        elif area > 10000:
            multiplier = 1.15
        else:
            multiplier = 1.0
        
        min_cost = costs['min'] * multiplier
        max_cost = costs['max'] * multiplier
        estimated_cost = (min_cost + max_cost) / 2
        
        return {
            'min_pkr': round(min_cost, 0),
            'max_pkr': round(max_cost, 0),
            'estimated_pkr': round(estimated_cost, 0),
            'currency': 'PKR'
        }