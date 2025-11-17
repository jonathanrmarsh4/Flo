import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Admin & Billing enums
export const userRoleEnum = pgEnum("user_role", ["free", "premium", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);
export const billingProviderEnum = pgEnum("billing_provider", ["stripe"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid"
]);

// Auth provider enums
export const authProviderEnum = pgEnum("auth_provider", ["replit", "apple", "google", "email"]);

// Profile enums
export const sexEnum = pgEnum("sex", ["Male", "Female", "Other"]);
export const weightUnitEnum = pgEnum("weight_unit", ["kg", "lbs"]);
export const heightUnitEnum = pgEnum("height_unit", ["cm", "inches"]);
export const activityLevelEnum = pgEnum("activity_level", ["Sedentary", "Light", "Moderate", "Active", "Very Active"]);
export const dietTypeEnum = pgEnum("diet_type", ["Balanced", "Low Carb", "Mediterranean", "Vegetarian", "Vegan", "Keto", "Paleo"]);
export const smokingStatusEnum = pgEnum("smoking_status", ["Never", "Former", "Current"]);
export const alcoholIntakeEnum = pgEnum("alcohol_intake", ["None", "Occasional", "Moderate", "Heavy"]);
export const communicationToneEnum = pgEnum("communication_tone", ["Casual", "Professional", "Scientific"]);
export const insightsFrequencyEnum = pgEnum("insights_frequency", ["Daily", "Weekly", "Bi-weekly", "Monthly"]);

// Biomarker enums
export const decimalsPolicyEnum = pgEnum("decimals_policy", ["ceil", "floor", "round"]);
export const conversionTypeEnum = pgEnum("conversion_type", ["ratio", "affine"]);
export const referenceSexEnum = pgEnum("reference_sex", ["any", "male", "female"]);
export const measurementSourceEnum = pgEnum("measurement_source", ["ai_extracted", "manual", "corrected"]);

// Lab upload job enums
export const labUploadJobStatusEnum = pgEnum("lab_upload_job_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "needs_review"
]);

// Diagnostic study enums
export const diagnosticTypeEnum = pgEnum("diagnostic_type", [
  "coronary_calcium_score",
  "carotid_imt",
  "dexa_scan",
  "vo2_max",
  "brain_mri"
]);
export const diagnosticSourceEnum = pgEnum("diagnostic_source", [
  "uploaded_pdf",
  "uploaded_pdf_experimental",
  "manual_entry",
  "api"
]);
export const diagnosticStatusEnum = pgEnum("diagnostic_status", [
  "parsed",
  "needs_review",
  "failed"
]);

// Readiness enums
export const readinessBucketEnum = pgEnum("readiness_bucket", ["recover", "ok", "ready"]);

// Flōmentum enums
export const flomentumZoneEnum = pgEnum("flomentum_zone", ["BUILDING", "MAINTAINING", "DRAINING"]);

// Zod enums for validation and UI options
export const UserRoleEnum = z.enum(["free", "premium", "admin"]);
export const UserStatusEnum = z.enum(["active", "suspended"]);
export const SubscriptionStatusEnum = z.enum([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid"
]);

export const SexEnum = z.enum(["Male", "Female", "Other"]);
export const WeightUnitEnum = z.enum(["kg", "lbs"]);
export const HeightUnitEnum = z.enum(["cm", "inches"]);
export const ActivityLevelEnum = z.enum(["Sedentary", "Light", "Moderate", "Active", "Very Active"]);
export const DietTypeEnum = z.enum(["Balanced", "Low Carb", "Mediterranean", "Vegetarian", "Vegan", "Keto", "Paleo"]);
export const SmokingStatusEnum = z.enum(["Never", "Former", "Current"]);
export const AlcoholIntakeEnum = z.enum(["None", "Occasional", "Moderate", "Heavy"]);
export const CommunicationToneEnum = z.enum(["Casual", "Professional", "Scientific"]);
export const InsightsFrequencyEnum = z.enum(["Daily", "Weekly", "Bi-weekly", "Monthly"]);

export const HealthGoalEnum = z.enum([
  "Longevity",
  "Performance",
  "Prevention",
  "Weight Management",
  "Cardiovascular Health",
  "Metabolic Optimization",
  "Cognitive Health"
]);

export const FocusAreaEnum = z.enum([
  "Heart Health",
  "Inflammation",
  "Metabolic Health",
  "Liver Function",
  "Kidney Function",
  "Hormones",
  "Nutrition",
  "Immunity"
]);

export const DecimalsPolicyEnum = z.enum(["ceil", "floor", "round"]);
export const ConversionTypeEnum = z.enum(["ratio", "affine"]);
export const ReferenceSexEnum = z.enum(["any", "male", "female"]);
export const MeasurementSourceEnum = z.enum(["ai_extracted", "manual", "corrected"]);

export const DiagnosticTypeEnum = z.enum([
  "coronary_calcium_score",
  "carotid_imt",
  "dexa_scan",
  "vo2_max",
  "brain_mri"
]);
export const DiagnosticSourceEnum = z.enum(["uploaded_pdf", "uploaded_pdf_experimental", "manual_entry", "api"]);
export const DiagnosticStatusEnum = z.enum(["parsed", "needs_review", "failed"]);

export const ReadinessBucketEnum = z.enum(["recover", "ok", "ready"]);

export const FlomentumZoneEnum = z.enum(["BUILDING", "MAINTAINING", "DRAINING"]);

// Health baseline schema (for JSONB validation)
export const healthBaselineSchema = z.object({
  activityLevel: ActivityLevelEnum.optional(),
  sleepHours: z.number().min(0).max(24).optional(),
  dietType: DietTypeEnum.optional(),
  smokingStatus: SmokingStatusEnum.optional(),
  alcoholIntake: AlcoholIntakeEnum.optional(),
});

