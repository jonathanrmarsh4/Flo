#!/usr/bin/env python3
"""
NHANES Biomarker Data Fetcher

Downloads and processes blood work data from the CDC's National Health and 
Nutrition Examination Survey (NHANES) 2021-2023 cycle.

Biomarkers included:
- Total Cholesterol, HDL, LDL, Triglycerides
- HbA1c (glycated hemoglobin)
- Fasting Glucose
- CRP (C-reactive protein)
- Creatinine
- Complete Blood Count (CBC): WBC, RBC, Hemoglobin, Hematocrit, Platelets

Output: JSON file with population baselines by age group and sex
"""

import json
import os
import sys
from io import BytesIO
from urllib.request import urlopen
from datetime import datetime

import pandas as pd
import numpy as np

# NHANES 2021-2023 data file URLs
NHANES_BASE_URL = "https://wwwn.cdc.gov/Nchs/Nhanes/2021-2023"

DATA_FILES = {
    # Demographics (for age, sex)
    "demographics": f"{NHANES_BASE_URL}/DEMO_L.XPT",
    
    # Lipid Panel
    "cholesterol_total": f"{NHANES_BASE_URL}/TCHOL_L.XPT",
    "cholesterol_hdl": f"{NHANES_BASE_URL}/HDL_L.XPT",
    "triglycerides_ldl": f"{NHANES_BASE_URL}/TRIGLY_L.XPT",
    
    # Glycemic markers
    "glycohemoglobin": f"{NHANES_BASE_URL}/GHB_L.XPT",  # HbA1c
    "plasma_glucose": f"{NHANES_BASE_URL}/GLU_L.XPT",   # Fasting glucose
    
    # Inflammation
    "crp": f"{NHANES_BASE_URL}/HSCRP_L.XPT",  # High-sensitivity CRP
    
    # Kidney function
    "biochemistry": f"{NHANES_BASE_URL}/BIOPRO_L.XPT",  # Includes creatinine, albumin, etc.
    
    # Complete Blood Count
    "cbc": f"{NHANES_BASE_URL}/CBC_L.XPT",
}

# Variable mappings (NHANES variable name -> our standardized name)
VARIABLE_MAPPINGS = {
    # Demographics
    "RIDAGEYR": "age",
    "RIAGENDR": "sex",  # 1=Male, 2=Female
    
    # Lipids (mg/dL)
    "LBXTC": "total_cholesterol",
    "LBDHDD": "hdl_cholesterol", 
    "LBDLDL": "ldl_cholesterol",
    "LBXTR": "triglycerides",
    
    # Glycemic (%)
    "LBXGH": "hba1c",
    
    # Glucose (mg/dL)
    "LBXGLU": "fasting_glucose",
    
    # Inflammation (mg/L)
    "LBXHSCRP": "crp",
    
    # Kidney (mg/dL for creatinine, g/dL for albumin)
    "LBXSCR": "creatinine",
    "LBXSAL": "albumin",
    "LBXSBU": "bun",  # Blood urea nitrogen
    
    # CBC
    "LBXWBCSI": "wbc",          # White blood cells (1000 cells/uL)
    "LBXRBCSI": "rbc",          # Red blood cells (million cells/uL)
    "LBXHGB": "hemoglobin",     # g/dL
    "LBXHCT": "hematocrit",     # %
    "LBXPLTSI": "platelets",    # 1000 cells/uL
    "LBXMCVSI": "mcv",          # Mean corpuscular volume (fL)
    "LBXMC": "mchc",            # Mean corpuscular hemoglobin concentration (g/dL)
}

# Age groups for stratification
AGE_GROUPS = [
    (18, 29, "18-29"),
    (30, 39, "30-39"),
    (40, 49, "40-49"),
    (50, 59, "50-59"),
    (60, 69, "60-69"),
    (70, 79, "70-79"),
    (80, 150, "80+"),
]

