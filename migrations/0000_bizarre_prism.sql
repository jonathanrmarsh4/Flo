CREATE TYPE "public"."activity_level" AS ENUM('Sedentary', 'Light', 'Moderate', 'Active', 'Very Active');--> statement-breakpoint
CREATE TYPE "public"."alcohol_intake" AS ENUM('None', 'Occasional', 'Moderate', 'Heavy');--> statement-breakpoint
CREATE TYPE "public"."auth_provider" AS ENUM('replit', 'apple', 'google', 'email');--> statement-breakpoint
CREATE TYPE "public"."billing_provider" AS ENUM('stripe');--> statement-breakpoint
CREATE TYPE "public"."communication_tone" AS ENUM('Casual', 'Professional', 'Scientific');--> statement-breakpoint
CREATE TYPE "public"."conversion_type" AS ENUM('ratio', 'affine');--> statement-breakpoint
CREATE TYPE "public"."decimals_policy" AS ENUM('ceil', 'floor', 'round');--> statement-breakpoint
CREATE TYPE "public"."diagnostic_source" AS ENUM('uploaded_pdf', 'uploaded_pdf_experimental', 'manual_entry', 'api');--> statement-breakpoint
CREATE TYPE "public"."diagnostic_status" AS ENUM('parsed', 'needs_review', 'failed');--> statement-breakpoint
CREATE TYPE "public"."diagnostic_type" AS ENUM('coronary_calcium_score', 'carotid_imt', 'dexa_scan', 'vo2_max', 'brain_mri');--> statement-breakpoint
CREATE TYPE "public"."diet_type" AS ENUM('Balanced', 'Low Carb', 'Mediterranean', 'Vegetarian', 'Vegan', 'Keto', 'Paleo');--> statement-breakpoint
CREATE TYPE "public"."evidence_tier" AS ENUM('1', '2', '3', '4', '5');--> statement-breakpoint
CREATE TYPE "public"."flomentum_zone" AS ENUM('BUILDING', 'MAINTAINING', 'DRAINING');--> statement-breakpoint
CREATE TYPE "public"."freshness_category" AS ENUM('green', 'yellow', 'red');--> statement-breakpoint
CREATE TYPE "public"."height_unit" AS ENUM('cm', 'inches');--> statement-breakpoint
CREATE TYPE "public"."insight_category" AS ENUM('activity_sleep', 'recovery_hrv', 'sleep_quality', 'biomarkers', 'nutrition', 'stress', 'general');--> statement-breakpoint
CREATE TYPE "public"."insights_frequency" AS ENUM('Daily', 'Weekly', 'Bi-weekly', 'Monthly');--> statement-breakpoint
CREATE TYPE "public"."lab_upload_job_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."measurement_source" AS ENUM('ai_extracted', 'manual', 'corrected');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."notification_trigger_type" AS ENUM('biomarker_out_of_range', 'biomarker_critical', 'flomentum_zone_change', 'ai_insight_generated', 'custom');--> statement-breakpoint
CREATE TYPE "public"."readiness_bucket" AS ENUM('recover', 'ok', 'ready');--> statement-breakpoint
CREATE TYPE "public"."reference_sex" AS ENUM('any', 'male', 'female');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('Male', 'Female', 'Other');--> statement-breakpoint
CREATE TYPE "public"."smoking_status" AS ENUM('Never', 'Former', 'Current');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('free', 'premium', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."weight_unit" AS ENUM('kg', 'lbs');--> statement-breakpoint
CREATE TABLE "analysis_results" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" varchar NOT NULL,
	"biological_age" text,
	"chronological_age" text,
	"insights" jsonb,
	"metrics" jsonb,
	"recommendations" jsonb,
	"source" jsonb,
	"specimen" jsonb,
	"collection_date" timestamp,
	"reported_date" timestamp,
	"panels" jsonb,
	"derived" jsonb,
	"summary" jsonb,
	"validation" jsonb,
	"confidence" jsonb,
	"schema_version" text DEFAULT '1.0',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"key_hash" text NOT NULL,
	"name" varchar DEFAULT 'Personal API Key' NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "api_keys_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "apns_configuration" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" text DEFAULT 'sandbox' NOT NULL,
	"team_id" text NOT NULL,
	"key_id" text NOT NULL,
	"signing_key" text NOT NULL,
	"bundle_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" varchar NOT NULL,
	"target_user_id" varchar,
	"action" text NOT NULL,
	"changes" jsonb,
	"action_metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auth_providers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"provider" "auth_provider" NOT NULL,
	"provider_user_id" varchar NOT NULL,
	"email" varchar,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "billing_customers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"provider" "billing_provider" DEFAULT 'stripe' NOT NULL,
	"stripe_customer_id" varchar,
	"country_code" varchar(2),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "billing_customers_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "billing_customers_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "biomarker_freshness_metadata" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"biomarker_id" varchar NOT NULL,
	"session_id" varchar NOT NULL,
	"test_date" timestamp NOT NULL,
	"age_months" real NOT NULL,
	"freshness_category" "freshness_category" NOT NULL,
	"decay_weight" real NOT NULL,
	"last_calculated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "biomarker_insights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"biomarker_id" varchar NOT NULL,
	"measurement_signature" text NOT NULL,
	"profile_snapshot" jsonb NOT NULL,
	"measurement_summary" jsonb NOT NULL,
	"lifestyle_actions" text[] NOT NULL,
	"nutrition" text[] NOT NULL,
	"supplementation" text[] NOT NULL,
	"medical_referral" text,
	"medical_urgency" text DEFAULT 'routine' NOT NULL,
	"model" text NOT NULL,
	"last_error" text,
	"generated_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "biomarker_measurements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"biomarker_id" varchar NOT NULL,
	"record_id" varchar,
	"source" "measurement_source" DEFAULT 'manual' NOT NULL,
	"value_raw" real NOT NULL,
	"unit_raw" text NOT NULL,
	"value_canonical" real NOT NULL,
	"unit_canonical" text NOT NULL,
	"value_display" text NOT NULL,
	"reference_low" real,
	"reference_high" real,
	"flags" text[],
	"warnings" text[],
	"normalization_context" jsonb,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "biomarker_reference_ranges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biomarker_id" varchar NOT NULL,
	"unit" text NOT NULL,
	"sex" "reference_sex" DEFAULT 'any',
	"age_min_y" real,
	"age_max_y" real,
	"context" jsonb,
	"low" real,
	"high" real,
	"critical_low" real,
	"critical_high" real,
	"lab_id" text,
	"source" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "biomarker_synonyms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biomarker_id" varchar NOT NULL,
	"label" text NOT NULL,
	"exact" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "biomarker_test_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"test_date" timestamp NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "biomarker_units" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biomarker_id" varchar NOT NULL,
	"from_unit" text NOT NULL,
	"to_unit" text NOT NULL,
	"conversion_type" "conversion_type" NOT NULL,
	"multiplier" real NOT NULL,
	"offset" real DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "biomarkers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"canonical_unit" text NOT NULL,
	"display_unit_preference" text,
	"precision" integer DEFAULT 1,
	"decimals_policy" decimals_policy DEFAULT 'round',
	"global_default_ref_min" real,
	"global_default_ref_max" real,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "biomarkers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "blood_pressure_readings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"systolic" integer NOT NULL,
	"diastolic" integer NOT NULL,
	"heart_rate" integer,
	"source" text DEFAULT 'manual' NOT NULL,
	"measured_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "blood_work_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "body_fat_reference_ranges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sex" "reference_sex" NOT NULL,
	"label" text NOT NULL,
	"min_percent" real NOT NULL,
	"max_percent" real NOT NULL,
	"display_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "component_scores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"cardiometabolic" integer,
	"body_composition" integer,
	"readiness" integer,
	"inflammation" integer,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"data_snapshot" jsonb
);
--> statement-breakpoint
CREATE TABLE "daily_insights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"generated_date" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"action" text,
	"confidence_score" real NOT NULL,
	"impact_score" real NOT NULL,
	"actionability_score" real NOT NULL,
	"freshness_score" real NOT NULL,
	"overall_score" real NOT NULL,
	"evidence_tier" "evidence_tier" NOT NULL,
	"primary_sources" text[] NOT NULL,
	"category" "insight_category" NOT NULL,
	"generating_layer" text NOT NULL,
	"details" jsonb NOT NULL,
	"is_new" boolean DEFAULT true NOT NULL,
	"is_dismissed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"device_token" text NOT NULL,
	"platform" text DEFAULT 'ios' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "device_tokens_device_token_unique" UNIQUE("device_token")
);
--> statement-breakpoint
CREATE TABLE "diagnostic_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" varchar NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"value_numeric" real,
	"unit" text,
	"extra" jsonb
);
--> statement-breakpoint
CREATE TABLE "diagnostics_studies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" "diagnostic_type" NOT NULL,
	"source" "diagnostic_source" NOT NULL,
	"study_date" timestamp NOT NULL,
	"age_at_scan" integer,
	"total_score_numeric" real,
	"risk_category" text,
	"age_percentile" integer,
	"ai_payload" jsonb NOT NULL,
	"status" "diagnostic_status" DEFAULT 'parsed' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "flo_scores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"score" integer NOT NULL,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"data_snapshot" jsonb
);
--> statement-breakpoint
CREATE TABLE "flomentum_daily" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"date" text NOT NULL,
	"score" integer NOT NULL,
	"zone" "flomentum_zone" NOT NULL,
	"delta_vs_yesterday" integer,
	"factors" jsonb NOT NULL,
	"daily_focus" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "flomentum_weekly" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"week_start_date" text NOT NULL,
	"average_score" integer NOT NULL,
	"delta_vs_previous_week" integer,
	"daily_scores" jsonb NOT NULL,
	"what_helped" jsonb NOT NULL,
	"what_held_back" jsonb NOT NULL,
	"focus_next_week" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "health_baselines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"metric_key" text NOT NULL,
	"baseline" real,
	"window_days" integer DEFAULT 30 NOT NULL,
	"num_samples" integer NOT NULL,
	"last_calculated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "health_daily_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"date" text NOT NULL,
	"sleep_total_minutes" integer,
	"sleep_main_start" timestamp,
	"sleep_main_end" timestamp,
	"hrv_sdnn_ms" integer,
	"resting_hr" integer,
	"respiratory_rate" real,
	"body_temp_deviation_c" real,
	"oxygen_saturation_avg" real,
	"steps" integer,
	"distance_meters" integer,
	"active_kcal" integer,
	"exercise_minutes" integer,
	"stand_hours" integer,
	"weight_kg" real,
	"body_fat_pct" real,
	"lean_mass_kg" real,
	"bmi" real,
	"waist_circumference_cm" real,
	"source" text DEFAULT 'healthkit_v1' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "health_embeddings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"content_type" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "health_insights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"analysis_data" jsonb NOT NULL,
	"data_window_days" integer,
	"model" text NOT NULL,
	"last_error" text,
	"generated_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "healthkit_samples" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"data_type" text NOT NULL,
	"value" real NOT NULL,
	"unit" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"source_name" text,
	"source_bundle_id" text,
	"device_name" text,
	"device_manufacturer" text,
	"device_model" text,
	"metadata" jsonb,
	"uuid" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "healthkit_samples_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE "healthkit_workouts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"workout_type" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"duration" real NOT NULL,
	"total_distance" real,
	"total_distance_unit" text,
	"total_energy_burned" real,
	"total_energy_burned_unit" text,
	"average_heart_rate" real,
	"max_heart_rate" real,
	"min_heart_rate" real,
	"source_name" text,
	"source_bundle_id" text,
	"device_name" text,
	"device_manufacturer" text,
	"device_model" text,
	"metadata" jsonb,
	"uuid" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "healthkit_workouts_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE "insight_cards" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"category" "insight_category" NOT NULL,
	"pattern" text NOT NULL,
	"confidence" real NOT NULL,
	"supporting_data" text,
	"details" jsonb,
	"is_new" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "insight_feedback" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"insight_id" varchar,
	"pattern_signature" text NOT NULL,
	"is_helpful" boolean,
	"is_accurate" boolean,
	"feedback_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insight_replication_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"pattern_signature" text NOT NULL,
	"effect_size" real NOT NULL,
	"window_type" text NOT NULL,
	"date_range" jsonb NOT NULL,
	"metadata" jsonb,
	"detected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_upload_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"record_id" varchar,
	"status" "lab_upload_job_status" DEFAULT 'pending' NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"file_sha256" text,
	"steps" jsonb,
	"result_payload" jsonb,
	"error_details" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "life_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"event_type" text NOT NULL,
	"details" jsonb DEFAULT '{}',
	"notes" text,
	"happened_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"trigger_id" varchar,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"failure_reason" text,
	"context_data" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_triggers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_type" "notification_trigger_type" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"biomarker_id" varchar,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"trigger_conditions" jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "openai_usage_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"endpoint" text NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost" real DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"status" text DEFAULT 'success' NOT NULL,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"stripe_payment_intent_id" varchar,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'usd',
	"status" text NOT NULL,
	"payment_method" text,
	"last4" varchar(4),
	"brand" varchar,
	"apple_pay_transaction_id" varchar,
	"wallet_type" varchar,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "payments_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"date_of_birth" timestamp,
	"sex" "sex",
	"weight" real,
	"weight_unit" "weight_unit" DEFAULT 'kg',
	"height" real,
	"height_unit" "height_unit" DEFAULT 'cm',
	"goals" text[],
	"health_baseline" jsonb,
	"ai_personalization" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "reference_profile_ranges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" varchar NOT NULL,
	"biomarker_id" varchar NOT NULL,
	"unit" text NOT NULL,
	"sex" "reference_sex" DEFAULT 'any',
	"age_min_y" real,
	"age_max_y" real,
	"low" real,
	"high" real,
	"critical_low" real,
	"critical_high" real,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reference_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"country_code" varchar(2),
	"lab_name" text,
	"description" text,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "reference_profiles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sleep_baselines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"metric_key" text NOT NULL,
	"window_days" integer DEFAULT 28 NOT NULL,
	"median" real,
	"std_dev" real,
	"num_samples" integer NOT NULL,
	"last_calculated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sleep_nights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"sleep_date" text NOT NULL,
	"timezone" text NOT NULL,
	"night_start" timestamp,
	"final_wake" timestamp,
	"sleep_onset" timestamp,
	"time_in_bed_min" real,
	"total_sleep_min" real,
	"sleep_efficiency_pct" real,
	"sleep_latency_min" real,
	"waso_min" real,
	"num_awakenings" integer,
	"core_sleep_min" real,
	"deep_sleep_min" real,
	"rem_sleep_min" real,
	"unspecified_sleep_min" real,
	"awake_in_bed_min" real,
	"mid_sleep_time_local" real,
	"fragmentation_index" real,
	"deep_pct" real,
	"rem_pct" real,
	"core_pct" real,
	"bedtime_local" text,
	"waketime_local" text,
	"resting_hr_bpm" real,
	"hrv_ms" real,
	"respiratory_rate" real,
	"wrist_temperature" real,
	"oxygen_saturation" real,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sleep_subscores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"sleep_date" text NOT NULL,
	"duration_score" real,
	"efficiency_score" real,
	"structure_score" real,
	"consistency_score" real,
	"recovery_score" real,
	"nightflo_score" real NOT NULL,
	"score_label" text NOT NULL,
	"score_delta_vs_baseline" real,
	"trend_direction" text,
	"headline_insight" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"stripe_subscription_id" varchar,
	"stripe_price_id" varchar,
	"status" "subscription_status" NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" text DEFAULT 'false',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "user_credentials" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"password_hash" text NOT NULL,
	"last_login_at" timestamp,
	"reset_token" varchar,
	"reset_token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_credentials_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_credentials_reset_token_unique" UNIQUE("reset_token")
);
--> statement-breakpoint
CREATE TABLE "user_daily_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"local_date" text NOT NULL,
	"timezone" text NOT NULL,
	"utc_day_start" timestamp NOT NULL,
	"utc_day_end" timestamp NOT NULL,
	"steps_normalized" integer,
	"steps_raw_sum" integer,
	"steps_sources" jsonb,
	"active_energy_kcal" real,
	"exercise_minutes" real,
	"sleep_hours" real,
	"resting_hr_bpm" real,
	"hrv_ms" real,
	"normalization_version" text DEFAULT 'norm_v1' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_daily_readiness" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"date" text NOT NULL,
	"readiness_score" real NOT NULL,
	"readiness_bucket" "readiness_bucket" NOT NULL,
	"sleep_score" real,
	"recovery_score" real,
	"load_score" real,
	"trend_score" real,
	"is_calibrating" boolean DEFAULT false NOT NULL,
	"notes_json" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_metric_baselines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"metric_key" text NOT NULL,
	"window_days" integer DEFAULT 30 NOT NULL,
	"mean" real,
	"std_dev" real,
	"num_samples" integer NOT NULL,
	"last_calculated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"steps_target" integer DEFAULT 7000 NOT NULL,
	"sleep_target_minutes" integer DEFAULT 480 NOT NULL,
	"flomentum_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"role" "user_role" DEFAULT 'free' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"reminder_enabled" boolean DEFAULT true NOT NULL,
	"reminder_time" varchar DEFAULT '08:15' NOT NULL,
	"reminder_timezone" varchar DEFAULT 'UTC' NOT NULL,
	"timezone" varchar DEFAULT 'America/Los_Angeles' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_record_id_blood_work_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."blood_work_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_providers" ADD CONSTRAINT "auth_providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_freshness_metadata" ADD CONSTRAINT "biomarker_freshness_metadata_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_freshness_metadata" ADD CONSTRAINT "biomarker_freshness_metadata_biomarker_id_biomarkers_id_fk" FOREIGN KEY ("biomarker_id") REFERENCES "public"."biomarkers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_freshness_metadata" ADD CONSTRAINT "biomarker_freshness_metadata_session_id_biomarker_test_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."biomarker_test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_insights" ADD CONSTRAINT "biomarker_insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_insights" ADD CONSTRAINT "biomarker_insights_biomarker_id_biomarkers_id_fk" FOREIGN KEY ("biomarker_id") REFERENCES "public"."biomarkers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_measurements" ADD CONSTRAINT "biomarker_measurements_session_id_biomarker_test_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."biomarker_test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_measurements" ADD CONSTRAINT "biomarker_measurements_biomarker_id_biomarkers_id_fk" FOREIGN KEY ("biomarker_id") REFERENCES "public"."biomarkers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_measurements" ADD CONSTRAINT "biomarker_measurements_record_id_blood_work_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."blood_work_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_reference_ranges" ADD CONSTRAINT "biomarker_reference_ranges_biomarker_id_biomarkers_id_fk" FOREIGN KEY ("biomarker_id") REFERENCES "public"."biomarkers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_synonyms" ADD CONSTRAINT "biomarker_synonyms_biomarker_id_biomarkers_id_fk" FOREIGN KEY ("biomarker_id") REFERENCES "public"."biomarkers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_test_sessions" ADD CONSTRAINT "biomarker_test_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_units" ADD CONSTRAINT "biomarker_units_biomarker_id_biomarkers_id_fk" FOREIGN KEY ("biomarker_id") REFERENCES "public"."biomarkers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_pressure_readings" ADD CONSTRAINT "blood_pressure_readings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_work_records" ADD CONSTRAINT "blood_work_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_scores" ADD CONSTRAINT "component_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_insights" ADD CONSTRAINT "daily_insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_metrics" ADD CONSTRAINT "diagnostic_metrics_study_id_diagnostics_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."diagnostics_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostics_studies" ADD CONSTRAINT "diagnostics_studies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flo_scores" ADD CONSTRAINT "flo_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flomentum_daily" ADD CONSTRAINT "flomentum_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flomentum_weekly" ADD CONSTRAINT "flomentum_weekly_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_baselines" ADD CONSTRAINT "health_baselines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_daily_metrics" ADD CONSTRAINT "health_daily_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_embeddings" ADD CONSTRAINT "health_embeddings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_insights" ADD CONSTRAINT "health_insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "healthkit_samples" ADD CONSTRAINT "healthkit_samples_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "healthkit_workouts" ADD CONSTRAINT "healthkit_workouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_cards" ADD CONSTRAINT "insight_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_feedback" ADD CONSTRAINT "insight_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_replication_history" ADD CONSTRAINT "insight_replication_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_upload_jobs" ADD CONSTRAINT "lab_upload_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_upload_jobs" ADD CONSTRAINT "lab_upload_jobs_record_id_blood_work_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."blood_work_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_events" ADD CONSTRAINT "life_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_trigger_id_notification_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."notification_triggers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_triggers" ADD CONSTRAINT "notification_triggers_biomarker_id_biomarkers_id_fk" FOREIGN KEY ("biomarker_id") REFERENCES "public"."biomarkers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_triggers" ADD CONSTRAINT "notification_triggers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "openai_usage_events" ADD CONSTRAINT "openai_usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_billing_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."billing_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_profile_ranges" ADD CONSTRAINT "reference_profile_ranges_profile_id_reference_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."reference_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_profile_ranges" ADD CONSTRAINT "reference_profile_ranges_biomarker_id_biomarkers_id_fk" FOREIGN KEY ("biomarker_id") REFERENCES "public"."biomarkers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleep_baselines" ADD CONSTRAINT "sleep_baselines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleep_nights" ADD CONSTRAINT "sleep_nights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleep_subscores" ADD CONSTRAINT "sleep_subscores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_billing_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."billing_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_metrics" ADD CONSTRAINT "user_daily_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_readiness" ADD CONSTRAINT "user_daily_readiness_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_metric_baselines" ADD CONSTRAINT "user_metric_baselines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_user_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "apns_config_env_idx" ON "apns_configuration" USING btree ("environment");--> statement-breakpoint