// AI personalization schema (for JSONB validation)
export const aiPersonalizationSchema = z.object({
  tone: CommunicationToneEnum.optional(),
  insightsFrequency: InsightsFrequencyEnum.optional(),
  focusAreas: z.array(FocusAreaEnum).optional(),
  medicalContext: z.string().max(2000).optional(), // User-provided context for AI (e.g., "I'm on TRT", medications, conditions)
});

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (supports multi-provider auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: userRoleEnum("role").default("free").notNull(),
  status: userStatusEnum("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Auth providers table - links users to OAuth providers (Apple, Google) or Replit Auth
export const authProviders = pgTable("auth_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: authProviderEnum("provider").notNull(),
  providerUserId: varchar("provider_user_id").notNull(), // Provider's unique ID for the user
  email: varchar("email"), // Email from provider (may differ from users.email)
  accessToken: text("access_token"), // Encrypted OAuth access token
  refreshToken: text("refresh_token"), // Encrypted OAuth refresh token
  expiresAt: timestamp("expires_at"), // Token expiration
  metadata: jsonb("metadata"), // Additional provider data (name, avatar, etc.)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("auth_providers_provider_user_idx").on(table.provider, table.providerUserId),
  index("auth_providers_user_idx").on(table.userId),
]);

// User credentials table - for email/password authentication
export const userCredentials = pgTable("user_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(), // bcrypt hash
  lastLoginAt: timestamp("last_login_at"),
  resetToken: varchar("reset_token").unique(), // Password reset token
  resetTokenExpiresAt: timestamp("reset_token_expires_at"), // Reset token expiry
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User health profiles table (1:1 with users)
export const profiles = pgTable("profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  
  // Demographics (queryable columns)
  dateOfBirth: timestamp("date_of_birth", { mode: "date" }),
  sex: sexEnum("sex"),
  weight: real("weight"),
  weightUnit: weightUnitEnum("weight_unit").default("kg"),
  height: real("height"),
  heightUnit: heightUnitEnum("height_unit").default("cm"),
  
  // Health goals (array column)
  goals: text("goals").array(),
  
  // Health & Lifestyle Baseline (JSONB for flexibility)
  healthBaseline: jsonb("health_baseline").$type<z.infer<typeof healthBaselineSchema>>(),
  
  // AI Personalization (JSONB for flexibility)
  aiPersonalization: jsonb("ai_personalization").$type<z.infer<typeof aiPersonalizationSchema>>(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Blood work records table
export const bloodWorkRecords = pgTable("blood_work_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  createdAt: timestamp("created_at").defaultNow(),
});

// AI analysis results table - Enhanced with Guardrails v1 and Upload Design v1.0
export const analysisResults = pgTable("analysis_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recordId: varchar("record_id").notNull().references(() => bloodWorkRecords.id, { onDelete: "cascade" }),
  
  // Basic age fields (backward compatible)
  biologicalAge: text("biological_age"),
  chronologicalAge: text("chronological_age"),
  
  // Legacy fields (kept for backward compatibility)
  insights: jsonb("insights"),
  metrics: jsonb("metrics"),
  recommendations: jsonb("recommendations"),
  
  // New structured Report schema fields
  source: jsonb("source"), // { vendor_name, file_sha256, pages, extraction_method, ocr_mean_confidence }
  specimen: jsonb("specimen"), // { type: "BLOOD", fasting_status: "FASTING|NON_FASTING|UNKNOWN" }
  collectionDate: timestamp("collection_date"),
  reportedDate: timestamp("reported_date"),
  panels: jsonb("panels"), // Array of panel objects with observations
  derived: jsonb("derived"), // { calculations, trends }
  summary: jsonb("summary"), // { title, key_findings, top_priorities, limitations }
  validation: jsonb("validation"), // { errors, warnings, suggested_actions }
  confidence: jsonb("confidence"), // { overall, components: { ocr_quality, parser_confidence, etc } }
  schemaVersion: text("schema_version").default("1.0"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Billing customers table (links users to Stripe)
export const billingCustomers = pgTable("billing_customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  provider: billingProviderEnum("provider").default("stripe").notNull(),
  stripeCustomerId: varchar("stripe_customer_id").unique(),
  countryCode: varchar("country_code", { length: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscriptions table
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => billingCustomers.id, { onDelete: "cascade" }),
  stripeSubscriptionId: varchar("stripe_subscription_id").unique(),
  stripePriceId: varchar("stripe_price_id"),
  status: subscriptionStatusEnum("status").notNull(),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: text("cancel_at_period_end").default("false"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payments table (for Apple Pay metadata)
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => billingCustomers.id, { onDelete: "cascade" }),
  stripePaymentIntentId: varchar("stripe_payment_intent_id").unique(),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 3 }).default("usd"),
  status: text("status").notNull(),
  paymentMethod: text("payment_method"),
  last4: varchar("last4", { length: 4 }),
  brand: varchar("brand"),
  applePayTransactionId: varchar("apple_pay_transaction_id"),
  walletType: varchar("wallet_type"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Audit log table for admin actions
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => users.id),
  targetUserId: varchar("target_user_id").references(() => users.id),
  action: text("action").notNull(),
  changes: jsonb("changes"),
  actionMetadata: jsonb("action_metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Biomarker dictionary tables
export const biomarkers = pgTable("biomarkers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  category: text("category").notNull(),
  canonicalUnit: text("canonical_unit").notNull(),
  displayUnitPreference: text("display_unit_preference"),
  precision: integer("precision").default(1),
  decimalsPolicy: decimalsPolicyEnum("decimals_policy").default("round"),
  globalDefaultRefMin: real("global_default_ref_min"),
  globalDefaultRefMax: real("global_default_ref_max"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const biomarkerSynonyms = pgTable("biomarker_synonyms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  biomarkerId: varchar("biomarker_id").notNull().references(() => biomarkers.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  exact: boolean("exact").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const biomarkerUnits = pgTable("biomarker_units", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  biomarkerId: varchar("biomarker_id").notNull().references(() => biomarkers.id, { onDelete: "cascade" }),
  fromUnit: text("from_unit").notNull(),
  toUnit: text("to_unit").notNull(),
  conversionType: conversionTypeEnum("conversion_type").notNull(),
  multiplier: real("multiplier").notNull(),
  offset: real("offset").default(0).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const biomarkerReferenceRanges = pgTable("biomarker_reference_ranges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  biomarkerId: varchar("biomarker_id").notNull().references(() => biomarkers.id, { onDelete: "cascade" }),
  unit: text("unit").notNull(),
  sex: referenceSexEnum("sex").default("any"),
  ageMinY: real("age_min_y"),
  ageMaxY: real("age_max_y"),
  context: jsonb("context"),
  low: real("low"),
  high: real("high"),
  criticalLow: real("critical_low"),
  criticalHigh: real("critical_high"),
  labId: text("lab_id"),
  source: text("source"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const referenceProfiles = pgTable("reference_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  countryCode: varchar("country_code", { length: 2 }),
  labName: text("lab_name"),
  description: text("description"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const referenceProfileRanges = pgTable("reference_profile_ranges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull().references(() => referenceProfiles.id, { onDelete: "cascade" }),
  biomarkerId: varchar("biomarker_id").notNull().references(() => biomarkers.id, { onDelete: "cascade" }),
  unit: text("unit").notNull(),
  sex: referenceSexEnum("sex").default("any"),
  ageMinY: real("age_min_y"),
  ageMaxY: real("age_max_y"),
  low: real("low"),
  high: real("high"),
  criticalLow: real("critical_low"),
  criticalHigh: real("critical_high"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_reference_profile_ranges_profile_biomarker").on(table.profileId, table.biomarkerId),
]);

export const biomarkerTestSessions = pgTable("biomarker_test_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("manual"),
  testDate: timestamp("test_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_biomarker_test_sessions_user_date").on(table.userId, table.testDate),
]);

export const biomarkerMeasurements = pgTable("biomarker_measurements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => biomarkerTestSessions.id, { onDelete: "cascade" }),
  biomarkerId: varchar("biomarker_id").notNull().references(() => biomarkers.id, { onDelete: "cascade" }),
  recordId: varchar("record_id").references(() => bloodWorkRecords.id, { onDelete: "set null" }),
  source: measurementSourceEnum("source").notNull().default("manual"),
  valueRaw: real("value_raw").notNull(),
  unitRaw: text("unit_raw").notNull(),
  valueCanonical: real("value_canonical").notNull(),
  unitCanonical: text("unit_canonical").notNull(),
  valueDisplay: text("value_display").notNull(),
  referenceLow: real("reference_low"),
  referenceHigh: real("reference_high"),
  flags: text("flags").array(),
  warnings: text("warnings").array(),
  normalizationContext: jsonb("normalization_context"),
  updatedBy: varchar("updated_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_biomarker_measurements_session").on(table.sessionId),
  index("idx_biomarker_measurements_biomarker").on(table.biomarkerId),
  uniqueIndex("idx_biomarker_measurements_unique_session_biomarker").on(table.sessionId, table.biomarkerId),
]);

export const biomarkerInsights = pgTable("biomarker_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  biomarkerId: varchar("biomarker_id").notNull().references(() => biomarkers.id, { onDelete: "cascade" }),
  measurementSignature: text("measurement_signature").notNull(),
  profileSnapshot: jsonb("profile_snapshot").notNull(),
  measurementSummary: jsonb("measurement_summary").notNull(),
  lifestyleActions: text("lifestyle_actions").array().notNull(),
  nutrition: text("nutrition").array().notNull(),
  supplementation: text("supplementation").array().notNull(),
  medicalReferral: text("medical_referral"),
  medicalUrgency: text("medical_urgency").notNull().default("routine"),
  model: text("model").notNull(),
  lastError: text("last_error"),
  generatedAt: timestamp("generated_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  uniqueIndex("idx_biomarker_insights_unique_user_biomarker_signature").on(table.userId, table.biomarkerId, table.measurementSignature),
  index("idx_biomarker_insights_user_biomarker").on(table.userId, table.biomarkerId),
]);

export const labUploadJobs = pgTable("lab_upload_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recordId: varchar("record_id").references(() => bloodWorkRecords.id, { onDelete: "set null" }),
  status: labUploadJobStatusEnum("status").notNull().default("pending"),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  fileSha256: text("file_sha256"),
  steps: jsonb("steps"),
  resultPayload: jsonb("result_payload"),
  errorDetails: jsonb("error_details"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_lab_upload_jobs_user").on(table.userId),
  index("idx_lab_upload_jobs_status").on(table.status),
]);

export const healthInsights = pgTable("health_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  analysisData: jsonb("analysis_data").notNull(),
  dataWindowDays: integer("data_window_days"),
  model: text("model").notNull(),
  lastError: text("last_error"),
  generatedAt: timestamp("generated_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("idx_health_insights_user").on(table.userId),
  index("idx_health_insights_generated_at").on(table.generatedAt),
]);

// OpenAI usage tracking for admin analytics
export const openaiUsageEvents = pgTable("openai_usage_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  endpoint: text("endpoint").notNull(),
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  cost: real("cost").notNull().default(0),
  latencyMs: integer("latency_ms"),
  status: text("status").notNull().default("success"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_openai_usage_events_created_at").on(table.createdAt),
  index("idx_openai_usage_events_user").on(table.userId),
  index("idx_openai_usage_events_model").on(table.model),
]);

// Diagnostic studies (coronary calcium score, DEXA, VO2, etc.)
export const diagnosticsStudies = pgTable("diagnostics_studies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: diagnosticTypeEnum("type").notNull(),
  source: diagnosticSourceEnum("source").notNull(),
  studyDate: timestamp("study_date").notNull(),
  ageAtScan: integer("age_at_scan"),
  totalScoreNumeric: real("total_score_numeric"),
  riskCategory: text("risk_category"),
  agePercentile: integer("age_percentile"),
  aiPayload: jsonb("ai_payload").notNull(),
  status: diagnosticStatusEnum("status").notNull().default("parsed"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_diagnostics_studies_user_type_date").on(table.userId, table.type, table.studyDate),
]);

// Flexible metrics table for diagnostic studies (per-vessel scores, etc.)
export const diagnosticMetrics = pgTable("diagnostic_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studyId: varchar("study_id").notNull().references(() => diagnosticsStudies.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  label: text("label").notNull(),
  valueNumeric: real("value_numeric"),
  unit: text("unit"),
  extra: jsonb("extra"),
}, (table) => [
  index("idx_diagnostic_metrics_study_code").on(table.studyId, table.code),
]);

// Flō Scores - tracks overall health score over time
export const floScores = pgTable("flo_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  score: integer("score").notNull(), // 0-100
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
  dataSnapshot: jsonb("data_snapshot"), // Store inputs used for calculation
}, (table) => [
  index("idx_flo_scores_user_date").on(table.userId, table.calculatedAt),
]);

// Component Scores - tracks the 4 component scores that make up Flō Score
export const componentScores = pgTable("component_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cardiometabolic: integer("cardiometabolic"), // 0-100, nullable
  bodyComposition: integer("body_composition"), // 0-100, nullable
  readiness: integer("readiness"), // 0-100, nullable (HomeKit dependent)
  inflammation: integer("inflammation"), // 0-100, nullable
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
  dataSnapshot: jsonb("data_snapshot"), // Store inputs used for calculation
}, (table) => [
  index("idx_component_scores_user_date").on(table.userId, table.calculatedAt),
]);

// Blood Pressure Readings - for future HomeKit integration and manual entry
export const bloodPressureReadings = pgTable("blood_pressure_readings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  systolic: integer("systolic").notNull(), // mmHg
  diastolic: integer("diastolic").notNull(), // mmHg
  heartRate: integer("heart_rate"), // bpm, optional
  source: text("source").notNull().default("manual"), // manual, homekit, device
  measuredAt: timestamp("measured_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_blood_pressure_user_date").on(table.userId, table.measuredAt),
]);

// HealthKit samples - stores all 26 data types from iOS HealthKit
export const healthkitSamples = pgTable("healthkit_samples", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dataType: text("data_type").notNull(), // steps, heartRate, weight, etc. (26 types)
  value: real("value").notNull(), // Numeric value or category value
  unit: text("unit").notNull(), // count, bpm, kg, etc.
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  sourceName: text("source_name"), // App/device that recorded the data
  sourceBundleId: text("source_bundle_id"), // Bundle identifier of source app
  deviceName: text("device_name"), // Device name (e.g., "Apple Watch")
  deviceManufacturer: text("device_manufacturer"), // Device manufacturer
  deviceModel: text("device_model"), // Device model
  metadata: jsonb("metadata"), // Additional metadata from HealthKit
  uuid: text("uuid").unique(), // HealthKit sample UUID (for deduplication)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_healthkit_user_type_date").on(table.userId, table.dataType, table.startDate),
  index("idx_healthkit_user_date").on(table.userId, table.startDate),
  index("idx_healthkit_uuid").on(table.uuid),
]);

// User Daily Metrics - Normalized HealthKit data aggregated per day
export const userDailyMetrics = pgTable("user_daily_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  localDate: text("local_date").notNull(), // YYYY-MM-DD in user's local timezone
  timezone: text("timezone").notNull(), // IANA timezone string (e.g., 'Australia/Perth')
  utcDayStart: timestamp("utc_day_start").notNull(), // Start of local day in UTC
  utcDayEnd: timestamp("utc_day_end").notNull(), // End of local day in UTC
  stepsNormalized: integer("steps_normalized"), // Deduplicated steps (Watch > iPhone priority)
  stepsRawSum: integer("steps_raw_sum"), // Raw sum before deduplication (for QA)
  stepsSources: jsonb("steps_sources"), // Source metadata (primary, secondary, ignored)
  activeEnergyKcal: real("active_energy_kcal"), // Total active energy for the day
  exerciseMinutes: real("exercise_minutes"), // Exercise minutes (source-deduplicated to avoid double-counting)
  sleepHours: real("sleep_hours"), // Total sleep hours (night before localDate)
  restingHrBpm: real("resting_hr_bpm"), // Average resting heart rate
  hrvMs: real("hrv_ms"), // Average HRV in milliseconds
  normalizationVersion: text("normalization_version").notNull().default("norm_v1"), // Track algorithm version
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_user_daily_metrics_unique").on(table.userId, table.localDate),
  index("idx_user_daily_metrics_user_date").on(table.userId, table.localDate),
]);

// User Metric Baselines - Rolling 30-day statistics per user per metric
export const userMetricBaselines = pgTable("user_metric_baselines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  metricKey: text("metric_key").notNull(), // 'sleep_hours', 'resting_hr', 'hrv_ms', 'active_energy_kcal'
  windowDays: integer("window_days").notNull().default(30), // Rolling window size
  mean: real("mean"), // Average value over window
  stdDev: real("std_dev"), // Standard deviation
  numSamples: integer("num_samples").notNull(), // Number of data points used
  lastCalculatedAt: timestamp("last_calculated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_user_metric_baselines_unique").on(table.userId, table.metricKey),
  index("idx_user_metric_baselines_user").on(table.userId),
]);

// User Daily Readiness - Computed readiness scores with components
export const userDailyReadiness = pgTable("user_daily_readiness", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  readinessScore: real("readiness_score").notNull(), // 0-100
  readinessBucket: readinessBucketEnum("readiness_bucket").notNull(), // 'recover' | 'ok' | 'ready'
  sleepScore: real("sleep_score"), // 0-100
  recoveryScore: real("recovery_score"), // 0-100 (HRV + RHR)
  loadScore: real("load_score"), // 0-100 (activity load)
  trendScore: real("trend_score"), // 0-100 (3-day smoothing)
  isCalibrating: boolean("is_calibrating").notNull().default(false), // True if baselines immature (<14 days)
  notesJson: jsonb("notes_json"), // Extra explanation data
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_user_daily_readiness_unique").on(table.userId, table.date),
  index("idx_user_daily_readiness_user_date").on(table.userId, table.date),
]);

// Sleep Nights - Detailed nightly sleep metrics from HealthKit sleepAnalysis
export const sleepNights = pgTable("sleep_nights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sleepDate: text("sleep_date").notNull(), // YYYY-MM-DD (local calendar day of final wake)
  timezone: text("timezone").notNull(), // IANA timezone (e.g., 'America/Los_Angeles')
  nightStart: timestamp("night_start"), // First in-bed or sleep segment start (UTC)
  finalWake: timestamp("final_wake"), // Last in-bed or sleep segment end (UTC)
  sleepOnset: timestamp("sleep_onset"), // First asleep* segment start (UTC)
  timeInBedMin: real("time_in_bed_min"), // Total in-bed duration
  totalSleepMin: real("total_sleep_min"), // Total asleep duration
  sleepEfficiencyPct: real("sleep_efficiency_pct"), // 100 * totalSleep / timeInBed
  sleepLatencyMin: real("sleep_latency_min"), // Minutes from in-bed to sleep onset
  wasoMin: real("waso_min"), // Wake after sleep onset
  numAwakenings: integer("num_awakenings"), // Count of awake segments >= MIN_AWAKE_DURATION
  coreSleepMin: real("core_sleep_min"), // Light sleep duration
  deepSleepMin: real("deep_sleep_min"), // Deep sleep duration
  remSleepMin: real("rem_sleep_min"), // REM sleep duration
  unspecifiedSleepMin: real("unspecified_sleep_min"), // Unspecified or legacy asleep
  awakeInBedMin: real("awake_in_bed_min"), // Awake time while in bed
  midSleepTimeLocal: real("mid_sleep_time_local"), // Minutes since midnight (local)
  fragmentationIndex: real("fragmentation_index"), // numAwakenings / (totalSleep / 60)
  deepPct: real("deep_pct"), // 100 * deep / totalSleep
  remPct: real("rem_pct"), // 100 * REM / totalSleep
  corePct: real("core_pct"), // 100 * core / totalSleep
  bedtimeLocal: text("bedtime_local"), // Formatted bedtime (e.g., "10:47 pm")
  waketimeLocal: text("waketime_local"), // Formatted wake time (e.g., "6:19 am")
  restingHrBpm: real("resting_hr_bpm"), // Optional: resting HR during sleep
  hrvMs: real("hrv_ms"), // Optional: HRV during sleep
  respiratoryRate: real("respiratory_rate"), // Optional: respiratory rate
  wristTemperature: real("wrist_temperature"), // Optional: wrist temperature
  oxygenSaturation: real("oxygen_saturation"), // Optional: SpO2
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_sleep_nights_unique").on(table.userId, table.sleepDate),
  index("idx_sleep_nights_user_date").on(table.userId, table.sleepDate),
]);

// Sleep Subscores - Individual component scores for nightly sleep
export const sleepSubscores = pgTable("sleep_subscores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sleepDate: text("sleep_date").notNull(), // YYYY-MM-DD (matches sleepNights)
  durationScore: real("duration_score"), // 0-100 (25% weight)
  efficiencyScore: real("efficiency_score"), // 0-100 (20% weight)
  structureScore: real("structure_score"), // 0-100 (20% weight)
  consistencyScore: real("consistency_score"), // 0-100 (20% weight)
  recoveryScore: real("recovery_score"), // 0-100 (15% weight, optional)
  nightfloScore: real("nightflo_score").notNull(), // 0-100 (final weighted score)
  scoreLabel: text("score_label").notNull(), // 'Low' | 'Fair' | 'Good' | 'Excellent'
  scoreDeltaVsBaseline: real("score_delta_vs_baseline"), // +/- points vs. baseline
  trendDirection: text("trend_direction"), // 'up' | 'down' | 'flat'
  headlineInsight: text("headline_insight"), // AI-generated insight
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_sleep_subscores_unique").on(table.userId, table.sleepDate),
  index("idx_sleep_subscores_user_date").on(table.userId, table.sleepDate),
]);

// Sleep Baselines - 28-day rolling statistics for personalization
export const sleepBaselines = pgTable("sleep_baselines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  metricKey: text("metric_key").notNull(), // 'total_sleep_min', 'deep_pct', 'rem_pct', 'sleep_efficiency_pct', etc.
  windowDays: integer("window_days").notNull().default(28), // Rolling window size
  median: real("median"), // Median value over window
  stdDev: real("std_dev"), // Standard deviation
  numSamples: integer("num_samples").notNull(), // Number of nights used
  lastCalculatedAt: timestamp("last_calculated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_sleep_baselines_unique").on(table.userId, table.metricKey),
  index("idx_sleep_baselines_user").on(table.userId),
]);

