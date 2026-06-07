# Cleaning after 64987
import pandas as pd
import numpy as np

def clean_car_data(input_csv, output_csv):
    # Load CSV
    df = pd.read_csv(input_csv)

    # --- 1. Remove rows with missing or empty price ---
    df['price'] = df['price'].replace('', pd.NA)
        
    df = df.dropna(subset=['price'])

    # --- 2. Remove duplicate ad_ref values ---
    df = df.drop_duplicates(subset=['ad_ref'], keep='first')

    # Ensure engine_capacity is numeric
    df['engine_capacity'] = pd.to_numeric(df['engine_capacity'], errors='coerce')

    # Remove rows where engine_capacity is NaN
    df = df.dropna(subset=['engine_capacity'])

    # --- 3. Apply engine capacity rules ---

    # Remove rows where engine_capacity < 600
    df = df[df['engine_capacity'] >= 600]

    # Apply fixed value ranges
    conditions = [
        df['engine_capacity'].between(600, 659),
        df['engine_capacity'].between(750, 899),
        df['engine_capacity'].between(900, 1100),
        df['engine_capacity'].between(1101, 1249),
        df['engine_capacity'].between(1250, 1349),
        df['engine_capacity'].between(1350, 1449),
        df['engine_capacity'].between(1450, 1549),
        df['engine_capacity'].between(1550, 1649),
        df['engine_capacity'].between(1650, 1849),
        df['engine_capacity'].between(1850, 2149)
    ]
    
    values = [
        660,  # 600–659
        800,  # 750–899
        1000, # 900–1100
        1200, # 1101–1249
        1300, # 1250–1349
        1400, # 1350–1449
        1500, # 1450–1549
        1600, # 1550–1649
        1800, # 1650–1849
        2000  # 1850–2149
    ]
    
    df['engine_capacity'] = np.select(conditions, values, default=df['engine_capacity'])

    # --- 4. Round 2149–7000 to nearest 100 ---
    mask = df['engine_capacity'].between(2149, 7000)
    df.loc[mask, 'engine_capacity'] = (df.loc[mask, 'engine_capacity'] / 100).round() * 100

    # Save cleaned file
    df.to_csv(output_csv, index=False)

    print("Cleaning complete!")
    print(f"Rows after cleaning: {len(df)}")
    print(f"Cleaned CSV saved as: {output_csv}")

# Run the function
clean_car_data(input_csv="cars_data.csv", output_csv="car_data.csv")