#!/usr/bin/env python3
"""
Synthetic CGM Data Generator using simglucose (UVA/Padova simulator)

This script generates realistic glucose data for training the Flō ML model.
It simulates multiple virtual patients with various scenarios including:
- Normal daily patterns with meals
- Hypoglycemic events
- Hyperglycemic events
- Exercise-induced glucose changes
- Dawn phenomenon
- Nocturnal hypoglycemia

Output: JSON file with glucose readings that can be injected into ClickHouse
"""

import json
import sys
import os
import random
from datetime import datetime, timedelta
from typing import List, Dict, Any
import numpy as np
import pandas as pd

from simglucose.simulation.env import T1DSimEnv
from simglucose.controller.base import Controller, Action
from simglucose.sensor.cgm import CGMSensor
from simglucose.actuator.pump import InsulinPump
from simglucose.patient.t1dpatient import T1DPatient
from simglucose.simulation.scenario import CustomScenario
from simglucose.simulation.scenario_gen import RandomScenario


class SimpleBasalController(Controller):
    """Simple controller that provides constant basal insulin."""
    
    def __init__(self, basal_rate: float = 0.5):
        self.basal_rate = basal_rate
    
    def policy(self, observation, reward, done, **kwargs):
        """Return constant basal rate, no bolus."""
        return Action(basal=self.basal_rate, bolus=0)
    
    def reset(self):
        pass

PATIENTS = [
    'adolescent#001', 'adolescent#002', 'adolescent#003', 'adolescent#004', 'adolescent#005',
    'adult#001', 'adult#002', 'adult#003', 'adult#004', 'adult#005',
    'child#001', 'child#002', 'child#003'
]

CGM_SENSORS = ['Dexcom', 'GuardianRT', 'Navigator']

def create_meal_scenario(start_time: datetime, scenario_type: str = 'normal') -> CustomScenario:
    """Create different meal scenarios for diverse training data."""
    
    if scenario_type == 'normal':
        meals = [
            (7, 45),
            (12, 70),
            (18, 80),
        ]
    elif scenario_type == 'high_carb':
        meals = [
            (7, 80),
            (10, 30),
            (12, 120),
            (15, 40),
            (18, 100),
            (21, 25),
        ]
    elif scenario_type == 'low_carb':
        meals = [
            (8, 20),
            (13, 35),
            (19, 40),
        ]
    elif scenario_type == 'skipped_meals':
        meals = [
            (7, 50),
            (19, 90),
        ]
    elif scenario_type == 'exercise_day':
        meals = [
            (6, 60),
            (11, 50),
            (14, 30),
            (18, 70),
        ]
    else:
        meals = [(7, 50), (12, 60), (18, 70)]
    
    meal_times = []
    meal_amounts = []
    for hour, carbs in meals:
        meal_time = start_time.replace(hour=hour, minute=random.randint(0, 30))
        meal_times.append(meal_time)
        meal_amounts.append(carbs + random.randint(-10, 10))
    
    return CustomScenario(start_time=start_time, scenario=list(zip(meal_times, meal_amounts)))