// Flōmentum user settings
export const userSettings = pgTable("user_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").unique().notNull().references(() => users.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull().default("UTC"),
  stepsTarget: integer("steps_target").notNull().default(7000),
  sleepTargetMinutes: integer("sleep_target_minutes").notNull().default(480),
  flomentumEnabled: boolean("flomentum_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_user_settings_user").on(table.userId),
]);

// Health daily metrics aggregated from HealthKit
export const healthDailyMetrics = pgTable("health_daily_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  sleepTotalMinutes: integer("sleep_total_minutes"),
  sleepMainStart: timestamp("sleep_main_start"),
  sleepMainEnd: timestamp("sleep_main_end"),
  hrvSdnnMs: integer("hrv_sdnn_ms"),
  restingHr: integer("resting_hr"),
  respiratoryRate: real("respiratory_rate"),
  bodyTempDeviationC: real("body_temp_deviation_c"),
  oxygenSaturationAvg: real("oxygen_saturation_avg"),
  steps: integer("steps"),
  distanceMeters: integer("distance_meters"),
  activeKcal: integer("active_kcal"),
  exerciseMinutes: integer("exercise_minutes"),
  standHours: integer("stand_hours"),
  weightKg: real("weight_kg"),
  bodyFatPct: real("body_fat_pct"),
  leanMassKg: real("lean_mass_kg"),
  bmi: real("bmi"),
  waistCircumferenceCm: real("waist_circumference_cm"),
  source: text("source").notNull().default("healthkit_v1"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_health_daily_metrics_unique").on(table.userId, table.date),
  index("idx_health_daily_metrics_user_date").on(table.userId, table.date),
]);