# Biomarker metadata (units, clinical reference ranges)
BIOMARKER_METADATA = {
    "total_cholesterol": {"unit": "mg/dL", "desirable": "<200", "borderline": "200-239", "high": ">=240"},
    "hdl_cholesterol": {"unit": "mg/dL", "low_male": "<40", "low_female": "<50", "optimal": ">=60"},
    "ldl_cholesterol": {"unit": "mg/dL", "optimal": "<100", "near_optimal": "100-129", "borderline": "130-159", "high": ">=160"},
    "triglycerides": {"unit": "mg/dL", "normal": "<150", "borderline": "150-199", "high": "200-499", "very_high": ">=500"},
    "hba1c": {"unit": "%", "normal": "<5.7", "prediabetes": "5.7-6.4", "diabetes": ">=6.5"},
    "fasting_glucose": {"unit": "mg/dL", "normal": "<100", "prediabetes": "100-125", "diabetes": ">=126"},
    "crp": {"unit": "mg/L", "low_risk": "<1.0", "average_risk": "1.0-3.0", "high_risk": ">3.0"},
    "creatinine": {"unit": "mg/dL", "normal_male": "0.7-1.3", "normal_female": "0.6-1.1"},
    "albumin": {"unit": "g/dL", "normal": "3.5-5.5"},
    "bun": {"unit": "mg/dL", "normal": "7-20"},
    "wbc": {"unit": "1000 cells/uL", "normal": "4.5-11.0"},
    "rbc": {"unit": "million cells/uL", "normal_male": "4.7-6.1", "normal_female": "4.2-5.4"},
    "hemoglobin": {"unit": "g/dL", "normal_male": "13.5-17.5", "normal_female": "12.0-16.0"},
    "hematocrit": {"unit": "%", "normal_male": "38.3-48.6", "normal_female": "35.5-44.9"},
    "platelets": {"unit": "1000 cells/uL", "normal": "150-400"},
    "mcv": {"unit": "fL", "normal": "80-100"},
    "mchc": {"unit": "g/dL", "normal": "32-36"},
}


def download_xpt(url: str) -> pd.DataFrame:
    """Download and parse a SAS XPT file from NHANES."""
    print(f"  Downloading: {url.split('/')[-1]}...")
    try:
        response = urlopen(url, timeout=60)
        data = BytesIO(response.read())
        df = pd.read_sas(data, format='xport')
        print(f"    -> {len(df)} records")
        return df
    except Exception as e:
        print(f"    -> ERROR: {e}")
        return pd.DataFrame()


def get_age_group(age: float) -> str:
    """Map age to age group string."""
    for min_age, max_age, label in AGE_GROUPS:
        if min_age <= age <= max_age:
            return label
    return "unknown"


def compute_baselines(df: pd.DataFrame, biomarker: str) -> dict:
    """Compute statistical baselines for a biomarker."""
    if biomarker not in df.columns or df[biomarker].isna().all():
        return None
    
    values = df[biomarker].dropna()
    if len(values) < 10:
        return None
    
    return {
        "n": int(len(values)),
        "mean": float(np.mean(values)),
        "std": float(np.std(values)),
        "median": float(np.median(values)),
        "p5": float(np.percentile(values, 5)),
        "p10": float(np.percentile(values, 10)),
        "p25": float(np.percentile(values, 25)),
        "p75": float(np.percentile(values, 75)),
        "p90": float(np.percentile(values, 90)),
        "p95": float(np.percentile(values, 95)),
        "min": float(np.min(values)),
        "max": float(np.max(values)),
    }