def run_simulation(
    patient_name: str,
    days: int = 7,
    scenario_type: str = 'normal',
    seed: int = None
) -> List[Dict[str, Any]]:
    """Run a single patient simulation and return glucose readings."""
    
    if seed is None:
        seed = random.randint(1, 10000)
    
    patient = T1DPatient.withName(patient_name)
    sensor = CGMSensor.withName(random.choice(CGM_SENSORS), seed=seed)
    pump = InsulinPump.withName('Insulet')
    
    start_time = datetime.now() - timedelta(days=days)
    scenario = create_meal_scenario(start_time, scenario_type)
    
    controller = SimpleBasalController(basal_rate=random.uniform(0.3, 0.8))
    
    env = T1DSimEnv(patient, sensor, pump, scenario)
    
    readings = []
    step_result = env.reset()
    
    steps_per_day = 288
    total_steps = days * steps_per_day
    
    current_time = start_time
    
    for sim_step in range(total_steps):
        action = controller.policy(step_result, reward=0, done=False)
        
        step_result = env.step(action)
        
        if hasattr(step_result, 'observation') and hasattr(step_result.observation, 'CGM'):
            glucose_value = float(step_result.observation.CGM)
        elif hasattr(step_result, 'CGM'):
            glucose_value = float(step_result.CGM)
        else:
            continue
        
        done = step_result.done if hasattr(step_result, 'done') else False
        
        if not np.isnan(glucose_value) and glucose_value > 0:
            glucose_value += random.gauss(0, 2)
            glucose_value = max(40, min(400, glucose_value))
            
            readings.append({
                'glucose_mg_dl': round(glucose_value, 1),
                'glucose_mmol_l': round(glucose_value / 18.0182, 2),
                'timestamp': current_time.isoformat(),
                'patient_type': patient_name.split('#')[0],
                'scenario': scenario_type,
                'source': 'simglucose_synthetic',
                'trend': calculate_trend(readings),
            })
        
        current_time += timedelta(minutes=5)
        
        step_done = step_result.done if hasattr(step_result, 'done') else False
        if step_done:
            break
    
    return readings


def calculate_trend(readings: List[Dict], window: int = 3) -> str:
    """Calculate glucose trend based on recent readings."""
    if len(readings) < window:
        return 'stable'
    
    recent = [r['glucose_mg_dl'] for r in readings[-window:]]
    delta = recent[-1] - recent[0]
    rate = delta / (window * 5)
    
    if rate > 3:
        return 'rising_fast'
    elif rate > 1:
        return 'rising'
    elif rate < -3:
        return 'falling_fast'
    elif rate < -1:
        return 'falling'
    else:
        return 'stable'


def classify_glucose(value: float) -> Dict[str, Any]:
    """Classify glucose value and identify if it's an anomaly."""
    
    classification = {
        'is_hypo': value < 70,
        'is_severe_hypo': value < 54,
        'is_hyper': value > 180,
        'is_severe_hyper': value > 250,
        'is_in_range': 70 <= value <= 180,
        'range_label': 'normal'
    }
    
    if value < 54:
        classification['range_label'] = 'severe_hypo'
    elif value < 70:
        classification['range_label'] = 'hypo'
    elif value <= 180:
        classification['range_label'] = 'normal'
    elif value <= 250:
        classification['range_label'] = 'hyper'
    else:
        classification['range_label'] = 'severe_hyper'
    
    return classification


def generate_training_dataset(
    num_patients: int = 5,
    days_per_patient: int = 7,
    output_file: str = None
) -> Dict[str, Any]:
    """Generate a comprehensive training dataset with diverse scenarios."""
    
    scenarios = ['normal', 'high_carb', 'low_carb', 'skipped_meals', 'exercise_day']
    selected_patients = random.sample(PATIENTS, min(num_patients, len(PATIENTS)))
    
    all_readings = []
    patient_summaries = []
    
    for patient in selected_patients:
        scenario = random.choice(scenarios)
        print(f"Simulating {patient} with {scenario} scenario for {days_per_patient} days...", file=sys.stderr)
        
        readings = run_simulation(
            patient_name=patient,
            days=days_per_patient,
            scenario_type=scenario
        )
        
        for reading in readings:
            reading.update(classify_glucose(reading['glucose_mg_dl']))
        
        all_readings.extend(readings)
        
        glucose_values = [r['glucose_mg_dl'] for r in readings]
        patient_summaries.append({
            'patient': patient,
            'scenario': scenario,
            'readings_count': len(readings),
            'mean_glucose': round(np.mean(glucose_values), 1),
            'std_glucose': round(np.std(glucose_values), 1),
            'min_glucose': round(min(glucose_values), 1),
            'max_glucose': round(max(glucose_values), 1),
            'time_in_range': round(sum(1 for v in glucose_values if 70 <= v <= 180) / len(glucose_values) * 100, 1),
            'hypo_events': sum(1 for v in glucose_values if v < 70),
            'hyper_events': sum(1 for v in glucose_values if v > 180),
        })
    
    anomaly_patterns = identify_patterns(all_readings)
    
    dataset = {
        'generated_at': datetime.now().isoformat(),
        'total_readings': len(all_readings),
        'patients_simulated': len(selected_patients),
        'days_per_patient': days_per_patient,
        'patient_summaries': patient_summaries,
        'anomaly_patterns': anomaly_patterns,
        'readings': all_readings,
    }
    
    if output_file:
        with open(output_file, 'w') as f:
            json.dump(dataset, f, indent=2)
        print(f"Dataset saved to {output_file}", file=sys.stderr)
    
    return dataset