// Flōmentum daily scores and factors
export const flomentumDaily = pgTable("flomentum_daily", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  score: integer("score").notNull(),
  zone: flomentumZoneEnum("zone").notNull(),
  deltaVsYesterday: integer("delta_vs_yesterday"),
  factors: jsonb("factors").notNull(), // Array of factor objects
  dailyFocus: jsonb("daily_focus"), // { title, body, componentKey }
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_flomentum_daily_unique").on(table.userId, table.date),
  index("idx_flomentum_daily_user_date").on(table.userId, table.date),
]);

// Flōmentum weekly aggregations
export const flomentumWeekly = pgTable("flomentum_weekly", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  weekStartDate: text("week_start_date").notNull(), // YYYY-MM-DD (Monday)
  averageScore: integer("average_score").notNull(),
  deltaVsPreviousWeek: integer("delta_vs_previous_week"),
  dailyScores: jsonb("daily_scores").notNull(), // Array of { date, label, score, zone }
  whatHelped: jsonb("what_helped").notNull(), // Array of strings
  whatHeldBack: jsonb("what_held_back").notNull(), // Array of strings
  focusNextWeek: text("focus_next_week").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_flomentum_weekly_unique").on(table.userId, table.weekStartDate),
  index("idx_flomentum_weekly_user_week").on(table.userId, table.weekStartDate),
]);

