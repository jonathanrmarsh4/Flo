-- Migration to add extended vital signs columns to user_daily_metrics table in Supabase
-- Run this in Supabase SQL Editor

-- STEP 1: Convert existing INTEGER columns to REAL (if they exist as INTEGER)
-- This fixes the "invalid input syntax for type integer" error when iOS sends decimals
DO $$
DECLARE
    col_type TEXT;
BEGIN
    -- Check and convert walking_hr_avg_bpm if it's INTEGER
    SELECT data_type INTO col_type FROM information_schema.columns 
    WHERE table_name = 'user_daily_metrics' AND column_name = 'walking_hr_avg_bpm';
    IF col_type = 'integer' THEN
        ALTER TABLE user_daily_metrics ALTER COLUMN walking_hr_avg_bpm TYPE REAL USING walking_hr_avg_bpm::REAL;
        RAISE NOTICE 'Converted walking_hr_avg_bpm from INTEGER to REAL';
    END IF;

    -- Check and convert dietary_water_ml if it's INTEGER
    SELECT data_type INTO col_type FROM information_schema.columns 
    WHERE table_name = 'user_daily_metrics' AND column_name = 'dietary_water_ml';
    IF col_type = 'integer' THEN
        ALTER TABLE user_daily_metrics ALTER COLUMN dietary_water_ml TYPE REAL USING dietary_water_ml::REAL;
        RAISE NOTICE 'Converted dietary_water_ml from INTEGER to REAL';
    END IF;

    -- Check and convert oxygen_saturation_pct if it's INTEGER
    SELECT data_type INTO col_type FROM information_schema.columns 
    WHERE table_name = 'user_daily_metrics' AND column_name = 'oxygen_saturation_pct';
    IF col_type = 'integer' THEN
        ALTER TABLE user_daily_metrics ALTER COLUMN oxygen_saturation_pct TYPE REAL USING oxygen_saturation_pct::REAL;
        RAISE NOTICE 'Converted oxygen_saturation_pct from INTEGER to REAL';
    END IF;

    -- Check and convert respiratory_rate_bpm if it's INTEGER
    SELECT data_type INTO col_type FROM information_schema.columns 
    WHERE table_name = 'user_daily_metrics' AND column_name = 'respiratory_rate_bpm';
    IF col_type = 'integer' THEN
        ALTER TABLE user_daily_metrics ALTER COLUMN respiratory_rate_bpm TYPE REAL USING respiratory_rate_bpm::REAL;
        RAISE NOTICE 'Converted respiratory_rate_bpm from INTEGER to REAL';
    END IF;

    -- Check and convert basal_energy_kcal if it's INTEGER
    SELECT data_type INTO col_type FROM information_schema.columns 
    WHERE table_name = 'user_daily_metrics' AND column_name = 'basal_energy_kcal';
    IF col_type = 'integer' THEN
        ALTER TABLE user_daily_metrics ALTER COLUMN basal_energy_kcal TYPE REAL USING basal_energy_kcal::REAL;
        RAISE NOTICE 'Converted basal_energy_kcal from INTEGER to REAL';
    END IF;

    -- Check and convert body_temp_c if it's INTEGER
    SELECT data_type INTO col_type FROM information_schema.columns 
    WHERE table_name = 'user_daily_metrics' AND column_name = 'body_temp_c';
    IF col_type = 'integer' THEN
        ALTER TABLE user_daily_metrics ALTER COLUMN body_temp_c TYPE REAL USING body_temp_c::REAL;
        RAISE NOTICE 'Converted body_temp_c from INTEGER to REAL';
    END IF;
END $$;

-- STEP 2: Add new vital signs columns if they don't exist
DO $$ 
BEGIN
    -- Walking heart rate average
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_daily_metrics' AND column_name = 'walking_hr_avg_bpm'
    ) THEN
        ALTER TABLE user_daily_metrics ADD COLUMN walking_hr_avg_bpm REAL;
        RAISE NOTICE 'Added walking_hr_avg_bpm column';
    END IF;

    -- Oxygen saturation percentage
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_daily_metrics' AND column_name = 'oxygen_saturation_pct'
    ) THEN
        ALTER TABLE user_daily_metrics ADD COLUMN oxygen_saturation_pct REAL;
        RAISE NOTICE 'Added oxygen_saturation_pct column';
    END IF;

    -- Respiratory rate (breaths per minute)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_daily_metrics' AND column_name = 'respiratory_rate_bpm'
    ) THEN
        ALTER TABLE user_daily_metrics ADD COLUMN respiratory_rate_bpm REAL;
        RAISE NOTICE 'Added respiratory_rate_bpm column';
    END IF;

    -- Body temperature in Celsius
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_daily_metrics' AND column_name = 'body_temp_c'
    ) THEN
        ALTER TABLE user_daily_metrics ADD COLUMN body_temp_c REAL;
        RAISE NOTICE 'Added body_temp_c column';
    END IF;

    -- Basal energy burned (kcal)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_daily_metrics' AND column_name = 'basal_energy_kcal'
    ) THEN
        ALTER TABLE user_daily_metrics ADD COLUMN basal_energy_kcal REAL;
        RAISE NOTICE 'Added basal_energy_kcal column';
    END IF;

    -- Dietary water intake (ml)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_daily_metrics' AND column_name = 'dietary_water_ml'
    ) THEN
        ALTER TABLE user_daily_metrics ADD COLUMN dietary_water_ml REAL;
        RAISE NOTICE 'Added dietary_water_ml column';
    END IF;

    RAISE NOTICE 'Vital signs columns migration completed successfully';
END $$;

-- STEP 3: Add comments documenting the columns
COMMENT ON COLUMN user_daily_metrics.walking_hr_avg_bpm IS 'Average heart rate during walking (bpm) - from Apple Watch walkingHeartRateAverage';
COMMENT ON COLUMN user_daily_metrics.oxygen_saturation_pct IS 'Blood oxygen saturation percentage (0-100) - from Apple Watch SpO2';
COMMENT ON COLUMN user_daily_metrics.respiratory_rate_bpm IS 'Average respiratory rate (breaths per minute) - from Apple Watch sleep analysis';
COMMENT ON COLUMN user_daily_metrics.body_temp_c IS 'Body temperature in Celsius - from Apple Watch or manual entry';
COMMENT ON COLUMN user_daily_metrics.basal_energy_kcal IS 'Basal metabolic energy burned (kcal) - resting metabolism from HealthKit';
COMMENT ON COLUMN user_daily_metrics.dietary_water_ml IS 'Dietary water intake (milliliters) - from Apple Health water tracking';

-- STEP 4: Verify the column types are correct
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_daily_metrics' 
AND column_name IN ('walking_hr_avg_bpm', 'dietary_water_ml', 'oxygen_saturation_pct', 
                    'respiratory_rate_bpm', 'basal_energy_kcal', 'body_temp_c')
ORDER BY column_name;
