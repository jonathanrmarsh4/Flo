-- Migration to add extended vital signs columns to user_daily_metrics table in Supabase
-- Run this in Supabase SQL Editor if the columns don't exist

-- Add new vital signs columns if they don't exist
DO $$ 
BEGIN
    -- Walking heart rate average
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_daily_metrics' AND column_name = 'walking_hr_avg_bpm'
    ) THEN
        ALTER TABLE user_daily_metrics ADD COLUMN walking_hr_avg_bpm REAL;
    END IF;

    -- Oxygen saturation percentage
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_daily_metrics' AND column_name = 'oxygen_saturation_pct'
    ) THEN
        ALTER TABLE user_daily_metrics ADD COLUMN oxygen_saturation_pct REAL;
    END IF;

    -- Respiratory rate (breaths per minute)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_daily_metrics' AND column_name = 'respiratory_rate_bpm'
    ) THEN
        ALTER TABLE user_daily_metrics ADD COLUMN respiratory_rate_bpm REAL;
    END IF;

    -- Body temperature in Celsius
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_daily_metrics' AND column_name = 'body_temp_c'
    ) THEN
        ALTER TABLE user_daily_metrics ADD COLUMN body_temp_c REAL;
    END IF;

    -- Basal energy burned (kcal)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_daily_metrics' AND column_name = 'basal_energy_kcal'
    ) THEN
        ALTER TABLE user_daily_metrics ADD COLUMN basal_energy_kcal REAL;
    END IF;

    -- Dietary water intake (ml)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_daily_metrics' AND column_name = 'dietary_water_ml'
    ) THEN
        ALTER TABLE user_daily_metrics ADD COLUMN dietary_water_ml REAL;
    END IF;

    RAISE NOTICE 'Vital signs columns migration completed successfully';
END $$;

-- Add comments documenting the columns
COMMENT ON COLUMN user_daily_metrics.walking_hr_avg_bpm IS 'Average heart rate during walking (bpm) - from Apple Watch walkingHeartRateAverage';
COMMENT ON COLUMN user_daily_metrics.oxygen_saturation_pct IS 'Blood oxygen saturation percentage (0-100) - from Apple Watch SpO2';
COMMENT ON COLUMN user_daily_metrics.respiratory_rate_bpm IS 'Average respiratory rate (breaths per minute) - from Apple Watch sleep analysis';
COMMENT ON COLUMN user_daily_metrics.body_temp_c IS 'Body temperature in Celsius - from Apple Watch or manual entry';
COMMENT ON COLUMN user_daily_metrics.basal_energy_kcal IS 'Basal metabolic energy burned (kcal) - resting metabolism from HealthKit';
COMMENT ON COLUMN user_daily_metrics.dietary_water_ml IS 'Dietary water intake (milliliters) - from Apple Health water tracking';