// Health baselines for recovery metrics (30-day rolling)
export const healthBaselines = pgTable("health_baselines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  metricKey: text("metric_key").notNull(), // 'resting_hr', 'hrv_sdnn_ms', 'respiratory_rate'
  baseline: real("baseline"), // The calculated baseline value
  windowDays: integer("window_days").notNull().default(30),
  numSamples: integer("num_samples").notNull(), // Number of days used
  lastCalculatedAt: timestamp("last_calculated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_health_baselines_unique").on(table.userId, table.metricKey),
  index("idx_health_baselines_user").on(table.userId),
]);

// Body fat reference ranges for DEXA scans
export const bodyFatReferenceRanges = pgTable("body_fat_reference_ranges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sex: referenceSexEnum("sex").notNull(),
  label: text("label").notNull(),
  minPercent: real("min_percent").notNull(),
  maxPercent: real("max_percent").notNull(),
  displayOrder: integer("display_order").notNull(),
}, (table) => [
  index("idx_body_fat_sex_order").on(table.sex, table.displayOrder),
]);

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  bloodWorkRecords: many(bloodWorkRecords),
  testSessions: many(biomarkerTestSessions),
  profile: one(profiles, {
    fields: [users.id],
    references: [profiles.userId],
  }),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
}));

export const bloodWorkRecordsRelations = relations(bloodWorkRecords, ({ one }) => ({
  user: one(users, {
    fields: [bloodWorkRecords.userId],
    references: [users.id],
  }),
  analysis: one(analysisResults, {
    fields: [bloodWorkRecords.id],
    references: [analysisResults.recordId],
  }),
}));

export const analysisResultsRelations = relations(analysisResults, ({ one }) => ({
  record: one(bloodWorkRecords, {
    fields: [analysisResults.recordId],
    references: [bloodWorkRecords.id],
  }),
}));

export const biomarkersRelations = relations(biomarkers, ({ many }) => ({
  synonyms: many(biomarkerSynonyms),
  units: many(biomarkerUnits),
  referenceRanges: many(biomarkerReferenceRanges),
  measurements: many(biomarkerMeasurements),
}));

export const biomarkerSynonymsRelations = relations(biomarkerSynonyms, ({ one }) => ({
  biomarker: one(biomarkers, {
    fields: [biomarkerSynonyms.biomarkerId],
    references: [biomarkers.id],
  }),
}));

export const biomarkerUnitsRelations = relations(biomarkerUnits, ({ one }) => ({
  biomarker: one(biomarkers, {
    fields: [biomarkerUnits.biomarkerId],
    references: [biomarkers.id],
  }),
}));

export const biomarkerReferenceRangesRelations = relations(biomarkerReferenceRanges, ({ one }) => ({
  biomarker: one(biomarkers, {
    fields: [biomarkerReferenceRanges.biomarkerId],
    references: [biomarkers.id],
  }),
}));

export const referenceProfilesRelations = relations(referenceProfiles, ({ many }) => ({
  ranges: many(referenceProfileRanges),
}));

export const referenceProfileRangesRelations = relations(referenceProfileRanges, ({ one }) => ({
  profile: one(referenceProfiles, {
    fields: [referenceProfileRanges.profileId],
    references: [referenceProfiles.id],
  }),
  biomarker: one(biomarkers, {
    fields: [referenceProfileRanges.biomarkerId],
    references: [biomarkers.id],
  }),
}));

export const biomarkerTestSessionsRelations = relations(biomarkerTestSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [biomarkerTestSessions.userId],
    references: [users.id],
  }),
  measurements: many(biomarkerMeasurements),
}));

export const biomarkerMeasurementsRelations = relations(biomarkerMeasurements, ({ one }) => ({
  session: one(biomarkerTestSessions, {
    fields: [biomarkerMeasurements.sessionId],
    references: [biomarkerTestSessions.id],
  }),
  biomarker: one(biomarkers, {
    fields: [biomarkerMeasurements.biomarkerId],
    references: [biomarkers.id],
  }),
}));

export const diagnosticsStudiesRelations = relations(diagnosticsStudies, ({ one, many }) => ({
  user: one(users, {
    fields: [diagnosticsStudies.userId],
    references: [users.id],
  }),
  metrics: many(diagnosticMetrics),
}));

export const diagnosticMetricsRelations = relations(diagnosticMetrics, ({ one }) => ({
  study: one(diagnosticsStudies, {
    fields: [diagnosticMetrics.studyId],
    references: [diagnosticsStudies.id],
  }),
}));

