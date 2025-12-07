#!/usr/bin/env python3
"""
Synthetic HealthKit Data Generator

Generates realistic health metrics data for training ML pattern learners.
Uses published medical literature values for population distributions.

Metrics generated:
- Heart Rate Variability (HRV/SDNN)
- Resting Heart Rate
- Active Calories / Basal Energy
- Step Count
- Sleep Duration and Stages
- Respiratory Rate
- Blood Oxygen (SpO2)
- Walking/Running Distance

References:
- Shaffer & Ginsberg (2017) - HRV normative values
- Quer et al. (2020) - Wearable data patterns
- Ohayon et al. (2017) - Sleep duration meta-analysis
"""

import json
import os
import sys
from datetime import datetime, timedelta
import random
import math

import numpy as np
import pandas as pd

# Population parameters from medical literature
POPULATION_PARAMS = {
    # HRV (SDNN in ms) - decreases with age, higher in males
    # Source: Shaffer & Ginsberg (2017), Nunan et al. (2010)
    "hrv_sdnn": {
        "18-29": {"male": {"mean": 55, "std": 20}, "female": {"mean": 50, "std": 18}},
        "30-39": {"male": {"mean": 50, "std": 18}, "female": {"mean": 45, "std": 16}},
        "40-49": {"male": {"mean": 42, "std": 15}, "female": {"mean": 40, "std": 14}},
        "50-59": {"male": {"mean": 35, "std": 12}, "female": {"mean": 35, "std": 12}},
        "60-69": {"male": {"mean": 30, "std": 10}, "female": {"mean": 30, "std": 10}},
        "70+":   {"male": {"mean": 25, "std": 8},  "female": {"mean": 25, "std": 8}},
    },
    
    # Resting Heart Rate (bpm) - affected by fitness level
    # Source: Various meta-analyses, Apple Heart Study data
    "resting_hr": {
        "sedentary":  {"mean": 75, "std": 8},
        "moderate":   {"mean": 68, "std": 7},
        "active":     {"mean": 62, "std": 6},
        "athletic":   {"mean": 55, "std": 5},
    },
    
    # Sleep duration (hours) - varies by age
    # Source: Ohayon et al. (2017), National Sleep Foundation
    "sleep_duration": {
        "18-29": {"mean": 7.2, "std": 1.2},
        "30-39": {"mean": 7.0, "std": 1.1},
        "40-49": {"mean": 6.8, "std": 1.0},
        "50-59": {"mean": 6.6, "std": 1.0},
        "60-69": {"mean": 6.5, "std": 1.1},
        "70+":   {"mean": 6.3, "std": 1.2},
    },
    
    # Sleep stages (% of total sleep)
    # Source: Sleep research literature
    "sleep_stages": {
        "deep":  {"mean": 0.15, "std": 0.05},   # 10-20% typically
        "rem":   {"mean": 0.22, "std": 0.04},   # 20-25%
        "core":  {"mean": 0.50, "std": 0.08},   # 45-55%
        "awake": {"mean": 0.08, "std": 0.03},   # 5-10%
    },
    
    # Daily steps by activity level
    "daily_steps": {
        "sedentary":  {"mean": 3500, "std": 1500},
        "moderate":   {"mean": 7000, "std": 2000},
        "active":     {"mean": 10000, "std": 2500},
        "athletic":   {"mean": 14000, "std": 3000},
    },
    
    # Active calories (kcal) by activity level
    "active_calories": {
        "sedentary":  {"mean": 200, "std": 80},
        "moderate":   {"mean": 400, "std": 120},
        "active":     {"mean": 600, "std": 150},
        "athletic":   {"mean": 900, "std": 200},
    },
    
    # Respiratory rate (breaths/min)
    "respiratory_rate": {
        "normal": {"mean": 14, "std": 2},
    },
    
    # Blood oxygen SpO2 (%)
    "spo2": {
        "healthy": {"mean": 97.5, "std": 1.0, "min": 94, "max": 100},
    },
    
    # Walking/Running distance (km)
    "distance_km": {
        "sedentary":  {"mean": 2.5, "std": 1.2},
        "moderate":   {"mean": 5.0, "std": 1.8},
        "active":     {"mean": 8.0, "std": 2.5},
        "athletic":   {"mean": 12.0, "std": 3.5},
    },
}

