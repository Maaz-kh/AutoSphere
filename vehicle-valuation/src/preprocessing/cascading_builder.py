import pandas as pd
import json
from collections import Counter

def extract_make_model(model_string):
    """Extract make and model from the model string."""
    parts = str(model_string).strip().split(' ', 1)
    make = parts[0] if len(parts) > 0 else ''
    model = parts[1] if len(parts) > 1 else ''
    return make, model

def get_sorted_by_frequency(df, column):
    """Get unique values sorted by frequency."""
    counts = Counter(df[column])
    return [val for val, _ in counts.most_common()]

def build_cascading_structure(csv_file):
    """Build a hierarchical structure for cascading dropdowns."""
    
    # Read CSV file
    print("Reading CSV file...")
    df = pd.read_csv(csv_file)
    
    # Remove rows with missing critical data
    df = df.dropna(subset=['model'])
    
    # Extract make and model
    print("Extracting make and model...")
    df[['make', 'model_name']] = df['model'].apply(
        lambda x: pd.Series(extract_make_model(x))
    )
    
    # Clean data - convert all to strings and remove rows with NaN in critical fields
    print("Cleaning data...")
    # Remove rows with NaN in any field (no N/A values allowed)
    critical_fields = ['variant', 'model_year', 'transmission_type', 'registered_in', 
                      'color', 'assembly', 'engine_capacity', 'body_type']
    
    initial_count = len(df)
    df = df.dropna(subset=critical_fields)
    removed_count = initial_count - len(df)
    
    if removed_count > 0:
        print(f"  Removed {removed_count} rows with missing data")
    
    # Convert to strings
    df['variant'] = df['variant'].astype(str).str.strip()
    df['model_year'] = df['model_year'].astype(int).astype(str)
    df['transmission_type'] = df['transmission_type'].astype(str).str.strip()
    df['registered_in'] = df['registered_in'].astype(str).str.strip()
    df['color'] = df['color'].astype(str).str.strip()
    df['assembly'] = df['assembly'].astype(str).str.strip()
    df['engine_capacity'] = df['engine_capacity'].astype(str).str.strip()
    df['body_type'] = df['body_type'].astype(str).str.strip()
    
    print("Building cascading structure...")
    
    result = {
        "makes": [],
        "models": {},
        "variants": {},
        "model_years": {},
        "transmissions": {},
        "registered_in_options": [],
        "color_options": [],
        "assemblies": {},
        "engine_capacities": {},
        "body_types": {}
    }
    
    # 1. Makes (sorted by frequency)
    print("Processing makes...")
    result["makes"] = get_sorted_by_frequency(df, 'make')
    
    # 2. Models per make
    print("Processing models...")
    for make in result["makes"]:
        make_df = df[df['make'] == make]
        result["models"][make] = get_sorted_by_frequency(make_df, 'model_name')
    
    # 3. Variants per make-model
    print("Processing variants...")
    for make in result["makes"]:
        result["variants"][make] = {}
        for model in result["models"][make]:
            model_df = df[(df['make'] == make) & (df['model_name'] == model)]
            result["variants"][make][model] = get_sorted_by_frequency(model_df, 'variant')
    
    # 4. Model years per make-model-variant
    print("Processing model years...")
    for make in result["makes"]:
        result["model_years"][make] = {}
        for model in result["models"][make]:
            result["model_years"][make][model] = {}
            for variant in result["variants"][make][model]:
                variant_df = df[(df['make'] == make) & 
                               (df['model_name'] == model) & 
                               (df['variant'] == variant)]
                result["model_years"][make][model][variant] = get_sorted_by_frequency(variant_df, 'model_year')
    
    # 5. Transmissions per make-model-variant-year
    print("Processing transmissions...")
    for make in result["makes"]:
        result["transmissions"][make] = {}
        for model in result["models"][make]:
            result["transmissions"][make][model] = {}
            for variant in result["variants"][make][model]:
                result["transmissions"][make][model][variant] = {}
                for year in result["model_years"][make][model][variant]:
                    trans_df = df[(df['make'] == make) & 
                                 (df['model_name'] == model) & 
                                 (df['variant'] == variant) &
                                 (df['model_year'] == year)]
                    result["transmissions"][make][model][variant][year] = get_sorted_by_frequency(trans_df, 'transmission_type')
    
    # 6. Flat options for registered_in and color (sorted by frequency across entire dataset)
    print("Processing registered_in options...")
    result["registered_in_options"] = get_sorted_by_frequency(df, 'registered_in')
    
    print("Processing color options...")
    result["color_options"] = get_sorted_by_frequency(df, 'color')
    
    # 7. Assemblies per make-model-variant-year-transmission
    print("Processing assemblies...")
    for make in result["makes"]:
        result["assemblies"][make] = {}
        for model in result["models"][make]:
            result["assemblies"][make][model] = {}
            for variant in result["variants"][make][model]:
                result["assemblies"][make][model][variant] = {}
                for year in result["model_years"][make][model][variant]:
                    result["assemblies"][make][model][variant][year] = {}
                    for trans in result["transmissions"][make][model][variant][year]:
                        asm_df = df[(df['make'] == make) & 
                                   (df['model_name'] == model) & 
                                   (df['variant'] == variant) &
                                   (df['model_year'] == year) &
                                   (df['transmission_type'] == trans)]
                        result["assemblies"][make][model][variant][year][trans] = get_sorted_by_frequency(asm_df, 'assembly')
    
    # 8. Engine capacities per make-model-variant-year-transmission-assembly
    print("Processing engine capacities...")
    for make in result["makes"]:
        result["engine_capacities"][make] = {}
        for model in result["models"][make]:
            result["engine_capacities"][make][model] = {}
            for variant in result["variants"][make][model]:
                result["engine_capacities"][make][model][variant] = {}
                for year in result["model_years"][make][model][variant]:
                    result["engine_capacities"][make][model][variant][year] = {}
                    for trans in result["transmissions"][make][model][variant][year]:
                        result["engine_capacities"][make][model][variant][year][trans] = {}
                        for asm in result["assemblies"][make][model][variant][year][trans]:
                            eng_df = df[(df['make'] == make) & 
                                       (df['model_name'] == model) & 
                                       (df['variant'] == variant) &
                                       (df['model_year'] == year) &
                                       (df['transmission_type'] == trans) &
                                       (df['assembly'] == asm)]
                            result["engine_capacities"][make][model][variant][year][trans][asm] = get_sorted_by_frequency(eng_df, 'engine_capacity')
    
    # 9. Body types per make-model-variant-year-transmission-assembly-engine
    print("Processing body types...")
    for make in result["makes"]:
        result["body_types"][make] = {}
        for model in result["models"][make]:
            result["body_types"][make][model] = {}
            for variant in result["variants"][make][model]:
                result["body_types"][make][model][variant] = {}
                for year in result["model_years"][make][model][variant]:
                    result["body_types"][make][model][variant][year] = {}
                    for trans in result["transmissions"][make][model][variant][year]:
                        result["body_types"][make][model][variant][year][trans] = {}
                        for asm in result["assemblies"][make][model][variant][year][trans]:
                            result["body_types"][make][model][variant][year][trans][asm] = {}
                            for eng in result["engine_capacities"][make][model][variant][year][trans][asm]:
                                body_df = df[(df['make'] == make) & 
                                            (df['model_name'] == model) & 
                                            (df['variant'] == variant) &
                                            (df['model_year'] == year) &
                                            (df['transmission_type'] == trans) &
                                            (df['assembly'] == asm) &
                                            (df['engine_capacity'] == eng)]
                                result["body_types"][make][model][variant][year][trans][asm][eng] = get_sorted_by_frequency(body_df, 'body_type')
    
    return result

