"""
Commercial-Grade FastAPI Inference Service for Pakistan Used Car Market
Uses Reference-Based Depreciation Model
Architecture: Reference Price × (1 - Depreciation Rate) = Final Price
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Any, Optional, Dict, List, Tuple
import xgboost as xgb
import lightgbm as lgb
import joblib
import json
import numpy as np
import pandas as pd
from pathlib import Path
import logging
import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime

# Ensure local api modules resolve when cwd varies
_API_DIR = Path(__file__).resolve().parent
_VV_ROOT = _API_DIR.parent.parent
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

# Load .env before CORS and other settings that read os.environ
try:
    from dotenv import load_dotenv
    load_dotenv(_VV_ROOT / ".env")
except Exception:
    pass

_cors_raw = os.getenv("CORS_ALLOWED_ORIGINS", "*").strip()
if _cors_raw in ("", "*"):
    _cors_origins: List[str] = ["*"]
    _cors_credentials = False
else:
    _cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]
    _cors_credentials = True

# Model artifacts live under Vehicle Valuation/src/models
MODEL_DIR = _API_DIR.parent / "models"

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ==================== Request/Response Models ====================

class CarFeatures(BaseModel):
    """Input features for price prediction."""

    model: str = Field(..., description="Car model", json_schema_extra={"example": "Suzuki Cultus"})
    variant: str = Field(..., description="Car variant", json_schema_extra={"example": "VXL"})
    model_year: int = Field(..., ge=1990, le=2026, description="Manufacturing year", json_schema_extra={"example": 2022})
    mileage: float = Field(..., ge=0, le=500000, description="Mileage in kilometers", json_schema_extra={"example": 120000})
    transmission_type: str = Field(..., description="'Manual' or 'Automatic'", json_schema_extra={"example": "Manual"})
    registered_in: str = Field(..., description="Registration city", json_schema_extra={"example": "Lahore"})
    engine_capacity: float = Field(..., ge=500, le=8000, description="Engine capacity in cc", json_schema_extra={"example": 1000})
    exterior_condition: str = Field(
        default="Not Specified",
        description="Exterior condition",
        json_schema_extra={"example": "Excellent/Genuine"}
    )
    assembly: str = Field(default="Local", description="'Local' or 'Imported'", json_schema_extra={"example": "Local"})
    body_type: str = Field(default="Hatchback", description="Body type", json_schema_extra={"example": "Hatchback"})
    color: Optional[str] = Field(default="White", description="Car color", json_schema_extra={"example": "White"})

    @field_validator('transmission_type')
    @classmethod
    def validate_transmission(cls, v):
        if v not in ['Manual', 'Automatic']:
            raise ValueError("transmission_type must be 'Manual' or 'Automatic'")
        return v

    @field_validator('exterior_condition')
    @classmethod
    def validate_condition(cls, v):
        valid_conditions = [
            'Excellent/Genuine', 'Minor Touchup', 'Repainted/Painted',
            'Accident/Damaged', 'Inner Genuine Only', 'Not Specified'
        ]
        if v not in valid_conditions:
            raise ValueError(f"exterior_condition must be one of: {valid_conditions}")
        return v

    @field_validator('assembly')
    @classmethod
    def validate_assembly(cls, v):
        if v not in ['Local', 'Imported']:
            raise ValueError("assembly must be 'Local' or 'Imported'")
        return v


class PricePrediction(BaseModel):
    """Comprehensive price prediction response."""

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "predicted_price": 2100000,
            "reference_price": 3000000,
            "depreciation_applied": 30.5,
            "confidence_interval_lower": 1950000,
            "confidence_interval_upper": 2250000,
            "price_range": "PKR 19.5 - 22.5 Lacs",
            "prediction_quality": "Excellent",
            "market_position": "Fair Market Price",
            "variant_info": {
                "variant_key": "Suzuki Cultus | VXL",
                "sample_count": 540,
                "variant_average_price": 2430372,
                "price_vs_average": "-13.6%"
            },
            "valuation_breakdown": {
                "reference_price_source": "Latest model market price",
                "age_depreciation": "25.0%",
                "condition_adjustment": "Excellent (+5%)",
                "mileage_impact": "High usage (-8%)",
                "final_adjustment": "-2.5%"
            },
            "recommendation": "Good buying opportunity - well-maintained vehicle below variant average"
        }
    })

    predicted_price: float = Field(..., description="Predicted price in PKR")
    reference_price: float = Field(..., description="Reference/market price for this variant")
    depreciation_applied: float = Field(..., description="Depreciation rate applied (%)")

    confidence_interval_lower: float = Field(..., description="Lower bound (90% confidence)")
    confidence_interval_upper: float = Field(..., description="Upper bound (90% confidence)")
    price_range: str = Field(..., description="Human-readable price range")

    prediction_quality: str = Field(..., description="Quality: Excellent/Good/Fair")
    market_position: str = Field(..., description="Price position vs market")

    variant_info: Dict[str, Any] = Field(..., description="Variant statistics")
    valuation_breakdown: Dict[str, Any] = Field(..., description="Detailed valuation breakdown")

    recommendation: str = Field(..., description="Recommendation for buyer/seller")


class HealthCheck(BaseModel):
    """Health check response."""
    status: str
    models_loaded: bool
    total_variants: int
    version: str
    uptime_seconds: float


# ==================== Reference-Based Predictor ====================

class ReferenceBasedPredictor:
    """
    Reference-based pricing predictor for Pakistani car market.
    Predicts depreciation rate and applies to reference prices.
    """

    def __init__(self, model_dir: str = 'models'):
        """Initialize predictor."""
        self.model_dir = Path(model_dir)
        self.depreciation_models = {}
        self.metadata = None
        self.label_encoders = None
        self.startup_time = datetime.now()
        self.prediction_count = 0
        self.current_year = 2026
        self.load_models()

    def load_models(self):
        """Load all model components."""
        try:
            logger.info("=" * 70)
            logger.info("LOADING REFERENCE-BASED PREDICTION MODELS")
            logger.info("=" * 70)

            logger.info("Loading metadata...")
            with open(self.model_dir / 'model_metadata.json', 'r') as f:
                self.metadata = json.load(f)
            logger.info(f"  Reference prices loaded for {len(self.metadata['variant_reference_prices'])} variants")

            logger.info("Loading encoders...")
            self.label_encoders = joblib.load(self.model_dir / 'label_encoders.pkl')
            logger.info("  Label encoders loaded")

            logger.info("Loading depreciation models...")
            xgb_model = xgb.XGBRegressor()
            xgb_model.load_model(str(self.model_dir / 'depreciation_xgb.json'))

            lgb_model = joblib.load(self.model_dir / 'depreciation_lgb.pkl')

            self.depreciation_models = {
                'xgb': xgb_model,
                'lgb': lgb_model,
                'weights': self.metadata['model_weights']
            }
            logger.info("  Depreciation models loaded (XGBoost + LightGBM)")

            logger.info("=" * 70)
            logger.info("ALL MODELS LOADED SUCCESSFULLY")
            logger.info("=" * 70)
            logger.info(f"  Reference prices: {len(self.metadata['variant_reference_prices'])}")
            logger.info(f"  Features: {len(self.metadata['feature_names'])}")
            logger.info("  Model: Reference-Based Depreciation")
            logger.info("=" * 70)

        except Exception as e:
            logger.error(f"Failed to load models: {str(e)}")
            raise

    def get_reference_price(self, variant_key: str) -> Optional[float]:
        """Get reference price for variant."""
        ref_price = self.metadata['variant_reference_prices'].get(variant_key)

        if ref_price is None:
            model_part = variant_key.split('|')[0].strip()
            similar_variants = [
                (k, v) for k, v in self.metadata['variant_reference_prices'].items()
                if k.startswith(model_part)
            ]

            if similar_variants:
                ref_price = np.median([v for k, v in similar_variants])
                logger.info(f"Using estimated reference price from {len(similar_variants)} similar variants")

        return ref_price

    def engineer_features(self, features: CarFeatures) -> Dict:
        """Engineer features for depreciation prediction."""

        age = max(0, self.current_year - features.model_year)
        age_squared = age ** 2
        age_cubed = age ** 3

        mileage_per_year = features.mileage / age if age > 0 else features.mileage
        mileage_per_year = min(mileage_per_year, 50000)

        high_mileage = int(features.mileage > 100000)
        very_high_mileage = int(features.mileage > 200000)

        if features.mileage <= 50000:
            mileage_category = 0
        elif features.mileage <= 100000:
            mileage_category = 1
        elif features.mileage <= 150000:
            mileage_category = 2
        elif features.mileage <= 200000:
            mileage_category = 3
        else:
            mileage_category = 4

        condition_scores = {
            'Accident/Damaged': 0.75,
            'Repainted/Painted': 0.88,
            'Inner Genuine Only': 0.92,
            'Not Specified': 0.90,
            'Minor Touchup': 0.97,
            'Excellent/Genuine': 1.00
        }
        condition_score = condition_scores.get(features.exterior_condition, 0.90)

        is_automatic = int(features.transmission_type == 'Automatic')
        is_imported = int(features.assembly == 'Imported')

        major_cities = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad']
        major_city = int(features.registered_in in major_cities)

        num_ext = 5
        num_int = 4
        num_safe = 4
        num_comfort = 4
        total_features = num_ext + num_int + num_safe + num_comfort

        variant_lower = features.variant.lower()
        is_premium = int(any(k in variant_lower for k in ['grande', 'altis', 'executive', 'vxr', 'vxl', 'top']))
        is_base = int(any(k in variant_lower for k in ['xli', 'gli', 'base', 'dx', 'vx', 'lx']))

        if features.engine_capacity <= 1000:
            engine_category = 0
        elif features.engine_capacity <= 1300:
            engine_category = 1
        elif features.engine_capacity <= 1600:
            engine_category = 2
        elif features.engine_capacity <= 2000:
            engine_category = 3
        else:
            engine_category = 4

        return {
            'age': age,
            'age_squared': age_squared,
            'age_cubed': age_cubed,
            'mileage': features.mileage,
            'mileage_per_year': mileage_per_year,
            'mileage_category': mileage_category,
            'high_mileage': high_mileage,
            'very_high_mileage': very_high_mileage,
            'condition_score': condition_score,
            'is_automatic': is_automatic,
            'is_imported': is_imported,
            'major_city': major_city,
            'engine_capacity': features.engine_capacity,
            'engine_category': engine_category,
            'total_features': total_features,
            'num_exterior_features': num_ext,
            'is_premium': is_premium,
            'is_base': is_base
        }

    def prepare_input(self, features: CarFeatures) -> Tuple[pd.DataFrame, str]:
        """Prepare input features for depreciation prediction."""

        model_clean = features.model.strip().title()
        variant_clean = features.variant.strip().title()
        variant_key = f"{model_clean} | {variant_clean}"

        engineered = self.engineer_features(features)

        data = {
            'model_year': features.model_year,
            'mileage': features.mileage,
            'engine_capacity': features.engine_capacity,
        }
        data.update(engineered)

        data['registered_in'] = features.registered_in
        data['body_type'] = features.body_type

        for col in ['registered_in', 'body_type']:
            if col in self.label_encoders:
                le = self.label_encoders[col]
                if data[col] in le.classes_:
                    data[col] = le.transform([data[col]])[0]
                else:
                    data[col] = 0

        df = pd.DataFrame([data])
        df = df[self.metadata['feature_names']]

        return df, variant_key

    def predict_depreciation(self, X: pd.DataFrame) -> float:
        """Predict depreciation rate."""
        pred_xgb = self.depreciation_models['xgb'].predict(X)[0]
        pred_lgb = self.depreciation_models['lgb'].predict(X)[0]

        weights = self.depreciation_models['weights']
        depreciation = weights[0] * pred_xgb + weights[1] * pred_lgb
        depreciation = np.clip(depreciation, 0, 0.9)

        return float(depreciation)

    def calculate_confidence_interval(
        self,
        predicted_price: float,
        X: pd.DataFrame,
        has_reference: bool
    ) -> Tuple[float, float]:
        """Calculate confidence interval."""

        pred_xgb = self.depreciation_models['xgb'].predict(X)[0]
        pred_lgb = self.depreciation_models['lgb'].predict(X)[0]

        pred_variance = abs(pred_xgb - pred_lgb)

        if has_reference:
            base_uncertainty = 0.04 + pred_variance * 0.5
        else:
            base_uncertainty = 0.08 + pred_variance * 0.5

        base_uncertainty = min(base_uncertainty, 0.15)

        margin = 1.645 * base_uncertainty * predicted_price
        lower = max(predicted_price - margin, predicted_price * 0.75)
        upper = predicted_price + margin

        return lower, upper

    def get_valuation_breakdown(
        self,
        features: CarFeatures,
        reference_price: float,
        depreciation_rate: float,
        predicted_price: float
    ) -> Dict:
        """Generate detailed valuation breakdown."""

        age = self.current_year - features.model_year

        if age <= 5:
            age_depreciation = 15 * age
        else:
            age_depreciation = 75 + 5 * (age - 5)
        age_depreciation = min(age_depreciation, 90)

        condition_impacts = {
            'Excellent/Genuine': 'Excellent (+5%)',
            'Minor Touchup': 'Good (-2%)',
            'Repainted/Painted': 'Fair (-10%)',
            'Accident/Damaged': 'Poor (-20%)',
            'Inner Genuine Only': 'Fair (-8%)',
            'Not Specified': 'Average (0%)'
        }
        condition_text = condition_impacts.get(features.exterior_condition, 'Average (0%)')

        avg_annual_mileage = features.mileage / age if age > 0 else features.mileage
        if avg_annual_mileage > 20000:
            mileage_impact = "High usage (-8%)"
        elif avg_annual_mileage > 15000:
            mileage_impact = "Above average (-5%)"
        elif avg_annual_mileage < 10000:
            mileage_impact = "Low usage (+3%)"
        else:
            mileage_impact = "Average usage (0%)"

        actual_depreciation = depreciation_rate * 100
        expected_depreciation = age_depreciation
        adjustment = actual_depreciation - expected_depreciation

        return {
            'reference_price_source': 'Latest model market price' if reference_price else 'Estimated from similar variants',
            'age_depreciation': f"{age_depreciation:.1f}%",
            'condition_adjustment': condition_text,
            'mileage_impact': mileage_impact,
            'final_adjustment': f"{adjustment:+.1f}%"
        }

    def get_market_insights(
        self,
        features: CarFeatures,
        predicted_price: float,
        variant_key: str
    ) -> Dict:
        """Generate market insights."""

        variant_stats = self.metadata.get('variant_stats', {}).get(variant_key, {})

        insights = {
            'variant_key': variant_key,
            'sample_count': variant_stats.get('sample_count', 0),
            'variant_average_price': variant_stats.get('median_price'),
            'price_vs_average': None
        }

        if insights['variant_average_price']:
            diff = predicted_price - insights['variant_average_price']
            diff_pct = (diff / insights['variant_average_price']) * 100
            insights['price_vs_average'] = f"{diff_pct:+.1f}%"

        return insights

    def generate_recommendation(
        self,
        features: CarFeatures,
        predicted_price: float,
        variant_info: Dict,
        valuation: Dict
    ) -> str:
        """Generate recommendation."""

        price_vs_avg = variant_info.get('price_vs_average')
        condition = features.exterior_condition

        if condition == 'Excellent/Genuine':
            if price_vs_avg and float(price_vs_avg.rstrip('%')) < -5:
                return "Excellent buying opportunity - well-maintained vehicle below variant average"
            elif price_vs_avg and float(price_vs_avg.rstrip('%')) > 5:
                return "Premium pricing justified by excellent condition"
            else:
                return "Fair market price for excellent condition vehicle"

        elif condition in ['Accident/Damaged', 'Repainted/Painted']:
            return "Price reflects condition issues - thorough inspection recommended before purchase"

        else:
            if price_vs_avg and float(price_vs_avg.rstrip('%')) < -10:
                return "Good value - priced below market average"
            elif price_vs_avg and float(price_vs_avg.rstrip('%')) > 10:
                return "Premium pricing - ensure specifications justify the cost"
            else:
                return "Reasonable valuation based on specifications and market data"

    def predict(self, features: CarFeatures) -> PricePrediction:
        """Make comprehensive price prediction."""

        self.prediction_count += 1

        X, variant_key = self.prepare_input(features)

        reference_price = self.get_reference_price(variant_key)
        has_reference = reference_price is not None

        if reference_price is None:
            reference_price = 1500000 + (features.engine_capacity * 800)
            logger.warning(f"No reference price for {variant_key}, estimated: PKR {reference_price:,.0f}")

        depreciation_rate = self.predict_depreciation(X)

        predicted_price = reference_price * (1 - depreciation_rate)
        predicted_price = round(predicted_price, -3)

        lower, upper = self.calculate_confidence_interval(predicted_price, X, has_reference)

        if has_reference:
            quality = "Excellent" if depreciation_rate < 0.5 else "Good"
        else:
            quality = "Fair"

        variant_info = self.get_market_insights(features, predicted_price, variant_key)

        if variant_info['price_vs_average']:
            diff = float(variant_info['price_vs_average'].rstrip('%'))
            if abs(diff) <= 5:
                market_position = "Fair Market Price"
            elif diff < -5:
                market_position = "Below Market Average"
            else:
                market_position = "Above Market Average"
        else:
            market_position = "Market estimate"

        valuation = self.get_valuation_breakdown(
            features, reference_price, depreciation_rate, predicted_price
        )

        recommendation = self.generate_recommendation(
            features, predicted_price, variant_info, valuation
        )

        if predicted_price >= 1000000:
            price_range = f"PKR {lower / 100000:.1f} - {upper / 100000:.1f} Lacs"
        else:
            price_range = f"PKR {lower:,.0f} - {upper:,.0f}"

        logger.info(
            f"Prediction #{self.prediction_count}: {variant_key} {features.model_year} → "
            f"PKR {predicted_price:,.0f} (Ref: {reference_price:,.0f}, Dep: {depreciation_rate * 100:.1f}%)"
        )

        return PricePrediction(
            predicted_price=predicted_price,
            reference_price=reference_price,
            depreciation_applied=round(depreciation_rate * 100, 1),
            confidence_interval_lower=round(lower, -3),
            confidence_interval_upper=round(upper, -3),
            price_range=price_range,
            prediction_quality=quality,
            market_position=market_position,
            variant_info=variant_info,
            valuation_breakdown=valuation,
            recommendation=recommendation
        )


predictor: Optional[ReferenceBasedPredictor] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML models for the prediction API."""
    global predictor
    try:
        from dotenv import load_dotenv
        load_dotenv(_VV_ROOT / ".env")
    except Exception:
        pass

    try:
        predictor = ReferenceBasedPredictor(model_dir=str(MODEL_DIR))
        logger.info("API ready to serve predictions (model_dir=%s)", MODEL_DIR)
    except Exception as e:
        logger.error("Failed to initialize predictor: %s", e)
        raise
    yield