# Circadian patterns (hour of day effects)
CIRCADIAN_PATTERNS = {
    # Heart rate varies throughout day (multiplier)
    "heart_rate": [
        0.92, 0.90, 0.88, 0.87, 0.86, 0.88,  # 0-5am (sleeping)
        0.92, 0.98, 1.02, 1.05, 1.06, 1.05,  # 6-11am (morning)
        1.04, 1.03, 1.05, 1.08, 1.10, 1.08,  # 12-5pm (afternoon)
        1.05, 1.02, 0.98, 0.95, 0.94, 0.93,  # 6-11pm (evening)
    ],
    
    # HRV tends to be higher at night/rest
    "hrv": [
        1.15, 1.18, 1.20, 1.22, 1.20, 1.15,  # 0-5am
        1.05, 0.95, 0.88, 0.85, 0.85, 0.88,  # 6-11am
        0.90, 0.92, 0.88, 0.85, 0.85, 0.88,  # 12-5pm
        0.92, 0.95, 1.00, 1.05, 1.10, 1.12,  # 6-11pm
    ],
    
    # Activity peaks mid-day
    "activity": [
        0.05, 0.02, 0.01, 0.01, 0.02, 0.05,  # 0-5am
        0.15, 0.25, 0.40, 0.55, 0.60, 0.50,  # 6-11am
        0.45, 0.55, 0.60, 0.65, 0.70, 0.75,  # 12-5pm
        0.65, 0.50, 0.35, 0.20, 0.10, 0.08,  # 6-11pm
    ],
}

# Day of week patterns (weekday vs weekend)
DAY_PATTERNS = {
    # Activity reduction on weekends for office workers
    "steps_multiplier": {
        0: 0.85,  # Monday
        1: 1.00,  # Tuesday
        2: 1.00,  # Wednesday
        3: 1.00,  # Thursday
        4: 0.95,  # Friday
        5: 0.80,  # Saturday
        6: 0.75,  # Sunday
    },
    # Sleep increases on weekends
    "sleep_multiplier": {
        0: 0.95, 1: 1.00, 2: 1.00, 3: 1.00, 4: 1.00,
        5: 1.15, 6: 1.10,
    },
}


