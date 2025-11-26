-- Add apple_test role and pending_approval status for App Store review
-- This migration adds enum values to support email approval workflow

-- Add 'apple_test' to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'apple_test';

-- Add 'pending_approval' to user_status enum
ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'pending_approval';
