-- Script to safely delete test blood work data
-- Run this with: npm run db:execute server/scripts/deleteTestData.sql

-- Step 1: Show what will be deleted (for safety)
SELECT 
  'Blood Work Sessions to delete:' AS info,
  COUNT(*) AS count
FROM blood_work_sessions;

SELECT 
  'Biomarker Measurements to delete:' AS info,
  COUNT(*) AS count
FROM biomarker_measurements;

SELECT 
  'AI Analysis Results to delete:' AS info,
  COUNT(*) AS count
FROM ai_analysis_results;

-- Step 2: Delete in correct order (respecting foreign keys)
-- Delete AI analysis results first (references blood_work_sessions)
DELETE FROM ai_analysis_results;

-- Delete biomarker measurements (references blood_work_sessions)
DELETE FROM biomarker_measurements;

-- Delete blood work sessions (no dependencies)
DELETE FROM blood_work_sessions;

-- Step 3: Confirm deletion
SELECT 
  'Remaining Blood Work Sessions:' AS info,
  COUNT(*) AS count
FROM blood_work_sessions;

SELECT 
  'Remaining Biomarker Measurements:' AS info,
  COUNT(*) AS count
FROM biomarker_measurements;

SELECT 
  'Remaining AI Analysis Results:' AS info,
  COUNT(*) AS count
FROM ai_analysis_results;