def identify_patterns(readings: List[Dict]) -> Dict[str, Any]:
    """Identify glucose patterns for ML training."""
    
    patterns = {
        'hypo_events': [],
        'hyper_events': [],
        'rapid_changes': [],
        'dawn_phenomenon': [],
        'nocturnal_hypos': [],
    }
    
    for i, reading in enumerate(readings):
        ts = datetime.fromisoformat(reading['timestamp'])
        glucose = reading['glucose_mg_dl']
        
        if glucose < 70:
            patterns['hypo_events'].append({
                'timestamp': reading['timestamp'],
                'glucose': glucose,
                'severity': 'severe' if glucose < 54 else 'moderate',
                'hour': ts.hour,
            })
            
            if 0 <= ts.hour <= 6:
                patterns['nocturnal_hypos'].append({
                    'timestamp': reading['timestamp'],
                    'glucose': glucose,
                })
        
        if glucose > 180:
            patterns['hyper_events'].append({
                'timestamp': reading['timestamp'],
                'glucose': glucose,
                'severity': 'severe' if glucose > 250 else 'moderate',
                'hour': ts.hour,
            })
        
        if 4 <= ts.hour <= 8 and glucose > 140:
            patterns['dawn_phenomenon'].append({
                'timestamp': reading['timestamp'],
                'glucose': glucose,
            })
        
        if i >= 3:
            prev_glucose = readings[i-3]['glucose_mg_dl']
            delta = abs(glucose - prev_glucose)
            if delta > 30:
                patterns['rapid_changes'].append({
                    'timestamp': reading['timestamp'],
                    'glucose': glucose,
                    'delta': delta,
                    'direction': 'rising' if glucose > prev_glucose else 'falling',
                })
    
    return {
        'hypo_count': len(patterns['hypo_events']),
        'hyper_count': len(patterns['hyper_events']),
        'rapid_change_count': len(patterns['rapid_changes']),
        'dawn_phenomenon_count': len(patterns['dawn_phenomenon']),
        'nocturnal_hypo_count': len(patterns['nocturnal_hypos']),
        'sample_hypos': patterns['hypo_events'][:10],
        'sample_hypers': patterns['hyper_events'][:10],
        'sample_rapid_changes': patterns['rapid_changes'][:10],
    }


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Generate synthetic CGM data for ML training')
    parser.add_argument('--patients', type=int, default=5, help='Number of patients to simulate')
    parser.add_argument('--days', type=int, default=7, help='Days per patient')
    parser.add_argument('--output', type=str, default='synthetic_cgm_data.json', help='Output file path')
    parser.add_argument('--summary-only', action='store_true', help='Only output summary stats')
    
    args = parser.parse_args()
    
    print(f"Generating synthetic CGM data: {args.patients} patients x {args.days} days", file=sys.stderr)
    
    dataset = generate_training_dataset(
        num_patients=args.patients,
        days_per_patient=args.days,
        output_file=args.output if not args.summary_only else None
    )
    
    if args.summary_only:
        summary = {k: v for k, v in dataset.items() if k != 'readings'}
        print(json.dumps(summary, indent=2))
    else:
        print(json.dumps({'status': 'success', 'readings_generated': dataset['total_readings'], 'output_file': args.output}))
