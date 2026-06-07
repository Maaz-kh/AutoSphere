"""
Seller Comments NLP Processor for Used Car Price Prediction
Extracts structured features from unstructured seller comments in Pakistani used car listings
"""

import pandas as pd
import re
import logging
from typing import Tuple, Optional
import numpy as np

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class SellerCommentProcessor:
    """
    Processes seller comments to extract structured features for price prediction.
    Handles Paklish (Pakistani English), typos, and various seller writing styles.
    """
    
    def __init__(self):
        """Initialize the processor with normalization and pattern dictionaries."""
        
        # Comprehensive spelling correction map for Paklish and common typos
        self.correction_map = {
            # Paint/Body terms
            r'\bsell to sell\b': 'seal to seal',
            r'\bseal\s*2\s*seal\b': 'seal to seal',
            r'\bs2s\b': 'seal to seal',
            r'\bshawar\b': 'shower',
            r'\bshower\b': 'painted',
            r'\bpotine\b': 'painted',
            r'\bchat\b': 'roof',
            r'\bchaat\b': 'roof',
            r'\bdiggi\b': 'trunk',
            r'\bb2b\b': 'bumper to bumper',
            r'\bbumper\s*2\s*bumper\b': 'bumper to bumper',
            
            # Condition terms
            r'\bjanian\b': 'genuine',
            r'\bgeniun\b': 'genuine',
            r'\bgeniune\b': 'genuine',
            r'\bjeniane\b': 'genuine',
            r'\bjenuine\b': 'genuine',
            r'\bjenuin\b': 'genuine',
            r'\borignal\b': 'original',
            r'\borignial\b': 'original',
            r'\bscrachless\b': 'scratchless',
            r'\bscratchles\b': 'scratchless',
            
            # Touch/Repair terms
            r'\btuch\b': 'touch',
            r'\btuchup\b': 'touchup',
            r'\btouching\b': 'touchup',
            r'\bminar\b': 'minor',
            r'\bminer\b': 'minor',
            r'\bmajar\b': 'major',
            r'\bmejar\b': 'major',
            
            # Tyre variations
            r'\btyr\b': 'tyre',
            r'\btyres\b': 'tyre',
            r'\btires\b': 'tyre',
            r'\btire\b': 'tyre',
            
            # Ownership
            r'\b1\s*st\b': '1st',
            r'\b2\s*nd\b': '2nd',
            r'\b3\s*rd\b': '3rd',
            r'\bfirst\s*hand\b': '1st owner',
            r'\bsecond\s*hand\b': '2nd owner',
            r'\bone\s*hand\b': '1st owner',
            
            # Common phrases
            r'\btotal\s*geniune\b': 'total genuine',
            r'\bjust\s*buy\s*and\s*drive\b': 'just buy drive',
            r'\bbuy\s*n\s*drive\b': 'just buy drive',
            r'\bneat\s*n\s*clean\b': 'neat clean',
            r'\bfresh\s*import\b': 'freshly imported',
        }
        
        # Feature extraction patterns
        self._compile_patterns()
        
    def _compile_patterns(self):
        """Compile regex patterns for feature extraction."""
        
        # Exterior condition patterns (ordered by priority)
        self.exterior_patterns = {
            'accident': {
                'positive': [
                    r'\baccident(?:ed)?\b',
                    r'\b(?:major\s*)?damaged?\b',
                    r'\bhit\b',
                    r'\bcollision\b'
                ],
                'negative': [
                    r'(?:non|no|never|without)\s*(?:major\s*)?accident',
                    r'accident\s*free',
                    r'no\s*damage'
                ]
            },
            'excellent': [
                r'(?:100%|totally?|fully?|all|complete(?:ly)?)\s*(?:genuine|original)',
                r'\b(?:seal\s*to\s*seal|s2s|b2b|bumper\s*to\s*bumper)\b',
                r'\bscratchless\b',
                r'\boriginal\s*paint\b',
                r'\bmint\s*condition\b',
                r'\bbrand\s*new\s*condition\b',
                r'\bpristine\b',
                r'\bshowroom\s*condition\b',
                r'\bno\s*work\s*required\b',
                r'\bunregistered\b'  # Often implies unused/excellent
            ],
            'repainted': [
                r'\b(?:outer|full|complete|half)\s*(?:painted?|spray(?:ed)?|shower)\b',
                r'\bpainted?\b',
                r'\bspray(?:ed)?\b',
                r'\bshower\b',
                r'\bpotine\b',
                r'\bfaded\s*paint\b',
                r'\brough\b',
                r'\brepainted?\b',
                r'\bouter\s*(?:work|done)\b',
                r'(?:full|complete)\s*body\s*(?:work|paint)',
                r'\bbody\s*work\s*done\b'
            ],
            'touchup': [
                r'\btouch\s*up?s?\b',
                r'\bminor\s*(?:touch|paint|scratch|dent)s?\b',
                r'\bfew\s*(?:touch|scratches?)\b',
                r'\b(?:2|3|4|5)\s*(?:pieces?|panels?)\s*(?:touch|paint(?:ed)?)\b',
                r'\b(?:minor|small)\s*(?:work|repair)\b'
            ],
            'inner_genuine': [
                r'\binner\s*genuine\b',
                r'\binside\s*genuine\b'
            ],
            'untouched': [
                r'\buntouched\b',
                r'\bno\s*touch\b'
            ]
        }
        
        # Mechanical condition patterns
        self.mechanical_patterns = {
            'excellent': [
                r'\b(?:engine\s*)?(?:sealed?|sound(?:less)?)\b',
                r'\bpristine\s*(?:engine|mechanical)\b',
                r'\bwater\s*throwing\b',
                r'\bsmoke\s*free\b',
                r'\b(?:perfect|excellent)\s*(?:engine|mechanical|condition)\b',
                r'\bjust\s*serviced\b',
                r'\bmechanically\s*(?:sound|fit|perfect)\b',
                r'\bno\s*mechanical\s*issue\b'
            ],
            'good': [
                r'\bgood\s*(?:engine|mechanical|condition)\b',
                r'\bok\s*(?:engine|mechanical)\b',
                r'\brunning\s*(?:good|fine|condition)\b',
                r'\bno\s*(?:issue|problem)\b'
            ],
            'needs_work': [
                r'\bwork\s*required\b',
                r'\bsmoke\b(?!.*free)',
                r'\bnoise\b',
                r'\bring\b',
                r'\bpiston\b',
                r'\brepair\s*(?:needed|required)\b',
                r'\bengine\s*(?:issue|problem)\b',
                r'\bmechanical\s*(?:issue|problem)\b'
            ],
            'needs_work_negation': [
                r'no\s*work\s*required',
                r'no\s*mechanical\s*issue',
                r'no\s*(?:issue|problem)'
            ]
        }
        
        # Ownership patterns
        self.ownership_patterns = {
            '1st': [
                r'\b1st\s*(?:owner|hand)\b',
                r'\bfirst\s*(?:owner|hand)\b',
                r'\bone\s*(?:owner|hand)\b',
                r'\boriginal\s*owner\b'
            ],
            '2nd': [
                r'\b2nd\s*(?:owner|hand)\b',
                r'\bsecond\s*(?:owner|hand)\b',
                r'\btwo\s*(?:owner|hand)\b'
            ],
            '3rd': [
                r'\b3rd\s*(?:owner|hand)\b',
                r'\bthird\s*(?:owner|hand)\b',
                r'\bthree\s*(?:owner|hand)\b'
            ],
            '4th+': [
                r'\b(?:4th|5th|6th)\s*(?:owner|hand)\b',
                r'\b(?:four|five|six)\s*(?:owner|hand)\b',
                r'\bmultiple\s*owner\b'
            ]
        }
        
        # Auction grade patterns (for imported cars)
        self.grade_pattern = re.compile(
            r'(?:grade|auction\s*(?:grade|sheet)?)\s*[:\-]?\s*(\d(?:\.\d)?)|'
            r'(\d(?:\.\d)?)\s*(?:grade|auction)',
            re.IGNORECASE
        )
        
        # Interior condition patterns
        self.interior_patterns = {
            'excellent': [
                r'\bmint\s*interior\b',
                r'\bpristine\s*interior\b',
                r'\boriginal\s*interior\b',
                r'\bclean\s*interior\b',
                r'\bneat\s*(?:and\s*)?clean\b',
                r'\binterior\s*(?:10/10|9/10)\b'
            ],
            'good': [
                r'\bgood\s*interior\b',
                r'\bok\s*interior\b',
                r'\bmaintained\s*interior\b'
            ],
            'worn': [
                r'\bworn\s*(?:out\s*)?interior\b',
                r'\binterior\s*(?:work|repair)\s*(?:needed|required)\b',
                r'\bseats?\s*(?:torn|damaged)\b'
            ]
        }
        
        # Document/Registration patterns
        self.docs_patterns = {
            'complete': [
                r'\b(?:complete|all|full)\s*(?:documents?|papers?)\b',
                r'\bdocuments?\s*(?:complete|available|ok)\b',
                r'\bfile\s*complete\b'
            ],
            'token_paid': [
                r'\btoken\s*paid\b',
                r'\blife\s*time\s*token\b'
            ],
            'custom_paid': [
                r'\bcustom(?:s)?\s*paid\b',
                r'\bduty\s*paid\b'
            ]
        }
        
    def normalize_text(self, text: str) -> str:
        """
        Normalize text by lowercasing and fixing common Paklish typos.
        
        Args:
            text: Raw seller comment
            
        Returns:
            Normalized text
        """
        if not isinstance(text, str) or pd.isna(text):
            return ""
        
        text = text.lower().strip()
        
        # Apply spelling corrections
        for pattern, replacement in self.correction_map.items():
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
        
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
        
        return text
    
    def extract_exterior_condition(self, text: str) -> str:
        """
        Extract exterior/paint condition with priority-based classification.
        
        Args:
            text: Normalized seller comment
            
        Returns:
            Exterior condition category
        """
        # Priority 1: Check for accident (highest priority)
        has_accident_negative = any(
            re.search(pattern, text, re.IGNORECASE)
            for pattern in self.exterior_patterns['accident']['negative']
        )
        has_accident_positive = any(
            re.search(pattern, text, re.IGNORECASE)
            for pattern in self.exterior_patterns['accident']['positive']
        )
        
        if has_accident_positive and not has_accident_negative:
            return 'Accident/Damaged'
        
        # Check for untouched (to avoid false positives with touchup)
        is_untouched = any(
            re.search(pattern, text, re.IGNORECASE)
            for pattern in self.exterior_patterns['untouched']
        )
        
        # Priority 2: Excellent condition
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in self.exterior_patterns['excellent']):
            return 'Excellent/Genuine'
        
        # Priority 3: Fully repainted
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in self.exterior_patterns['repainted']):
            return 'Repainted/Painted'
        
        # Priority 4: Minor touchups (only if not marked as untouched)
        if not is_untouched and any(
            re.search(pattern, text, re.IGNORECASE) 
            for pattern in self.exterior_patterns['touchup']
        ):
            return 'Minor Touchup'
        
        # Priority 5: Inner genuine (implies outer is not)
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in self.exterior_patterns['inner_genuine']):
            return 'Inner Genuine Only'
        
        return 'Not Specified'
    
    def extract_mechanical_condition(self, text: str) -> str:
        """
        Extract mechanical/engine condition.
        
        Args:
            text: Normalized seller comment
            
        Returns:
            Mechanical condition category
        """
        # Check for work required with negation handling
        has_work_negation = any(
            re.search(pattern, text, re.IGNORECASE)
            for pattern in self.mechanical_patterns['needs_work_negation']
        )
        has_work_needed = any(
            re.search(pattern, text, re.IGNORECASE)
            for pattern in self.mechanical_patterns['needs_work']
        )
        
        if has_work_needed and not has_work_negation:
            return 'Needs Repair'
        
        # Check for excellent condition
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in self.mechanical_patterns['excellent']):
            return 'Excellent/Sealed'
        
        # Check for good condition
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in self.mechanical_patterns['good']):
            return 'Good'
        
        return 'Not Specified'
    
    def extract_ownership(self, text: str) -> str:
        """
        Extract ownership number (1st, 2nd, 3rd, etc.).
        
        Args:
            text: Normalized seller comment
            
        Returns:
            Ownership category
        """
        for owner_type, patterns in self.ownership_patterns.items():
            if any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns):
                return f'{owner_type} Owner'
        
        return 'Not Specified'
    
    def extract_auction_grade(self, text: str) -> Optional[str]:
        """
        Extract auction grade for imported cars.
        
        Args:
            text: Normalized seller comment
            
        Returns:
            Auction grade or None
        """
        match = self.grade_pattern.search(text)
        if match:
            grade = match.group(1) if match.group(1) else match.group(2)
            try:
                grade_val = float(grade)
                if 1.0 <= grade_val <= 6.0:
                    return f'Grade {grade}'
            except ValueError:
                pass
        
        # Check for auction sheet mention without grade
        if re.search(r'auction\s*(?:sheet|import)', text, re.IGNORECASE):
            return 'Import (Grade Not Specified)'
        
        return 'Not Specified'
    
    def extract_interior_condition(self, text: str) -> str:
        """
        Extract interior condition.
        
        Args:
            text: Normalized seller comment
            
        Returns:
            Interior condition category
        """
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in self.interior_patterns['excellent']):
            return 'Excellent/Clean'
        
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in self.interior_patterns['good']):
            return 'Good'
        
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in self.interior_patterns['worn']):
            return 'Worn/Needs Work'
        
        return 'Not Specified'
    
    def extract_documents_status(self, text: str) -> str:
        """
        Extract document/registration status.
        
        Args:
            text: Normalized seller comment
            
        Returns:
            Document status
        """
        status_parts = []
        
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in self.docs_patterns['complete']):
            status_parts.append('Complete Docs')
        
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in self.docs_patterns['token_paid']):
            status_parts.append('Token Paid')
        
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in self.docs_patterns['custom_paid']):
            status_parts.append('Custom Paid')
        
        return ', '.join(status_parts) if status_parts else 'Not Specified'
    
    def extract_all_features(self, text: str) -> Tuple[str, str, str, str, str, str]:
        """
        Extract all features from seller comment.
        
        Args:
            text: Raw seller comment
            
        Returns:
            Tuple of (exterior, mechanical, ownership, auction_grade, interior, documents)
        """
        normalized = self.normalize_text(text)
        
        exterior = self.extract_exterior_condition(normalized)
        mechanical = self.extract_mechanical_condition(normalized)
        ownership = self.extract_ownership(normalized)
        auction_grade = self.extract_auction_grade(normalized)
        interior = self.extract_interior_condition(normalized)
        documents = self.extract_documents_status(normalized)
        
        return exterior, mechanical, ownership, auction_grade, interior, documents
    
    def process_dataframe(self, df: pd.DataFrame, comment_col: str = 'seller_comments') -> pd.DataFrame:
        """
        Process entire dataframe and add extracted features.
        
        Args:
            df: Input dataframe with seller comments
            comment_col: Name of the seller comments column
            
        Returns:
            Dataframe with new feature columns
        """
        logger.info(f"Processing {len(df)} rows...")
        
        if comment_col not in df.columns:
            raise ValueError(f"Column '{comment_col}' not found in dataframe")
        
        # Define new column names
        new_columns = [
            'exterior_condition',
            'mechanical_condition',
            'ownership_number',
            'auction_grade',
            'interior_condition',
            'documents_status'
        ]
        
        # Extract features for all rows
        logger.info("Extracting features from seller comments...")
        extracted_features = df[comment_col].apply(self.extract_all_features)
        
        # Convert to dataframe
        features_df = pd.DataFrame(
            extracted_features.tolist(),
            columns=new_columns,
            index=df.index
        )
        
        # Insert new columns before seller_comments
        col_index = df.columns.get_loc(comment_col)
        
        # Create final column order
        cols = df.columns.tolist()
        final_order = cols[:col_index] + new_columns + cols[col_index:]
        
        # Concatenate and reorder
        result_df = pd.concat([df, features_df], axis=1)
        result_df = result_df[final_order]
        
        # Log statistics
        self._log_statistics(result_df, new_columns)
        
        logger.info("Processing complete!")
        return result_df
    
    def _log_statistics(self, df: pd.DataFrame, new_columns: list):
        """Log statistics about extracted features."""
        logger.info("\n" + "="*60)
        logger.info("FEATURE EXTRACTION STATISTICS")
        logger.info("="*60)
        
        for col in new_columns:
            logger.info(f"\n{col}:")
            value_counts = df[col].value_counts()
            for value, count in value_counts.items():
                percentage = (count / len(df)) * 100
                logger.info(f"  {value}: {count} ({percentage:.1f}%)")
        
        logger.info("\n" + "="*60)