def main():
    print("=" * 60)
    print("NHANES Biomarker Data Fetcher")
    print("=" * 60)
    print()
    
    # Download all data files
    print("Step 1: Downloading NHANES 2021-2023 data files...")
    datasets = {}
    for name, url in DATA_FILES.items():
        datasets[name] = download_xpt(url)
    
    print()
    print("Step 2: Merging datasets on participant ID (SEQN)...")
    
    # Start with demographics
    merged = datasets["demographics"][["SEQN", "RIDAGEYR", "RIAGENDR"]].copy()
    merged = merged[merged["RIDAGEYR"] >= 18]  # Adults only
    print(f"  Adults (18+): {len(merged)} participants")
    
    # Merge each lab dataset
    for name, df in datasets.items():
        if name == "demographics" or df.empty:
            continue
        
        # Get relevant columns
        cols_to_merge = ["SEQN"] + [c for c in df.columns if c in VARIABLE_MAPPINGS]
        if len(cols_to_merge) > 1:
            merged = merged.merge(df[cols_to_merge], on="SEQN", how="left")
            print(f"  Merged {name}: {len(cols_to_merge)-1} variables")
    
    # Rename columns to standardized names
    rename_map = {k: v for k, v in VARIABLE_MAPPINGS.items() if k in merged.columns}
    merged = merged.rename(columns=rename_map)
    
    # Add age group and sex labels
    merged["age_group"] = merged["age"].apply(get_age_group)
    merged["sex_label"] = merged["sex"].map({1: "male", 2: "female"})
    
    print(f"\nFinal dataset: {len(merged)} participants, {len(merged.columns)} columns")
    
    # Get list of biomarkers we have
    biomarkers = [v for k, v in VARIABLE_MAPPINGS.items() 
                  if v not in ["age", "sex"] and v in merged.columns]
    print(f"Biomarkers available: {len(biomarkers)}")
    
    print()
    print("Step 3: Computing population baselines...")
    
    results = {
        "source": "NHANES 2021-2023",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "total_participants": int(len(merged)),
        "biomarker_metadata": BIOMARKER_METADATA,
        "baselines": {
            "global": {},
            "by_sex": {"male": {}, "female": {}},
            "by_age_group": {},
            "by_age_and_sex": {},
        }
    }
    
    # Global baselines (all adults)
    print("  Computing global baselines...")
    for biomarker in biomarkers:
        baseline = compute_baselines(merged, biomarker)
        if baseline:
            results["baselines"]["global"][biomarker] = baseline
    
    # By sex
    print("  Computing baselines by sex...")
    for sex_label in ["male", "female"]:
        subset = merged[merged["sex_label"] == sex_label]
        for biomarker in biomarkers:
            baseline = compute_baselines(subset, biomarker)
            if baseline:
                results["baselines"]["by_sex"][sex_label][biomarker] = baseline
    
    # By age group
    print("  Computing baselines by age group...")
    for _, _, age_label in AGE_GROUPS:
        subset = merged[merged["age_group"] == age_label]
        if len(subset) < 50:
            continue
        results["baselines"]["by_age_group"][age_label] = {}
        for biomarker in biomarkers:
            baseline = compute_baselines(subset, biomarker)
            if baseline:
                results["baselines"]["by_age_group"][age_label][biomarker] = baseline
    
    # By age group and sex
    print("  Computing baselines by age group and sex...")
    for _, _, age_label in AGE_GROUPS:
        for sex_label in ["male", "female"]:
            subset = merged[(merged["age_group"] == age_label) & (merged["sex_label"] == sex_label)]
            if len(subset) < 30:
                continue
            key = f"{age_label}_{sex_label}"
            results["baselines"]["by_age_and_sex"][key] = {}
            for biomarker in biomarkers:
                baseline = compute_baselines(subset, biomarker)
                if baseline:
                    results["baselines"]["by_age_and_sex"][key][biomarker] = baseline
    
    # Save results
    output_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(output_dir, "nhanes_biomarker_baselines.json")
    
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)
    
    print()
    print("=" * 60)
    print(f"SUCCESS! Baselines saved to: {output_path}")
    print()
    print("Summary:")
    print(f"  - Global baselines: {len(results['baselines']['global'])} biomarkers")
    print(f"  - By sex: {len(results['baselines']['by_sex']['male'])} biomarkers per sex")
    print(f"  - Age groups: {len(results['baselines']['by_age_group'])} groups")
    print(f"  - Age x Sex strata: {len(results['baselines']['by_age_and_sex'])} combinations")
    print("=" * 60)
    
    return results


if __name__ == "__main__":
    main()