class VirtualPerson:
    """Represents a virtual person with consistent characteristics."""
    
    def __init__(self, person_id: int, age_group: str = None, sex: str = None, 
                 activity_level: str = None):
        self.person_id = person_id
        
        # Assign demographics if not specified
        self.age_group = age_group or random.choice(
            ["18-29", "30-39", "40-49", "50-59", "60-69", "70+"]
        )
        self.sex = sex or random.choice(["male", "female"])
        self.activity_level = activity_level or random.choices(
            ["sedentary", "moderate", "active", "athletic"],
            weights=[0.25, 0.40, 0.25, 0.10]
        )[0]
        
        # Personal baseline offsets (individual variation)
        self.hrv_offset = np.random.normal(0, 0.15)  # +/- 15% individual variation
        self.hr_offset = np.random.normal(0, 0.10)
        self.sleep_offset = np.random.normal(0, 0.10)
        self.activity_offset = np.random.normal(0, 0.15)
        
        # Sleep schedule
        self.typical_bedtime = random.gauss(22.5, 1.0)  # 10:30 PM +/- 1hr
        self.wake_variation = random.gauss(0, 0.5)
        
    def get_hrv(self, hour: int) -> float:
        """Generate HRV value for given hour."""
        params = POPULATION_PARAMS["hrv_sdnn"][self.age_group][self.sex]
        base = params["mean"] * (1 + self.hrv_offset)
        circadian = CIRCADIAN_PATTERNS["hrv"][hour]
        noise = np.random.normal(0, params["std"] * 0.5)
        return max(10, base * circadian + noise)
    
    def get_resting_hr(self, hour: int) -> float:
        """Generate resting heart rate for given hour."""
        params = POPULATION_PARAMS["resting_hr"][self.activity_level]
        base = params["mean"] * (1 + self.hr_offset)
        circadian = CIRCADIAN_PATTERNS["heart_rate"][hour]
        noise = np.random.normal(0, params["std"] * 0.3)
        return max(40, min(100, base * circadian + noise))
    
    def get_sleep_duration(self, day_of_week: int) -> float:
        """Generate sleep duration for given day."""
        params = POPULATION_PARAMS["sleep_duration"][self.age_group]
        base = params["mean"] * (1 + self.sleep_offset)
        weekend = DAY_PATTERNS["sleep_multiplier"][day_of_week]
        noise = np.random.normal(0, params["std"] * 0.3)
        return max(3, min(12, base * weekend + noise))
    
    def get_sleep_stages(self, total_sleep_hours: float) -> dict:
        """Generate sleep stage breakdown."""
        stages = {}
        total_mins = total_sleep_hours * 60
        
        # Generate stage percentages
        deep_pct = max(0.05, np.random.normal(
            POPULATION_PARAMS["sleep_stages"]["deep"]["mean"],
            POPULATION_PARAMS["sleep_stages"]["deep"]["std"]
        ))
        rem_pct = max(0.10, np.random.normal(
            POPULATION_PARAMS["sleep_stages"]["rem"]["mean"],
            POPULATION_PARAMS["sleep_stages"]["rem"]["std"]
        ))
        awake_pct = max(0.02, np.random.normal(
            POPULATION_PARAMS["sleep_stages"]["awake"]["mean"],
            POPULATION_PARAMS["sleep_stages"]["awake"]["std"]
        ))
        core_pct = 1.0 - deep_pct - rem_pct - awake_pct
        
        stages["deep_minutes"] = total_mins * deep_pct
        stages["rem_minutes"] = total_mins * rem_pct
        stages["core_minutes"] = total_mins * core_pct
        stages["awake_minutes"] = total_mins * awake_pct
        
        return stages
    
    def get_daily_steps(self, day_of_week: int) -> int:
        """Generate daily step count."""
        params = POPULATION_PARAMS["daily_steps"][self.activity_level]
        base = params["mean"] * (1 + self.activity_offset)
        day_effect = DAY_PATTERNS["steps_multiplier"][day_of_week]
        noise = np.random.normal(0, params["std"] * 0.5)
        return max(500, int(base * day_effect + noise))
    
    def get_active_calories(self, day_of_week: int) -> float:
        """Generate active calories burned."""
        params = POPULATION_PARAMS["active_calories"][self.activity_level]
        base = params["mean"] * (1 + self.activity_offset)
        day_effect = DAY_PATTERNS["steps_multiplier"][day_of_week]
        noise = np.random.normal(0, params["std"] * 0.4)
        return max(50, base * day_effect + noise)
    
    def get_respiratory_rate(self) -> float:
        """Generate respiratory rate."""
        params = POPULATION_PARAMS["respiratory_rate"]["normal"]
        return max(8, min(22, np.random.normal(params["mean"], params["std"])))
    
    def get_spo2(self) -> float:
        """Generate blood oxygen saturation."""
        params = POPULATION_PARAMS["spo2"]["healthy"]
        value = np.random.normal(params["mean"], params["std"])
        return max(params["min"], min(params["max"], value))
    
    def get_distance(self, steps: int) -> float:
        """Generate walking/running distance based on steps."""
        # Average stride length varies by height/sex
        stride_m = 0.75 if self.sex == "female" else 0.78
        stride_m *= np.random.uniform(0.9, 1.1)  # Individual variation
        return (steps * stride_m) / 1000  # Convert to km