// Types and schemas
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Profile schemas
export const insertProfileSchema = createInsertSchema(profiles, {
  dateOfBirth: z.date().optional(),
  sex: SexEnum.optional(),
  weight: z.number().min(0).optional(),
  weightUnit: WeightUnitEnum.optional(),
  height: z.number().min(0).optional(),
  heightUnit: HeightUnitEnum.optional(),
  goals: z.array(HealthGoalEnum).optional(),
  healthBaseline: healthBaselineSchema.optional(),
  aiPersonalization: aiPersonalizationSchema.optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Section-specific update schemas
export const updateDemographicsSchema = z.object({
  dateOfBirth: z.date().optional(),
  sex: SexEnum.optional(),
  weight: z.number().min(0).optional(),
  weightUnit: WeightUnitEnum.optional(),
  height: z.number().min(0).optional(),
  heightUnit: HeightUnitEnum.optional(),
});

export const updateHealthBaselineSchema = z.object({
  healthBaseline: healthBaselineSchema,
});

export const updateGoalsSchema = z.object({
  goals: z.array(HealthGoalEnum),
});

export const updateAIPersonalizationSchema = z.object({
  aiPersonalization: aiPersonalizationSchema,
});

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;
export type UpdateDemographics = z.infer<typeof updateDemographicsSchema>;
export type UpdateHealthBaseline = z.infer<typeof updateHealthBaselineSchema>;
export type UpdateGoals = z.infer<typeof updateGoalsSchema>;
export type UpdateAIPersonalization = z.infer<typeof updateAIPersonalizationSchema>;

export const insertBloodWorkRecordSchema = createInsertSchema(bloodWorkRecords).omit({
  id: true,
  createdAt: true,
  uploadedAt: true,
});
export type InsertBloodWorkRecord = z.infer<typeof insertBloodWorkRecordSchema>;
export type BloodWorkRecord = typeof bloodWorkRecords.$inferSelect;

export const insertAnalysisResultSchema = createInsertSchema(analysisResults).omit({
  id: true,
  createdAt: true,
});
export type InsertAnalysisResult = z.infer<typeof insertAnalysisResultSchema>;
export type AnalysisResult = typeof analysisResults.$inferSelect;

// Admin schemas
export const updateUserRoleSchema = z.object({
  role: UserRoleEnum,
});

export const updateUserStatusSchema = z.object({
  status: UserStatusEnum,
});

export type UpdateUserRole = z.infer<typeof updateUserRoleSchema>;
export type UpdateUserStatus = z.infer<typeof updateUserStatusSchema>;

// Billing schemas
export const insertBillingCustomerSchema = createInsertSchema(billingCustomers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export const insertOpenaiUsageEventSchema = createInsertSchema(openaiUsageEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertBillingCustomer = z.infer<typeof insertBillingCustomerSchema>;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type InsertOpenaiUsageEvent = z.infer<typeof insertOpenaiUsageEventSchema>;
export type BillingCustomer = typeof billingCustomers.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type OpenaiUsageEvent = typeof openaiUsageEvents.$inferSelect;

// Query params validation schemas
export const listUsersQuerySchema = z.object({
  q: z.string().optional(),
  role: UserRoleEnum.optional(),
  status: UserStatusEnum.optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

export const updateUserSchema = z.object({
  role: UserRoleEnum.optional(),
  status: UserStatusEnum.optional(),
}).refine(data => data.role !== undefined || data.status !== undefined, {
  message: "At least one of 'role' or 'status' must be provided",
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;

// Admin user summary with enriched data
export const adminUserSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  role: UserRoleEnum,
  status: UserStatusEnum,
  subscriptionStatus: z.enum(['free', 'premium']),
  measurementCount: z.number(),
  lastUpload: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

// Biomarker schemas
export const insertBiomarkerSchema = createInsertSchema(biomarkers, {
  name: z.string().min(1),
  category: z.string().min(1),
  canonicalUnit: z.string().min(1),
  displayUnitPreference: z.string().optional(),
  precision: z.number().int().min(0).optional(),
  decimalsPolicy: DecimalsPolicyEnum.optional(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertBiomarkerSynonymSchema = createInsertSchema(biomarkerSynonyms, {
  biomarkerId: z.string().uuid(),
  label: z.string().min(1),
  exact: z.boolean().optional(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertBiomarkerUnitSchema = createInsertSchema(biomarkerUnits, {
  biomarkerId: z.string().uuid(),
  fromUnit: z.string().min(1),
  toUnit: z.string().min(1),
  conversionType: ConversionTypeEnum,
  multiplier: z.number().finite("Multiplier must be a finite number"),
  offset: z.number().finite("Offset must be a finite number").optional(),
  notes: z.string().optional(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertBiomarkerReferenceRangeSchema = createInsertSchema(biomarkerReferenceRanges, {
  biomarkerId: z.string().uuid(),
  unit: z.string().min(1),
  sex: ReferenceSexEnum.optional(),
  ageMinY: z.number().min(0).optional(),
  ageMaxY: z.number().min(0).optional(),
  context: z.record(z.any()).optional(),
  low: z.number().optional(),
  high: z.number().optional(),
  criticalLow: z.number().optional(),
  criticalHigh: z.number().optional(),
  labId: z.string().optional(),
  source: z.string().optional(),
}).omit({
  id: true,
  createdAt: true,
});

export type InsertBiomarker = z.infer<typeof insertBiomarkerSchema>;
export type InsertBiomarkerSynonym = z.infer<typeof insertBiomarkerSynonymSchema>;
export type InsertBiomarkerUnit = z.infer<typeof insertBiomarkerUnitSchema>;
export type InsertBiomarkerReferenceRange = z.infer<typeof insertBiomarkerReferenceRangeSchema>;

export type Biomarker = typeof biomarkers.$inferSelect;
export type BiomarkerSynonym = typeof biomarkerSynonyms.$inferSelect;
export type BiomarkerUnit = typeof biomarkerUnits.$inferSelect;
export type BiomarkerReferenceRange = typeof biomarkerReferenceRanges.$inferSelect;

export const insertBiomarkerTestSessionSchema = createInsertSchema(biomarkerTestSessions, {
  testDate: z.date(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertBiomarkerMeasurementSchema = createInsertSchema(biomarkerMeasurements, {
  valueRaw: z.number(),
  valueCanonical: z.number(),
  referenceLow: z.number().optional(),
  referenceHigh: z.number().optional(),
}).omit({
  id: true,
  createdAt: true,
});

export type InsertBiomarkerTestSession = z.infer<typeof insertBiomarkerTestSessionSchema>;
export type InsertBiomarkerMeasurement = z.infer<typeof insertBiomarkerMeasurementSchema>;

export type BiomarkerTestSession = typeof biomarkerTestSessions.$inferSelect;
export type BiomarkerMeasurement = typeof biomarkerMeasurements.$inferSelect;

export const insertLabUploadJobSchema = createInsertSchema(labUploadJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLabUploadJob = z.infer<typeof insertLabUploadJobSchema>;
export type LabUploadJob = typeof labUploadJobs.$inferSelect;

export const insertHealthInsightsSchema = createInsertSchema(healthInsights).omit({
  id: true,
  generatedAt: true,
});

export type InsertHealthInsights = z.infer<typeof insertHealthInsightsSchema>;
export type HealthInsights = typeof healthInsights.$inferSelect;

// Normalization schemas
export const normalizationInputSchema = z.object({
  name: z.string().min(1, "Biomarker name is required"),
  value: z.number().finite("Value must be a finite number"),
  unit: z.string().min(1, "Unit is required"),
  sex: z.enum(["male", "female"]).optional(),
  age_years: z.number().min(0).max(150).optional(),
  fasting: z.boolean().optional(),
  pregnancy: z.boolean().optional(),
  method: z.string().optional(),
  lab_id: z.string().optional(),
});

export const bulkNormalizationInputSchema = z.object({
  measurements: z.array(normalizationInputSchema).min(1, "At least one measurement is required"),
});

export type NormalizationInput = z.infer<typeof normalizationInputSchema>;
export type BulkNormalizationInput = z.infer<typeof bulkNormalizationInputSchema>;

// Biomarker API schemas
// Include enums for query parameters
export const BiomarkerIncludeEnum = z.enum(["units", "ranges"]);
export const BiomarkerUnitsIncludeEnum = z.enum(["conversions"]);

// Helper to parse comma-separated string or array into array
const includeArraySchema = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      return val.split(",").map(s => s.trim());
    }
    return val;
  },
  z.array(BiomarkerIncludeEnum).optional()
);

const unitsIncludeArraySchema = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      return val.split(",").map(s => s.trim());
    }
    return val;
  },
  z.array(BiomarkerUnitsIncludeEnum).optional()
);

// GET /api/biomarkers query schema
export const getBiomarkersQuerySchema = z.object({
  include: includeArraySchema,
  groupBy: z.enum(["category"]).optional(),
});

// GET /api/biomarkers/:id/units query schema
export const getBiomarkerUnitsQuerySchema = z.object({
  include: unitsIncludeArraySchema,
});

// GET /api/biomarkers/:id/reference-range query schema
export const getBiomarkerReferenceRangeQuerySchema = z.object({
  age: z.coerce.number().min(0).max(150).optional(),
  sex: z.enum(["male", "female"]).optional(),
  fasting: z.coerce.boolean().optional(),
  pregnancy: z.coerce.boolean().optional(),
  method: z.string().optional(),
  labId: z.string().optional(),
  context: z.enum(["auto"]).optional(), // If "auto", use authenticated user's profile
});

// Response DTOs
export const biomarkerSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: z.string(),
  canonicalUnit: z.string(),
  displayUnitPreference: z.string().optional(),
});

export const biomarkerWithDetailsSchema = biomarkerSummarySchema.extend({
  units: z.array(z.string()).optional(), // Unique unit list if include=units
  ranges: z.array(z.object({
    id: z.string().uuid(),
    unit: z.string(),
    sex: z.string(),
    low: z.number().nullable(),
    high: z.number().nullable(),
    criticalLow: z.number().nullable(),
    criticalHigh: z.number().nullable(),
    source: z.string().nullable(),
  })).optional(), // Reference ranges if include=ranges
});

export const biomarkerUnitResponseSchema = z.object({
  unit: z.string(),
  canonical: z.boolean(), // True if this is the canonical unit
  conversions: z.array(z.object({
    fromUnit: z.string(),
    toUnit: z.string(),
    conversionType: z.enum(["ratio", "affine"]),
    multiplier: z.number(),
    offset: z.number().optional(),
  })).optional(), // Include conversion metadata if include=conversions
});

export const referenceRangeResponseSchema = z.object({
  low: z.number().nullable(),
  high: z.number().nullable(),
  unit: z.string(),
  criticalLow: z.number().nullable(),
  criticalHigh: z.number().nullable(),
  source: z.string().nullable(),
  context: z.record(z.any()).nullable(),
});

// Export types
export type GetBiomarkersQuery = z.infer<typeof getBiomarkersQuerySchema>;
export type GetBiomarkerUnitsQuery = z.infer<typeof getBiomarkerUnitsQuerySchema>;
export type GetBiomarkerReferenceRangeQuery = z.infer<typeof getBiomarkerReferenceRangeQuerySchema>;
export type BiomarkerSummary = z.infer<typeof biomarkerSummarySchema>;
export type BiomarkerWithDetails = z.infer<typeof biomarkerWithDetailsSchema>;
export type BiomarkerUnitResponse = z.infer<typeof biomarkerUnitResponseSchema>;
export type ReferenceRangeResponse = z.infer<typeof referenceRangeResponseSchema>;

// Auth provider schemas
export const insertAuthProviderSchema = createInsertSchema(authProviders, {
  // Coerce date fields from ISO strings (mobile payload format)
  expiresAt: z.coerce.date().nullable().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const authProviderSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  provider: z.enum(["replit", "apple", "google", "email"]),
  providerUserId: z.string(),
  email: z.string().nullable(), // Aligned with Drizzle varchar (no email validation on select)
  accessToken: z.string().nullable(),
  refreshToken: z.string().nullable(),
  expiresAt: z.date().nullable(),
  metadata: z.record(z.unknown()).nullable(), // JSONB - accept any object structure
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type InsertAuthProvider = z.infer<typeof insertAuthProviderSchema>;
export type AuthProvider = typeof authProviders.$inferSelect;

// User credentials schemas
export const insertUserCredentialsSchema = createInsertSchema(userCredentials, {
  // Coerce date fields from ISO strings
  lastLoginAt: z.coerce.date().nullable().optional(),
  resetTokenExpiresAt: z.coerce.date().nullable().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const userCredentialsSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  passwordHash: z.string(),
  lastLoginAt: z.date().nullable(),
  resetToken: z.string().nullable(),
  resetTokenExpiresAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type InsertUserCredentials = z.infer<typeof insertUserCredentialsSchema>;
export type UserCredentials = typeof userCredentials.$inferSelect;

// Diagnostic study schemas
export const insertDiagnosticsStudySchema = createInsertSchema(diagnosticsStudies, {
  studyDate: z.coerce.date(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const diagnosticsStudySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: DiagnosticTypeEnum,
  source: DiagnosticSourceEnum,
  studyDate: z.date(),
  ageAtScan: z.number().nullable(),
  totalScoreNumeric: z.number().nullable(),
  riskCategory: z.string().nullable(),
  agePercentile: z.number().nullable(),
  aiPayload: z.record(z.unknown()),
  status: DiagnosticStatusEnum,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type InsertDiagnosticsStudy = z.infer<typeof insertDiagnosticsStudySchema>;
export type DiagnosticsStudy = typeof diagnosticsStudies.$inferSelect;

// Diagnostic metrics schemas
export const insertDiagnosticMetricSchema = createInsertSchema(diagnosticMetrics).omit({
  id: true,
});

export const diagnosticMetricSchema = z.object({
  id: z.string().uuid(),
  studyId: z.string().uuid(),
  code: z.string(),
  label: z.string(),
  valueNumeric: z.number().nullable(),
  unit: z.string().nullable(),
  extra: z.record(z.unknown()).nullable(),
});

export type InsertDiagnosticMetric = z.infer<typeof insertDiagnosticMetricSchema>;
export type DiagnosticMetric = typeof diagnosticMetrics.$inferSelect;

// Flō Score schemas
export const insertFloScoreSchema = createInsertSchema(floScores).omit({
  id: true,
});

export const floScoreSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  score: z.number().int().min(0).max(100),
  calculatedAt: z.date(),
  dataSnapshot: z.record(z.unknown()).nullable(),
});

export type InsertFloScore = z.infer<typeof insertFloScoreSchema>;
export type FloScore = typeof floScores.$inferSelect;

// Component Score schemas
export const insertComponentScoreSchema = createInsertSchema(componentScores).omit({
  id: true,
});

export const componentScoreSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  cardiometabolic: z.number().int().min(0).max(100).nullable(),
  bodyComposition: z.number().int().min(0).max(100).nullable(),
  readiness: z.number().int().min(0).max(100).nullable(),
  inflammation: z.number().int().min(0).max(100).nullable(),
  calculatedAt: z.date(),
  dataSnapshot: z.record(z.unknown()).nullable(),
});

export type InsertComponentScore = z.infer<typeof insertComponentScoreSchema>;
export type ComponentScore = typeof componentScores.$inferSelect;

// Blood Pressure Reading schemas
export const insertBloodPressureReadingSchema = createInsertSchema(bloodPressureReadings).omit({
  id: true,
  createdAt: true,
});

export const bloodPressureReadingSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  systolic: z.number().int().min(50).max(250),
  diastolic: z.number().int().min(30).max(150),
  heartRate: z.number().int().min(30).max(220).nullable(),
  source: z.string(),
  measuredAt: z.date(),
  createdAt: z.date(),
});

export type InsertBloodPressureReading = z.infer<typeof insertBloodPressureReadingSchema>;
export type BloodPressureReading = typeof bloodPressureReadings.$inferSelect;

// HealthKit Sample schemas
export const insertHealthkitSampleSchema = createInsertSchema(healthkitSamples).omit({
  id: true,
  createdAt: true,
});

export const healthkitSampleSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  dataType: z.string(),
  value: z.number(),
  unit: z.string(),
  startDate: z.date(),
  endDate: z.date(),
  sourceName: z.string().nullable(),
  sourceBundleId: z.string().nullable(),
  deviceName: z.string().nullable(),
  deviceManufacturer: z.string().nullable(),
  deviceModel: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  uuid: z.string().nullable(),
  createdAt: z.date(),
});

export type InsertHealthkitSample = z.infer<typeof insertHealthkitSampleSchema>;
export type HealthkitSample = typeof healthkitSamples.$inferSelect;

// User Daily Metrics schemas
export const insertUserDailyMetricsSchema = createInsertSchema(userDailyMetrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Accept ISO8601 strings from iOS and coerce to Date objects
  utcDayStart: z.union([z.date(), z.string().transform(str => new Date(str))]),
  utcDayEnd: z.union([z.date(), z.string().transform(str => new Date(str))]),
});

export type InsertUserDailyMetrics = z.infer<typeof insertUserDailyMetricsSchema>;
export type UserDailyMetrics = typeof userDailyMetrics.$inferSelect;

// User Metric Baselines schemas
export const insertUserMetricBaselinesSchema = createInsertSchema(userMetricBaselines).omit({
  id: true,
  lastCalculatedAt: true,
});

export type InsertUserMetricBaselines = z.infer<typeof insertUserMetricBaselinesSchema>;
export type UserMetricBaselines = typeof userMetricBaselines.$inferSelect;

// User Daily Readiness schemas
export const insertUserDailyReadinessSchema = createInsertSchema(userDailyReadiness).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserDailyReadiness = z.infer<typeof insertUserDailyReadinessSchema>;
export type UserDailyReadiness = typeof userDailyReadiness.$inferSelect;

// Sleep Nights schemas
export const insertSleepNightsSchema = createInsertSchema(sleepNights).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Accept ISO8601 strings from iOS and coerce to Date objects
  nightStart: z.union([z.date(), z.string().transform(str => new Date(str))]).nullable().optional(),
  finalWake: z.union([z.date(), z.string().transform(str => new Date(str))]).nullable().optional(),
  sleepOnset: z.union([z.date(), z.string().transform(str => new Date(str))]).nullable().optional(),
});

export type InsertSleepNight = z.infer<typeof insertSleepNightsSchema>;
export type SleepNight = typeof sleepNights.$inferSelect;

// Sleep Subscores schemas
export const insertSleepSubscoresSchema = createInsertSchema(sleepSubscores).omit({
  id: true,
  createdAt: true,
});

export type InsertSleepSubscore = z.infer<typeof insertSleepSubscoresSchema>;
export type SleepSubscore = typeof sleepSubscores.$inferSelect;

// Sleep Baselines schemas
export const insertSleepBaselinesSchema = createInsertSchema(sleepBaselines).omit({
  id: true,
  lastCalculatedAt: true,
});

export type InsertSleepBaseline = z.infer<typeof insertSleepBaselinesSchema>;
export type SleepBaseline = typeof sleepBaselines.$inferSelect;

// Mobile auth request schemas
export const appleSignInSchema = z.object({
  identityToken: z.string(),
  authorizationCode: z.string().optional(),
  email: z.string().email().nullable().optional(),
  givenName: z.string().nullable().optional(),
  familyName: z.string().nullable().optional(),
  user: z.string(), // Apple user ID
});

export const googleSignInSchema = z.object({
  idToken: z.string(),
  accessToken: z.string().optional(),
  serverAuthCode: z.string().optional(),
  email: z.string().email(),
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  userId: z.string(), // Google user ID
});

export const emailRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(50).optional().or(z.literal("")), // Allow empty or missing
  lastName: z.string().min(1).max(50).optional().or(z.literal("")),  // Allow empty or missing
});

export const emailLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const passwordResetSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8).max(128),
});

export type AppleSignIn = z.infer<typeof appleSignInSchema>;
export type GoogleSignIn = z.infer<typeof googleSignInSchema>;
export type EmailRegister = z.infer<typeof emailRegisterSchema>;
export type EmailLogin = z.infer<typeof emailLoginSchema>;
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
export type PasswordReset = z.infer<typeof passwordResetSchema>;

// Body fat reference range schemas
export const insertBodyFatReferenceRangeSchema = createInsertSchema(bodyFatReferenceRanges).omit({
  id: true,
});

export const bodyFatReferenceRangeSchema = z.object({
  id: z.string().uuid(),
  sex: ReferenceSexEnum,
  label: z.string(),
  minPercent: z.number(),
  maxPercent: z.number(),
  displayOrder: z.number(),
});

export type InsertBodyFatReferenceRange = z.infer<typeof insertBodyFatReferenceRangeSchema>;
export type BodyFatReferenceRange = typeof bodyFatReferenceRanges.$inferSelect;

// Flōmentum schemas
export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettings.$inferSelect;

export const insertHealthDailyMetricsSchema = createInsertSchema(healthDailyMetrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHealthDailyMetrics = z.infer<typeof insertHealthDailyMetricsSchema>;
export type HealthDailyMetrics = typeof healthDailyMetrics.$inferSelect;

export const insertFlomentumDailySchema = createInsertSchema(flomentumDaily).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFlomentumDaily = z.infer<typeof insertFlomentumDailySchema>;
export type FlomentumDaily = typeof flomentumDaily.$inferSelect;

export const insertFlomentumWeeklySchema = createInsertSchema(flomentumWeekly).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFlomentumWeekly = z.infer<typeof insertFlomentumWeeklySchema>;
export type FlomentumWeekly = typeof flomentumWeekly.$inferSelect;

export const insertHealthBaselinesSchema = createInsertSchema(healthBaselines).omit({
  id: true,
  lastCalculatedAt: true,
});

export type InsertHealthBaselines = z.infer<typeof insertHealthBaselinesSchema>;
export type HealthBaselines = typeof healthBaselines.$inferSelect;