def main():
    """Main execution function."""
    
    # Configuration
    INPUT_FILE = 'removed_rows.csv'  # Your input file
    OUTPUT_FILE = 'processed_car_data_with_features.csv'  # Output file
    COMMENT_COLUMN = 'seller_comments'  # Name of seller comments column
    
    try:
        # Load data
        logger.info(f"Loading data from {INPUT_FILE}...")
        df = pd.read_csv(INPUT_FILE)
        logger.info(f"Loaded {len(df)} rows, {len(df.columns)} columns")
        
        # Initialize processor
        processor = SellerCommentProcessor()
        
        # Process comments
        df_processed = processor.process_dataframe(df, COMMENT_COLUMN)
        
        # Display sample results
        logger.info("\nSample of extracted features:")
        display_cols = [
            'exterior_condition',
            'mechanical_condition', 
            'ownership_number',
            'auction_grade',
            'interior_condition',
            'documents_status',
            COMMENT_COLUMN
        ]
        # Only display columns that exist
        display_cols = [col for col in display_cols if col in df_processed.columns]
        print("\n" + df_processed[display_cols].head(10).to_string())
        
        # Save results
        logger.info(f"\nSaving results to {OUTPUT_FILE}...")
        df_processed.to_csv(OUTPUT_FILE, index=False)
        logger.info("Done!")
        
    except FileNotFoundError:
        logger.error(f"File '{INPUT_FILE}' not found. Please check the file path.")
    except Exception as e:
        logger.error(f"An error occurred: {str(e)}", exc_info=True)


if __name__ == "__main__":
    main()