def generate_person_data(person: VirtualPerson, start_date: datetime, 
                         days: int) -> list:
    """Generate daily health data for a virtual person."""
    records = []
    
    for day_offset in range(days):
        current_date = start_date + timedelta(days=day_offset)
        day_of_week = current_date.weekday()
        
        # Generate daily metrics
        sleep_hours = person.get_sleep_duration(day_of_week)
        sleep_stages = person.get_sleep_stages(sleep_hours)
        daily_steps = person.get_daily_steps(day_of_week)
        
        record = {
            "person_id": f"synthetic_{person.person_id}",
            "date": current_date.strftime("%Y-%m-%d"),
            "age_group": person.age_group,
            "sex": person.sex,
            "activity_level": person.activity_level,
            
            # Daily aggregates
            "sleep_duration_hours": round(sleep_hours, 2),
            "deep_sleep_minutes": round(sleep_stages["deep_minutes"], 1),
            "rem_sleep_minutes": round(sleep_stages["rem_minutes"], 1),
            "core_sleep_minutes": round(sleep_stages["core_minutes"], 1),
            "awake_minutes": round(sleep_stages["awake_minutes"], 1),
            
            "daily_steps": daily_steps,
            "active_calories": round(person.get_active_calories(day_of_week), 1),
            "distance_km": round(person.get_distance(daily_steps), 2),
            
            "respiratory_rate": round(person.get_respiratory_rate(), 1),
            "spo2": round(person.get_spo2(), 1),
            
            # Resting heart rate (morning average)
            "resting_heart_rate": round(person.get_resting_hr(7), 1),
            
            # HRV (typically measured at night/rest)
            "hrv_sdnn": round(person.get_hrv(3), 1),
        }
        
        # Generate hourly heart rate samples for a few hours
        hourly_hr = []
        for hour in [7, 12, 18, 22]:  # Morning, noon, evening, night
            hourly_hr.append({
                "hour": hour,
                "heart_rate": round(person.get_resting_hr(hour), 1),
                "hrv": round(person.get_hrv(hour), 1),
            })
        record["hourly_samples"] = hourly_hr
        
        records.append(record)
    
    return records


def compute_population_baselines(all_data: list) -> dict:
    """Compute statistical baselines from generated data."""
    df = pd.DataFrame(all_data)
    
    metrics = [
        "sleep_duration_hours", "deep_sleep_minutes", "rem_sleep_minutes",
        "core_sleep_minutes", "daily_steps", "active_calories", "distance_km",
        "respiratory_rate", "spo2", "resting_heart_rate", "hrv_sdnn"
    ]
    
    def stats(series):
        s = series.dropna()
        if len(s) < 5:
            return None
        return {
            "n": int(len(s)),
            "mean": float(np.mean(s)),
            "std": float(np.std(s)),
            "median": float(np.median(s)),
            "p5": float(np.percentile(s, 5)),
            "p10": float(np.percentile(s, 10)),
            "p25": float(np.percentile(s, 25)),
            "p75": float(np.percentile(s, 75)),
            "p90": float(np.percentile(s, 90)),
            "p95": float(np.percentile(s, 95)),
            "min": float(np.min(s)),
            "max": float(np.max(s)),
        }
    
    baselines = {
        "global": {},
        "by_sex": {"male": {}, "female": {}},
        "by_age_group": {},
        "by_activity_level": {},
        "by_hour": {},  # For circadian patterns
    }
    
    # Global baselines
    for metric in metrics:
        if metric in df.columns:
            baselines["global"][metric] = stats(df[metric])
    
    # By sex
    for sex in ["male", "female"]:
        subset = df[df["sex"] == sex]
        for metric in metrics:
            if metric in subset.columns:
                s = stats(subset[metric])
                if s:
                    baselines["by_sex"][sex][metric] = s
    
    # By age group
    for age_group in df["age_group"].unique():
        subset = df[df["age_group"] == age_group]
        baselines["by_age_group"][age_group] = {}
        for metric in metrics:
            if metric in subset.columns:
                s = stats(subset[metric])
                if s:
                    baselines["by_age_group"][age_group][metric] = s
    
    # By activity level
    for level in df["activity_level"].unique():
        subset = df[df["activity_level"] == level]
        baselines["by_activity_level"][level] = {}
        for metric in metrics:
            if metric in subset.columns:
                s = stats(subset[metric])
                if s:
                    baselines["by_activity_level"][level][metric] = s
    
    # Hourly patterns (from hourly_samples)
    hourly_data = {"heart_rate": {}, "hrv": {}}
    for record in all_data:
        for sample in record.get("hourly_samples", []):
            hour = sample["hour"]
            for key in ["heart_rate", "hrv"]:
                if hour not in hourly_data[key]:
                    hourly_data[key][hour] = []
                hourly_data[key][hour].append(sample[key])
    
    for metric_name, hours_dict in hourly_data.items():
        baselines["by_hour"][metric_name] = {}
        for hour, values in hours_dict.items():
            baselines["by_hour"][metric_name][str(hour)] = stats(pd.Series(values))
    
    return baselines


