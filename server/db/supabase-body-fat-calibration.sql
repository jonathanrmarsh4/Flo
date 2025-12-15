-- Body Fat Calibration Field
-- Allows users to apply a correction percentage to their smart scale body fat readings
-- This helps calibrate readings that are known to be off (e.g., compared to DEXA scans)
-- 
-- Example: If scale shows 7% but DEXA shows 12%, user sets body_fat_correction_pct = 5
-- The correction is ADDED to the scale reading when displayed

-- Add body fat correction column to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS body_fat_correction_pct REAL DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN profiles.body_fat_correction_pct IS 'Percentage points to add to scale body fat readings for calibration (e.g., 5 means add 5% to scale reading)';