CREATE INDEX "apns_config_active_idx" ON "apns_configuration" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_providers_provider_user_idx" ON "auth_providers" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE INDEX "auth_providers_user_idx" ON "auth_providers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "biomarker_freshness_user_biomarker_idx" ON "biomarker_freshness_metadata" USING btree ("user_id","biomarker_id");--> statement-breakpoint
CREATE INDEX "biomarker_freshness_category_idx" ON "biomarker_freshness_metadata" USING btree ("freshness_category");--> statement-breakpoint
CREATE INDEX "biomarker_freshness_user_idx" ON "biomarker_freshness_metadata" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_biomarker_insights_unique_user_biomarker_signature" ON "biomarker_insights" USING btree ("user_id","biomarker_id","measurement_signature");--> statement-breakpoint
CREATE INDEX "idx_biomarker_insights_user_biomarker" ON "biomarker_insights" USING btree ("user_id","biomarker_id");--> statement-breakpoint
CREATE INDEX "idx_biomarker_measurements_session" ON "biomarker_measurements" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_biomarker_measurements_biomarker" ON "biomarker_measurements" USING btree ("biomarker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_biomarker_measurements_unique_session_biomarker" ON "biomarker_measurements" USING btree ("session_id","biomarker_id");--> statement-breakpoint
CREATE INDEX "idx_biomarker_test_sessions_user_date" ON "biomarker_test_sessions" USING btree ("user_id","test_date");--> statement-breakpoint
CREATE INDEX "idx_blood_pressure_user_date" ON "blood_pressure_readings" USING btree ("user_id","measured_at");--> statement-breakpoint
CREATE INDEX "idx_body_fat_sex_order" ON "body_fat_reference_ranges" USING btree ("sex","display_order");--> statement-breakpoint
CREATE INDEX "idx_component_scores_user_date" ON "component_scores" USING btree ("user_id","calculated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_insights_user_date_idx" ON "daily_insights" USING btree ("user_id","generated_date");--> statement-breakpoint
CREATE INDEX "daily_insights_user_idx" ON "daily_insights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "daily_insights_score_idx" ON "daily_insights" USING btree ("overall_score");--> statement-breakpoint
CREATE INDEX "daily_insights_category_idx" ON "daily_insights" USING btree ("category");--> statement-breakpoint
CREATE INDEX "daily_insights_tier_idx" ON "daily_insights" USING btree ("evidence_tier");--> statement-breakpoint
CREATE INDEX "device_tokens_user_idx" ON "device_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_tokens_active_idx" ON "device_tokens" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "device_tokens_token_idx" ON "device_tokens" USING btree ("device_token");--> statement-breakpoint
CREATE INDEX "idx_diagnostic_metrics_study_code" ON "diagnostic_metrics" USING btree ("study_id","code");--> statement-breakpoint
CREATE INDEX "idx_diagnostics_studies_user_type_date" ON "diagnostics_studies" USING btree ("user_id","type","study_date");--> statement-breakpoint
CREATE INDEX "idx_flo_scores_user_date" ON "flo_scores" USING btree ("user_id","calculated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_flomentum_daily_unique" ON "flomentum_daily" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_flomentum_daily_user_date" ON "flomentum_daily" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_flomentum_weekly_unique" ON "flomentum_weekly" USING btree ("user_id","week_start_date");--> statement-breakpoint
CREATE INDEX "idx_flomentum_weekly_user_week" ON "flomentum_weekly" USING btree ("user_id","week_start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_health_baselines_unique" ON "health_baselines" USING btree ("user_id","metric_key");--> statement-breakpoint
CREATE INDEX "idx_health_baselines_user" ON "health_baselines" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_health_daily_metrics_unique" ON "health_daily_metrics" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_health_daily_metrics_user_date" ON "health_daily_metrics" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "health_embeddings_user_idx" ON "health_embeddings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "health_embeddings_type_idx" ON "health_embeddings" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "idx_health_insights_user" ON "health_insights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_health_insights_generated_at" ON "health_insights" USING btree ("generated_at");--> statement-breakpoint
CREATE INDEX "idx_healthkit_user_type_date" ON "healthkit_samples" USING btree ("user_id","data_type","start_date");--> statement-breakpoint
CREATE INDEX "idx_healthkit_user_date" ON "healthkit_samples" USING btree ("user_id","start_date");--> statement-breakpoint
CREATE INDEX "idx_healthkit_uuid" ON "healthkit_samples" USING btree ("uuid");--> statement-breakpoint
CREATE INDEX "idx_healthkit_workouts_user_date" ON "healthkit_workouts" USING btree ("user_id","start_date");--> statement-breakpoint
CREATE INDEX "idx_healthkit_workouts_user_type" ON "healthkit_workouts" USING btree ("user_id","workout_type");--> statement-breakpoint
CREATE INDEX "idx_healthkit_workouts_uuid" ON "healthkit_workouts" USING btree ("uuid");--> statement-breakpoint
CREATE INDEX "insight_cards_user_idx" ON "insight_cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "insight_cards_category_idx" ON "insight_cards" USING btree ("category");--> statement-breakpoint
CREATE INDEX "insight_cards_confidence_idx" ON "insight_cards" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "insight_cards_active_idx" ON "insight_cards" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "insight_feedback_user_pattern_idx" ON "insight_feedback" USING btree ("user_id","pattern_signature");--> statement-breakpoint
CREATE INDEX "insight_feedback_user_idx" ON "insight_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "insight_replication_user_pattern_idx" ON "insight_replication_history" USING btree ("user_id","pattern_signature");--> statement-breakpoint
CREATE INDEX "insight_replication_user_idx" ON "insight_replication_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "insight_replication_detected_idx" ON "insight_replication_history" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "idx_lab_upload_jobs_user" ON "lab_upload_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_lab_upload_jobs_status" ON "lab_upload_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "life_events_user_time_idx" ON "life_events" USING btree ("user_id","happened_at");--> statement-breakpoint
CREATE INDEX "life_events_type_idx" ON "life_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "notification_logs_user_idx" ON "notification_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_logs_status_idx" ON "notification_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notification_logs_created_at_idx" ON "notification_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notification_triggers_biomarker_idx" ON "notification_triggers" USING btree ("biomarker_id");--> statement-breakpoint
CREATE INDEX "notification_triggers_active_idx" ON "notification_triggers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_openai_usage_events_created_at" ON "openai_usage_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_openai_usage_events_user" ON "openai_usage_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_openai_usage_events_model" ON "openai_usage_events" USING btree ("model");--> statement-breakpoint
CREATE INDEX "idx_reference_profile_ranges_profile_biomarker" ON "reference_profile_ranges" USING btree ("profile_id","biomarker_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sleep_baselines_unique" ON "sleep_baselines" USING btree ("user_id","metric_key");--> statement-breakpoint
CREATE INDEX "idx_sleep_baselines_user" ON "sleep_baselines" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sleep_nights_unique" ON "sleep_nights" USING btree ("user_id","sleep_date");--> statement-breakpoint
CREATE INDEX "idx_sleep_nights_user_date" ON "sleep_nights" USING btree ("user_id","sleep_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sleep_subscores_unique" ON "sleep_subscores" USING btree ("user_id","sleep_date");--> statement-breakpoint
CREATE INDEX "idx_sleep_subscores_user_date" ON "sleep_subscores" USING btree ("user_id","sleep_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_daily_metrics_unique" ON "user_daily_metrics" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "idx_user_daily_metrics_user_date" ON "user_daily_metrics" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_daily_readiness_unique" ON "user_daily_readiness" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_user_daily_readiness_user_date" ON "user_daily_readiness" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_metric_baselines_unique" ON "user_metric_baselines" USING btree ("user_id","metric_key");--> statement-breakpoint
CREATE INDEX "idx_user_metric_baselines_user" ON "user_metric_baselines" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_settings_user" ON "user_settings" USING btree ("user_id");