def main():
    print("=" * 60)
    print("Synthetic HealthKit Data Generator")
    print("=" * 60)
    print()
    
    # Configuration
    num_people = 100
    days_per_person = 30
    start_date = datetime(2024, 1, 1)
    
    print(f"Generating data for {num_people} virtual people over {days_per_person} days...")
    print()
    
    # Create virtual population
    print("Step 1: Creating virtual population...")
    people = []
    
    # Ensure diversity in age groups
    age_groups = ["18-29", "30-39", "40-49", "50-59", "60-69", "70+"]
    for i in range(num_people):
        age_group = age_groups[i % len(age_groups)]
        sex = "male" if i % 2 == 0 else "female"
        person = VirtualPerson(i, age_group=age_group, sex=sex)
        people.append(person)
        
    print(f"  Created {len(people)} virtual people")
    
    # Generate data
    print()
    print("Step 2: Generating daily health metrics...")
    all_data = []
    
    for i, person in enumerate(people):
        person_data = generate_person_data(person, start_date, days_per_person)
        all_data.extend(person_data)
        if (i + 1) % 20 == 0:
            print(f"  Progress: {i+1}/{num_people} people")
    
    print(f"  Generated {len(all_data)} daily records")
    
    # Compute baselines
    print()
    print("Step 3: Computing population baselines...")
    baselines = compute_population_baselines(all_data)
    
    # Build output
    results = {
        "source": "Synthetic HealthKit Data Generator",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "parameters": {
            "num_people": num_people,
            "days_per_person": days_per_person,
            "start_date": start_date.strftime("%Y-%m-%d"),
        },
        "population_params_used": POPULATION_PARAMS,
        "circadian_patterns_used": CIRCADIAN_PATTERNS,
        "total_records": len(all_data),
        "baselines": baselines,
    }
    
    # Save results
    output_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Save baselines
    baselines_path = os.path.join(output_dir, "healthkit_baselines.json")
    with open(baselines_path, "w") as f:
        json.dump(results, f, indent=2)
    
    # Save raw data for training
    data_path = os.path.join(output_dir, "synthetic_healthkit_data.json")
    with open(data_path, "w") as f:
        json.dump(all_data, f, indent=2)
    
    print()
    print("=" * 60)
    print("SUCCESS!")
    print(f"  Baselines saved to: {baselines_path}")
    print(f"  Raw data saved to: {data_path}")
    print()
    print("Summary:")
    print(f"  - Global baselines: {len(baselines['global'])} metrics")
    print(f"  - Age groups: {len(baselines['by_age_group'])} groups")
    print(f"  - Activity levels: {len(baselines['by_activity_level'])} levels")
    print(f"  - Hourly patterns: {len(baselines['by_hour'])} metrics")
    print("=" * 60)
    
    return results


if __name__ == "__main__":
    main()