_api_docs_enabled = os.getenv("API_DOCS", "true").strip().lower() in ("1", "true", "yes", "")

app = FastAPI(
    title="Pakistan Used Car Price Prediction API",
    description="Reference-based price predictions aligned with Pakistani market dynamics",
    version="3.0.0",
    docs_url="/docs" if _api_docs_enabled else None,
    redoc_url="/redoc" if _api_docs_enabled else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== API Endpoints ====================

@app.get("/", response_model=HealthCheck)
async def health_check():
    """Health check endpoint."""
    if predictor is None:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "message": "Models not loaded"}
        )

    uptime = (datetime.now() - predictor.startup_time).total_seconds()

    return HealthCheck(
        status="healthy",
        models_loaded=True,
        total_variants=len(predictor.metadata['variant_reference_prices']),
        version="3.0.0",
        uptime_seconds=round(uptime, 2)
    )


@app.post("/predict", response_model=PricePrediction)
async def predict_price(features: CarFeatures):
    """
    Predict car price using reference-based depreciation model.

    Returns detailed valuation with market insights.
    """
    if predictor is None:
        raise HTTPException(status_code=503, detail="Models not loaded")

    try:
        prediction = predictor.predict(features)
        return prediction

    except Exception as e:
        logger.error(f"Prediction error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@app.get("/variants")
async def list_variants(model: Optional[str] = Query(None)):
    """List available variants with reference prices."""
    if predictor is None:
        raise HTTPException(status_code=503, detail="Models not loaded")

    ref_prices = predictor.metadata['variant_reference_prices']
    variant_stats = predictor.metadata.get('variant_stats', {})

    variants_list = list(ref_prices.keys())

    if model:
        model_clean = model.strip().title()
        variants_list = [v for v in variants_list if v.startswith(model_clean)]

    variant_data = []
    for variant in sorted(variants_list):
        stats = variant_stats.get(variant, {})
        variant_data.append({
            "variant": variant,
            "reference_price": ref_prices[variant],
            "sample_count": stats.get('sample_count', 0),
            "median_price": stats.get('median_price'),
            "latest_year": stats.get('latest_year'),
            "oldest_year": stats.get('oldest_year')
        })

    return {
        "total_variants": len(variant_data),
        "filtered_by_model": model,
        "variants": variant_data[:100]
    }


@app.get("/stats")
async def get_statistics():
    """Get API statistics."""
    if predictor is None:
        raise HTTPException(status_code=503, detail="Models not loaded")

    uptime = (datetime.now() - predictor.startup_time).total_seconds()

    return {
        "api_version": "3.0.0",
        "model_type": "Reference-Based Depreciation",
        "uptime_hours": round(uptime / 3600, 2),
        "total_predictions": predictor.prediction_count,
        "models": {
            "depreciation_models": ["XGBoost", "LightGBM"],
            "total_variants": len(predictor.metadata['variant_reference_prices']),
            "total_features": len(predictor.metadata['feature_names'])
        }
    }


# ==================== Run Server ====================

if __name__ == "__main__":
    import uvicorn

    logger.info("=" * 70)
    logger.info("STARTING REFERENCE-BASED PRICE PREDICTION API")
    logger.info("=" * 70)

    uvicorn.run(
        "inference_api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )