# Data Files in Scripts Directory

This document describes the purpose of JSON data files in the scripts directory.

## Reference Data Files

### `healthkit_baselines.json`
- **Purpose:** Baseline reference data for HealthKit metrics
- **Status:** Reference data - keep in repo
- **Usage:** Used as reference when processing HealthKit data

### `nhanes_biomarker_baselines.json`
- **Purpose:** NHANES (National Health and Nutrition Examination Survey) biomarker baseline data
- **Status:** Reference data - keep in repo
- **Usage:** Reference ranges and baselines for biomarker analysis

### `synthetic_healthkit_data.json`
- **Purpose:** Synthetic HealthKit data for testing
- **Status:** Test data - consider moving to tests/ directory if used for automated testing
- **Usage:** May be used for testing HealthKit processing logic

## Recommendations

- Keep reference data files (`healthkit_baselines.json`, `nhanes_biomarker_baselines.json`) in repo
- If `synthetic_healthkit_data.json` is only for testing, consider moving to `tests/fixtures/` or similar