def save_to_json(data, output_file):
    """Save the data structure to a JSON file."""
    print(f"\nSaving to {output_file}...")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    # Get file size
    import os
    file_size = os.path.getsize(output_file)
    size_mb = file_size / (1024 * 1024)
    
    print(f"✓ Data successfully saved to {output_file}")
    print(f"✓ File size: {size_mb:.2f} MB")

def get_statistics(data):
    """Print statistics about the data."""
    total_makes = len(data['makes'])
    total_models = sum(len(models) for models in data['models'].values())
    total_variants = sum(
        len(variants)
        for make_variants in data['variants'].values()
        for variants in make_variants.values()
    )
    
    print("\n--- Data Statistics ---")
    print(f"Total Makes: {total_makes}")
    print(f"Total Models: {total_models}")
    print(f"Total Variants: {total_variants}")
    print(f"Top 5 Makes: {', '.join(data['makes'][:5])}")
    print(f"Total Registered In Options: {len(data['registered_in_options'])}")
    print(f"Total Color Options: {len(data['color_options'])}")

# Main execution
if __name__ == "__main__":
    # Configuration
    INPUT_CSV = "car_data.csv"  # Change this to your CSV file path
    OUTPUT_JSON = "vehicle_cascading_data.json"
    
    try:
        # Build the cascading structure
        vehicle_data = build_cascading_structure(INPUT_CSV)
        
        # Save to JSON
        save_to_json(vehicle_data, OUTPUT_JSON)
        
        # Print statistics
        get_statistics(vehicle_data)
        
        print("\n✓ Processing complete!")
        print("\nJSON Structure:")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("Cascading (context-dependent):")
        print("  1. makes: [array]")
        print("  2. models: {make: [models]}")
        print("  3. variants: {make: {model: [variants]}}")
        print("  4. model_years: {make: {model: {variant: [years]}}}")
        print("  5. transmissions: {make: {model: {variant: {year: [transmissions]}}}}")
        print("  6. assemblies: {make: {model: {variant: {year: {trans: [assemblies]}}}}}")
        print("  7. engine_capacities: {make: {model: {variant: {year: {trans: {asm: [engines]}}}}}}")
        print("  8. body_types: {make: {model: {variant: {year: {trans: {asm: {eng: [bodies]}}}}}}}")
        print("\nFlat options (independent of cascading):")
        print("  - registered_in_options: [all cities/regions]")
        print("  - color_options: [all colors]")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
    except FileNotFoundError:
        print(f"\n✗ Error: Could not find '{INPUT_CSV}'")
        print("Please ensure the CSV file exists in the same directory as this script.")
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()