"""
Reference-Based Car Price Prediction Model for Pakistani Used Car Market
Architecture: Base Price + Age Depreciation + Condition Adjustments

Key Insight: Pakistani buyers price cars based on:
1. New/Latest model price (reference price)
2. Age-based depreciation (15-20% first year, 10-15% subsequent years)
3. Condition/mileage adjustments (±5-15%)
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, KFold
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import xgboost as xgb
import lightgbm as lgb
import joblib
import json
import logging
from typing import Dict, List, Tuple
from pathlib import Path
from collections import defaultdict
import warnings
warnings.filterwarnings('ignore')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class PakistaniCarPriceModel:
    """
    Reference-based pricing model aligned with Pakistani car market dynamics.
    
    Pricing Logic:
    Final Price = Reference Price × (1 - Depreciation) × Condition Multiplier
    """
    
    def __init__(self, random_state: int = 42):
        self.random_state = random_state
        self.variant_reference_prices = {}  # Latest model year prices by variant
        self.variant_stats = {}
        self.depreciation_model = None  # Model to predict depreciation rate
        self.adjustment_model = None  # Model to predict price adjustments
        self.label_encoders = {}
        self.feature_names = []
        
    def create_variant_key(self, df: pd.DataFrame) -> pd.DataFrame:
        """Create unique variant identifier."""
        df = df.copy()
        df['model'] = df['model'].str.strip().str.title()
        df['variant'] = df['variant'].str.strip().str.title()
        df['variant_key'] = df['model'] + ' | ' + df['variant']
        return df
    
    def calculate_reference_prices(self, df: pd.DataFrame):
        """
        Calculate reference price for each variant based on latest model year prices.
        This represents the "new car" or "latest model" market price.
        """
        logger.info("="*70)
        logger.info("CALCULATING REFERENCE PRICES")
        logger.info("="*70)
        
        for variant in df['variant_key'].unique():
            variant_data = df[df['variant_key'] == variant].copy()
            
            if len(variant_data) < 5:  # Skip variants with too few samples
                continue
            
            # Get prices from newest cars (top 25% by model year)
            newest_threshold = variant_data['model_year'].quantile(0.75)
            newest_cars = variant_data[variant_data['model_year'] >= newest_threshold]
            
            if len(newest_cars) == 0:
                newest_cars = variant_data
            
            # Filter excellent condition cars for reference
            excellent_cars = newest_cars[
                newest_cars['exterior_condition'].isin(['Excellent/Genuine', 'Minor Touchup'])
            ]
            
            if len(excellent_cars) >= 3:
                reference_cars = excellent_cars
            else:
                reference_cars = newest_cars
            
            # Use 75th percentile as reference (represents well-maintained cars)
            reference_price = reference_cars['price'].quantile(0.75)
            
            # Store stats
            self.variant_reference_prices[variant] = reference_price
            self.variant_stats[variant] = {
                'reference_price': reference_price,
                'sample_count': len(variant_data),
                'median_price': variant_data['price'].median(),
                'price_std': variant_data['price'].std(),
                'latest_year': variant_data['model_year'].max(),
                'oldest_year': variant_data['model_year'].min()
            }
        
        # Log top variants
        logger.info(f"\nCalculated reference prices for {len(self.variant_reference_prices)} variants")
        logger.info("\nTop 15 variants by sample count:")
        
        sorted_variants = sorted(
            self.variant_stats.items(), 
            key=lambda x: x[1]['sample_count'], 
            reverse=True
        )[:15]
        
        for variant, stats in sorted_variants:
            logger.info(
                f"  {variant:50s}: PKR {stats['reference_price']:>10,.0f} "
                f"({stats['sample_count']:>4d} samples)"
            )
        logger.info("="*70)
    
    def calculate_depreciation_rate(self, df: pd.DataFrame, current_year: int = 2025):
        """
        Calculate actual depreciation rate for each car.
        Depreciation Rate = (Reference Price - Actual Price) / Reference Price
        """
        df = df.copy()
        df['age'] = current_year - df['model_year']
        df['age'] = np.maximum(df['age'], 0)
        
        # Get reference price for each car
        df['reference_price'] = df['variant_key'].map(self.variant_reference_prices)
        
        # Remove cars without reference price
        df = df[df['reference_price'].notna()].copy()
        
        # Calculate depreciation rate
        # Depreciation = (Reference - Actual) / Reference
        df['depreciation_rate'] = (df['reference_price'] - df['price']) / df['reference_price']
        
        # Clip to reasonable range (0 to 0.9)
        df['depreciation_rate'] = np.clip(df['depreciation_rate'], 0, 0.9)
        
        logger.info(f"\nDepreciation rate statistics:")
        logger.info(f"  Mean: {df['depreciation_rate'].mean():.2%}")
        logger.info(f"  Median: {df['depreciation_rate'].median():.2%}")
        logger.info(f"  Std: {df['depreciation_rate'].std():.2%}")
        
        return df
    
    def engineer_features(self, df: pd.DataFrame, current_year: int = 2025) -> pd.DataFrame:
        """Engineer features for modeling."""
        logger.info("\nEngineering features...")
        df = df.copy()
        
        # Age features
        df['age'] = current_year - df['model_year']
        df['age'] = np.maximum(df['age'], 0)
        df['age_squared'] = df['age'] ** 2
        df['age_cubed'] = df['age'] ** 3
        
        # Mileage features
        df['mileage_per_year'] = np.where(
            df['age'] > 0,
            df['mileage'] / df['age'],
            df['mileage']
        )
        df['mileage_per_year'] = np.clip(df['mileage_per_year'], 0, 50000)
        
        df['high_mileage'] = (df['mileage'] > 100000).astype(int)
        df['very_high_mileage'] = (df['mileage'] > 200000).astype(int)
        
        df['mileage_category'] = pd.cut(
            df['mileage'],
            bins=[0, 50000, 100000, 150000, 200000, float('inf')],
            labels=[0, 1, 2, 3, 4]
        ).astype(int)
        
        # Condition encoding (most important for adjustments)
        condition_score = {
            'Accident/Damaged': 0.75,  # -25% value
            'Repainted/Painted': 0.88,  # -12% value
            'Inner Genuine Only': 0.92,  # -8% value
            'Not Specified': 0.90,
            'Minor Touchup': 0.97,  # -3% value
            'Excellent/Genuine': 1.00  # Full value
        }
        df['condition_score'] = df['exterior_condition'].map(condition_score).fillna(0.90)
        
        # Transmission (Automatic typically adds 2-5% in Pakistan)
        df['is_automatic'] = (df['transmission_type'] == 'Automatic').astype(int)
        
        # Assembly (Imported adds 5-10%)
        df['is_imported'] = (df['assembly'] == 'Imported').astype(int)
        
        # City registration (Lahore/Karachi/Islamabad typically higher)
        major_cities = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad']
        df['major_city'] = df['registered_in'].isin(major_cities).astype(int)
        
        # Feature counts
        df['num_exterior_features'] = df['exterior_features'].apply(self.count_features)
        df['num_interior_features'] = df['interior_features'].apply(self.count_features)
        df['num_safety_features'] = df['safety_security_features'].apply(self.count_features)
        df['num_comfort_features'] = df['comfort_convenience_features'].apply(self.count_features)
        df['total_features'] = (
            df['num_exterior_features'] + df['num_interior_features'] +
            df['num_safety_features'] + df['num_comfort_features']
        )
        
        # Variant type (premium vs base)
        premium_keywords = ['grande', 'altis', 'executive', 'vxr', 'vxl', 'top', 'premium']
        base_keywords = ['xli', 'gli', 'base', 'dx', 'vx', 'lx']
        
        df['is_premium'] = df['variant'].str.lower().apply(
            lambda x: any(k in str(x).lower() for k in premium_keywords)
        ).astype(int)
        
        df['is_base'] = df['variant'].str.lower().apply(
            lambda x: any(k in str(x).lower() for k in base_keywords)
        ).astype(int)
        
        # Engine size category
        df['engine_category'] = pd.cut(
            df['engine_capacity'].fillna(1000),
            bins=[0, 1000, 1300, 1600, 2000, float('inf')],
            labels=[0, 1, 2, 3, 4]
        ).astype(int)
        
        # Fill missing values
        df['engine_capacity'].fillna(df['engine_capacity'].median(), inplace=True)
        df['mileage'].fillna(df['mileage'].median(), inplace=True)
        
        logger.info(f"Features engineered. Total columns: {len(df.columns)}")
        return df
    
    def count_features(self, feature_string: str) -> int:
        """Count features from semicolon-separated string."""
        if pd.isna(feature_string) or feature_string == '':
            return 0
        return len([f.strip() for f in str(feature_string).split(';') if f.strip()])
    
    def encode_categorical(self, df: pd.DataFrame, fit: bool = True) -> pd.DataFrame:
        """Encode remaining categorical variables."""
        df = df.copy()
        
        categorical_cols = ['registered_in', 'body_type', 'color']
        
        for col in categorical_cols:
            if col not in df.columns:
                continue
            
            if fit:
                le = LabelEncoder()
                df[col] = le.fit_transform(df[col].astype(str))
                self.label_encoders[col] = le
            else:
                if col in self.label_encoders:
                    le = self.label_encoders[col]
                    df[col] = df[col].apply(
                        lambda x: le.transform([str(x)])[0] if str(x) in le.classes_ else 0
                    )
        
        return df
    
    def prepare_data(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
        """Complete data preparation pipeline."""
        logger.info("="*70)
        logger.info("DATA PREPARATION PIPELINE")
        logger.info("="*70)
        
        # Create variant key
        df = self.create_variant_key(df)
        
        # Remove outliers
        Q01 = df['price'].quantile(0.005)
        Q99 = df['price'].quantile(0.995)
        initial_size = len(df)
        df = df[(df['price'] >= Q01) & (df['price'] <= Q99)]
        
        # Remove unrealistic data
        df = df[df['mileage'] <= 500000]
        df = df[df['model_year'] >= 1975]
        df = df[df['model_year'] <= 2025]
        df = df[df['price'] >= 100000]
        
        logger.info(f"Cleaned data: {initial_size} → {len(df)} rows")
        
        # Calculate reference prices
        self.calculate_reference_prices(df)
        
        # Engineer features
        df = self.engineer_features(df)
        
        # Calculate depreciation rate (target)
        df = self.calculate_depreciation_rate(df)
        
        # Encode categoricals
        df = self.encode_categorical(df, fit=True)
        
        # Select features
        feature_cols = [
            # Age features (PRIMARY)
            'age', 'age_squared', 'age_cubed',
            
            # Mileage features (SECONDARY)
            'mileage', 'mileage_per_year', 'mileage_category',
            'high_mileage', 'very_high_mileage',
            
            # Condition (CRITICAL)
            'condition_score',
            
            # Specs (TERTIARY)
            'is_automatic', 'is_imported', 'major_city',
            'engine_capacity', 'engine_category',
            
            # Features (MINOR)
            'total_features', 'num_exterior_features',
            
            # Variant type
            'is_premium', 'is_base',
            
            # Others
            'registered_in', 'body_type'
        ]
        
        available_features = [f for f in feature_cols if f in df.columns]
        X = df[available_features].copy()
        y = df['depreciation_rate'].copy()  # TARGET: depreciation rate, not price!
        
        self.feature_names = X.columns.tolist()
        self.df_full = df.copy()  # Store for later analysis
        
        logger.info(f"Prepared {len(X)} samples with {len(self.feature_names)} features")
        logger.info(f"Target: Depreciation Rate (0 = no depreciation, 0.5 = 50% depreciation)")
        logger.info("="*70)
        
        return X, y
    
    def train_depreciation_model(self, X: pd.DataFrame, y: pd.Series):
        """
        Train model to predict depreciation rate based on age, condition, mileage.
        """
        logger.info("\n" + "="*70)
        logger.info("TRAINING DEPRECIATION PREDICTION MODEL")
        logger.info("="*70)
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.15, random_state=self.random_state
        )
        
        logger.info(f"Train: {len(X_train)}, Test: {len(X_test)}")
        
        # Monotonic constraints
        # Age should increase depreciation (positive)
        # Condition score should decrease depreciation (negative)
        # Mileage should increase depreciation (positive)
        constraints = []
        for feat in self.feature_names:
            if 'age' in feat or 'mileage' in feat or 'high_mileage' in feat:
                constraints.append(1)  # More age/mileage = more depreciation
            elif 'condition_score' in feat:
                constraints.append(-1)  # Better condition = less depreciation
            else:
                constraints.append(0)
        
        # Train XGBoost
        logger.info("\nTraining XGBoost depreciation model...")
        self.xgb_model = xgb.XGBRegressor(
            objective='reg:squarederror',
            n_estimators=500,
            max_depth=8,
            learning_rate=0.05,
            subsample=0.85,
            colsample_bytree=0.85,
            min_child_weight=3,
            gamma=0.1,
            reg_alpha=0.5,
            reg_lambda=2.0,
            monotone_constraints=tuple(constraints),
            random_state=self.random_state,
            n_jobs=-1
        )
        self.xgb_model.fit(X_train, y_train, verbose=False)
        
        # Train LightGBM
        logger.info("Training LightGBM depreciation model...")
        self.lgb_model = lgb.LGBMRegressor(
            objective='regression',
            n_estimators=500,
            max_depth=8,
            learning_rate=0.05,
            subsample=0.85,
            colsample_bytree=0.85,
            min_child_samples=30,
            reg_alpha=0.5,
            reg_lambda=2.0,
            monotone_constraints=constraints,
            random_state=self.random_state,
            n_jobs=-1,
            verbose=-1
        )
        self.lgb_model.fit(X_train, y_train)
        
        # Create ensemble
        self.depreciation_model = {
            'xgb': self.xgb_model,
            'lgb': self.lgb_model,
            'weights': [0.55, 0.45]
        }
        
        # Evaluate
        y_train_pred = self.predict_depreciation(X_train)
        y_test_pred = self.predict_depreciation(X_test)
        
        train_mae = mean_absolute_error(y_train, y_train_pred)
        test_mae = mean_absolute_error(y_test, y_test_pred)
        train_r2 = r2_score(y_train, y_train_pred)
        test_r2 = r2_score(y_test, y_test_pred)
        
        logger.info(f"\nDepreciation Model Performance:")
        logger.info(f"  Train MAE: {train_mae:.4f} ({train_mae*100:.2f}% points)")
        logger.info(f"  Test MAE:  {test_mae:.4f} ({test_mae*100:.2f}% points)")
        logger.info(f"  Train R²:  {train_r2:.4f}")
        logger.info(f"  Test R²:   {test_r2:.4f}")
        
        # Feature importance
        self.log_feature_importance()
        
        # Test on actual prices
        self.evaluate_price_predictions(X_test, y_test)
        
        logger.info("="*70)
    
    def predict_depreciation(self, X: pd.DataFrame) -> np.ndarray:
        """Predict depreciation rate using ensemble."""
        pred_xgb = self.xgb_model.predict(X)
        pred_lgb = self.lgb_model.predict(X)
        
        weights = self.depreciation_model['weights']
        ensemble_pred = weights[0] * pred_xgb + weights[1] * pred_lgb
        
        # Clip to valid range
        ensemble_pred = np.clip(ensemble_pred, 0, 0.9)
        
        return ensemble_pred
    
    def evaluate_price_predictions(self, X_test, y_test_depreciation):
        """Evaluate actual price predictions."""
        logger.info("\n" + "="*70)
        logger.info("PRICE PREDICTION EVALUATION")
        logger.info("="*70)
        
        # Get test data with reference prices
        test_indices = X_test.index
        test_data = self.df_full.loc[test_indices].copy()
        
        # Predict depreciation
        pred_depreciation = self.predict_depreciation(X_test)
        
        # Calculate predicted prices
        test_data['pred_depreciation'] = pred_depreciation
        test_data['predicted_price'] = test_data['reference_price'] * (1 - pred_depreciation)
        
        # Calculate metrics
        mae = mean_absolute_error(test_data['price'], test_data['predicted_price'])
        rmse = np.sqrt(mean_squared_error(test_data['price'], test_data['predicted_price']))
        r2 = r2_score(test_data['price'], test_data['predicted_price'])
        mape = np.mean(np.abs((test_data['price'] - test_data['predicted_price']) / test_data['price'])) * 100
        
        logger.info(f"\nPrice Prediction Metrics:")
        logger.info(f"  MAE:  PKR {mae:,.0f}")
        logger.info(f"  RMSE: PKR {rmse:,.0f}")
        logger.info(f"  R²:   {r2:.4f}")
        logger.info(f"  MAPE: {mape:.2f}%")
        
        # Error distribution
        errors = test_data['predicted_price'] - test_data['price']
        pct_errors = (errors / test_data['price']) * 100
        
        logger.info(f"\nPrediction Accuracy:")
        logger.info(f"  Within ±5%:  {(np.abs(pct_errors) <= 5).mean() * 100:.1f}%")
        logger.info(f"  Within ±10%: {(np.abs(pct_errors) <= 10).mean() * 100:.1f}%")
        logger.info(f"  Within ±15%: {(np.abs(pct_errors) <= 15).mean() * 100:.1f}%")
        logger.info(f"  Within ±20%: {(np.abs(pct_errors) <= 20).mean() * 100:.1f}%")
        
        # Sample predictions
        logger.info(f"\nSample Predictions (Random 10):")
        logger.info(f"{'Variant':<45} {'Year':>4} {'Age':>3} {'Actual':>10} {'Predicted':>10} {'Error':>7}")
        logger.info("-" * 90)
        
        samples = test_data.sample(min(10, len(test_data)), random_state=42)
        for _, row in samples.iterrows():
            error_pct = ((row['predicted_price'] - row['price']) / row['price']) * 100
            logger.info(
                f"{row['variant_key'][:45]:<45} {int(row['model_year']):>4} "
                f"{int(row['age']):>3} {row['price']:>10,.0f} "
                f"{row['predicted_price']:>10,.0f} {error_pct:>6.1f}%"
            )
        
        logger.info("="*70)
    
    def log_feature_importance(self, top_n: int = 15):
        """Log feature importance."""
        importance_df = pd.DataFrame({
            'feature': self.feature_names,
            'importance': self.xgb_model.feature_importances_
        }).sort_values('importance', ascending=False)
        
        logger.info(f"\nTop {top_n} Most Important Features:")
        logger.info("-" * 50)
        for idx, row in importance_df.head(top_n).iterrows():
            logger.info(f"  {row['feature']:30s}: {row['importance']:.4f}")
    
    def train(self, df: pd.DataFrame):
        """Complete training pipeline."""
        logger.info("\n" + "="*70)
        logger.info("PAKISTANI CAR PRICE MODEL - TRAINING")
        logger.info("="*70)
        
        # Prepare data
        X, y = self.prepare_data(df)
        
        # Train depreciation model
        self.train_depreciation_model(X, y)
        
        logger.info("\n" + "="*70)
        logger.info("TRAINING COMPLETE")
        logger.info("="*70)
        logger.info(f"Model Type: Reference-Based Depreciation Model")
        logger.info(f"Reference Prices: {len(self.variant_reference_prices)} variants")
        logger.info(f"Features: {len(self.feature_names)}")
        logger.info("="*70)
    
    def save_model(self, output_dir: str = 'models'):
        """Save all model components."""
        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)
        
        logger.info(f"\nSaving models to {output_dir}...")
        
        # Save models
        self.xgb_model.save_model(str(output_path / 'depreciation_xgb.json'))
        joblib.dump(self.lgb_model, output_path / 'depreciation_lgb.pkl')
        
        # Save encoders
        joblib.dump(self.label_encoders, output_path / 'label_encoders.pkl')
        
        # Convert numpy/pandas types to native Python types for JSON serialization
        def convert_to_native(obj):
            """Recursively convert numpy/pandas types to native Python types."""
            if isinstance(obj, dict):
                return {key: convert_to_native(value) for key, value in obj.items()}
            elif isinstance(obj, list):
                return [convert_to_native(item) for item in obj]
            elif isinstance(obj, (np.integer, np.int64, np.int32)):
                return int(obj)
            elif isinstance(obj, (np.floating, np.float64, np.float32)):
                return float(obj)
            elif isinstance(obj, np.ndarray):
                return obj.tolist()
            elif pd.isna(obj):
                return None
            else:
                return obj
        
        # Save metadata with type conversion
        metadata = {
            'feature_names': self.feature_names,
            'variant_reference_prices': convert_to_native(self.variant_reference_prices),
            'variant_stats': convert_to_native(self.variant_stats),
            'model_weights': convert_to_native(self.depreciation_model['weights'])
        }
        
        with open(output_path / 'model_metadata.json', 'w') as f:
            json.dump(metadata, f, indent=2)
        
        logger.info("Model saved successfully!")
        logger.info(f"  - depreciation_xgb.json")
        logger.info(f"  - depreciation_lgb.pkl")
        logger.info(f"  - label_encoders.pkl")
        logger.info(f"  - model_metadata.json")


def main():
    """Main training pipeline."""
    
    INPUT_FILE = 'car_data.csv'
    OUTPUT_DIR = 'models'
    
    try:
        logger.info("="*70)
        logger.info("STARTING TRAINING PIPELINE")
        logger.info("="*70)
        
        # Load data
        logger.info(f"\nLoading data from {INPUT_FILE}...")
        df = pd.read_csv(INPUT_FILE)
        logger.info(f"Loaded {len(df)} rows, {len(df.columns)} columns")
        
        # Initialize and train
        model = PakistaniCarPriceModel(random_state=42)
        model.train(df)
        
        # Save
        model.save_model(OUTPUT_DIR)
        
        logger.info("\n" + "="*70)
        logger.info("TRAINING PIPELINE COMPLETE")
        logger.info("="*70)
        
    except FileNotFoundError:
        logger.error(f"File '{INPUT_FILE}' not found!")
    except Exception as e:
        logger.error(f"Error: {str(e)}", exc_info=True)


if __name__ == "__main__":
    main()