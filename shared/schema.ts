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

// Action plan enums
export const actionPlanStatusEnum = pgEnum("action_plan_status", ["active", "completed", "dismissed"]);

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
  
  // Daily reminder preferences
  reminderEnabled: boolean("reminder_enabled").default(true).notNull(),
  reminderTime: varchar("reminder_time").default("08:15").notNull(), // HH:MM format (24hr)
  reminderTimezone: varchar("reminder_timezone").default("UTC").notNull(), // IANA timezone
  
  // Insights v2.0 - User timezone for local-time cron jobs
  timezone: varchar("timezone").default("America/Los_Angeles").notNull(), // IANA timezone for 06:00 local insights
  
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

// API keys table - for iOS Shortcuts and external integrations
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }), // One key per user
  keyHash: text("key_hash").notNull(), // bcrypt hash of the API key
  name: varchar("name").default("Personal API Key").notNull(), // Friendly name
  lastUsedAt: timestamp("last_used_at"), // Track usage
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("api_keys_user_idx").on(table.userId),
]);

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

// System settings table for admin-configurable app settings
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settingKey: text("setting_key").notNull().unique(),
  settingValue: text("setting_value").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  keyIdx: uniqueIndex("system_settings_key_idx").on(table.settingKey),
}));

// Notification system enums and tables
export const notificationTriggerTypeEnum = pgEnum("notification_trigger_type", [
  "biomarker_out_of_range",
  "biomarker_critical",
  "flomentum_zone_change",
  "ai_insight_generated",
  "custom"
]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "sent",
  "failed",
  "cancelled"
]);

// Admin notification trigger configuration
export const notificationTriggers = pgTable("notification_triggers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  triggerType: notificationTriggerTypeEnum("trigger_type").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  
  // Biomarker-specific configuration
  biomarkerId: varchar("biomarker_id").references(() => biomarkers.id, { onDelete: "cascade" }),
  
  // Notification content
  title: text("title").notNull(),
  body: text("body").notNull(),
  
  // Trigger conditions (JSON)
  triggerConditions: jsonb("trigger_conditions"), // e.g., { thresholdType: "critical", scope: "all_users" }
  
  // Metadata
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  biomarkerIdx: index("notification_triggers_biomarker_idx").on(table.biomarkerId),
  activeIdx: index("notification_triggers_active_idx").on(table.isActive),
}));

// Notification delivery logs
export const notificationLogs = pgTable("notification_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  triggerId: varchar("trigger_id").references(() => notificationTriggers.id, { onDelete: "set null" }),
  
  title: text("title").notNull(),
  body: text("body").notNull(),
  
  status: notificationStatusEnum("status").default("pending").notNull(),
  sentAt: timestamp("sent_at"),
  failureReason: text("failure_reason"),
  
  // Context data (what triggered this notification)
  contextData: jsonb("context_data"), // e.g., { bloodWorkId, biomarkerId, value, referenceRange }
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("notification_logs_user_idx").on(table.userId),
  statusIdx: index("notification_logs_status_idx").on(table.status),
  createdAtIdx: index("notification_logs_created_at_idx").on(table.createdAt),
}));

// Device tokens for push notifications
export const deviceTokens = pgTable("device_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceToken: text("device_token").notNull().unique(),
  platform: text("platform").notNull().default("ios"), // Future: support android
  isActive: boolean("is_active").default(true).notNull(),
  lastUsedAt: timestamp("last_used_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("device_tokens_user_idx").on(table.userId),
  activeIdx: index("device_tokens_active_idx").on(table.isActive),
  tokenIdx: uniqueIndex("device_tokens_token_idx").on(table.deviceToken),
}));

// APNs configuration (admin-managed)
export const apnsConfiguration = pgTable("apns_configuration", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  environment: text("environment").notNull().default("sandbox"), // "sandbox" or "production"
  teamId: text("team_id").notNull(),
  keyId: text("key_id").notNull(),
  signingKey: text("signing_key").notNull(), // .p8 file content (encrypted at rest)
  bundleId: text("bundle_id").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  envIdx: index("apns_config_env_idx").on(table.environment),
  activeIdx: index("apns_config_active_idx").on(table.isActive),
}));

// Insights system enums and tables
export const insightCategoryEnum = pgEnum("insight_category", [
  "activity_sleep",
  "recovery_hrv",
  "sleep_quality",
  "biomarkers",
  "nutrition",
  "stress",
  "general"
]);

// Discovered health insight cards
export const insightCards = pgTable("insight_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  category: insightCategoryEnum("category").notNull(),
  pattern: text("pattern").notNull(), // Human-readable pattern description
  confidence: real("confidence").notNull(), // 0.0-1.0
  supportingData: text("supporting_data"), // Brief summary (e.g., "Based on 18 days")
  details: jsonb("details"), // Extended data: { daysAnalyzed, avgBefore, avgAfter, dateRange, etc. }
  isNew: boolean("is_new").default(true).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("insight_cards_user_idx").on(table.userId),
  categoryIdx: index("insight_cards_category_idx").on(table.category),
  confidenceIdx: index("insight_cards_confidence_idx").on(table.confidence),
  activeIdx: index("insight_cards_active_idx").on(table.isActive),
}));

// Health data embeddings for RAG (vector stored via Supabase pgvector)
export const healthEmbeddings = pgTable("health_embeddings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(), // "blood_work", "healthkit_daily", "insight_card", "sleep_night"
  content: text("content").notNull(), // Text representation for embedding
  metadata: jsonb("metadata").notNull(), // { bloodWorkId, date, biomarkers, etc. }
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("health_embeddings_user_idx").on(table.userId),
  typeIdx: index("health_embeddings_type_idx").on(table.contentType),
}));

// Life events - conversational logging of user behaviors
// Captured from natural language: "just did a 6-min ice bath", "had pizza at 10pm", "took NMN"
export const lifeEvents = pgTable("life_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(), // e.g., 'ice_bath', 'alcohol', 'late_meal', 'supplements', 'breathwork', etc.
  details: jsonb("details").default(sql`'{}'`), // e.g., {duration_min: 6, temp_c: 6} or {drinks: 2}
  notes: text("notes"), // Original user message
  happenedAt: timestamp("happened_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userTimeIdx: index("life_events_user_time_idx").on(table.userId, table.happenedAt),
  eventTypeIdx: index("life_events_type_idx").on(table.eventType),
}));

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

// AI usage tracking for admin analytics (OpenAI + Grok)
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

// HealthKit workouts - stores individual workout sessions from iOS HealthKit
export const healthkitWorkouts = pgTable("healthkit_workouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workoutType: text("workout_type").notNull(), // running, cycling, strength, etc.
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  duration: real("duration").notNull(), // Duration in minutes
  totalDistance: real("total_distance"), // Distance in meters (nullable for strength training)
  totalDistanceUnit: text("total_distance_unit"), // meters, kilometers, miles
  totalEnergyBurned: real("total_energy_burned"), // Calories burned
  totalEnergyBurnedUnit: text("total_energy_burned_unit"), // kcal, joules
  averageHeartRate: real("average_heart_rate"), // Average BPM during workout
  maxHeartRate: real("max_heart_rate"), // Max BPM during workout
  minHeartRate: real("min_heart_rate"), // Min BPM during workout
  sourceName: text("source_name"), // App that recorded the workout
  sourceBundleId: text("source_bundle_id"), // Bundle identifier
  deviceName: text("device_name"), // Device name (e.g., "Apple Watch")
  deviceManufacturer: text("device_manufacturer"), // Device manufacturer
  deviceModel: text("device_model"), // Device model
  metadata: jsonb("metadata"), // Additional metadata (weather, indoor/outdoor, etc.)
  uuid: text("uuid").unique(), // HealthKit workout UUID (for deduplication)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_healthkit_workouts_user_date").on(table.userId, table.startDate),
  index("idx_healthkit_workouts_user_type").on(table.userId, table.workoutType),
  index("idx_healthkit_workouts_uuid").on(table.uuid),
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

export const updateReminderPreferencesSchema = z.object({
  reminderEnabled: z.boolean().optional(),
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(), // HH:MM format (24hr)
  reminderTimezone: z.string().optional(), // IANA timezone
});

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;
export type UpdateDemographics = z.infer<typeof updateDemographicsSchema>;
export type UpdateHealthBaseline = z.infer<typeof updateHealthBaselineSchema>;
export type UpdateGoals = z.infer<typeof updateGoalsSchema>;
export type UpdateAIPersonalization = z.infer<typeof updateAIPersonalizationSchema>;
export type UpdateReminderPreferences = z.infer<typeof updateReminderPreferencesSchema>;

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

export const insertSystemSettingsSchema = createInsertSchema(systemSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOpenaiUsageEventSchema = createInsertSchema(openaiUsageEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertBillingCustomer = z.infer<typeof insertBillingCustomerSchema>;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type InsertSystemSettings = z.infer<typeof insertSystemSettingsSchema>;
export type InsertOpenaiUsageEvent = z.infer<typeof insertOpenaiUsageEventSchema>;
export type BillingCustomer = typeof billingCustomers.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type SystemSettings = typeof systemSettings.$inferSelect;
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

// Notification system Zod enums
export const NotificationTriggerTypeEnum = z.enum([
  "biomarker_out_of_range",
  "biomarker_critical",
  "flomentum_zone_change",
  "ai_insight_generated",
  "custom"
]);

export const NotificationStatusEnum = z.enum([
  "pending",
  "sent",
  "failed",
  "cancelled"
]);

// Trigger condition schemas for validation
const thresholdConditionSchema = z.object({
  operator: z.enum(['greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'equals', 'not_equals']),
  threshold: z.number(),
});

const rangeConditionSchema = z.object({
  ranges: z.array(z.object({
    min: z.number().optional(),
    max: z.number().optional(),
  })).min(1),
});

// Union of all supported trigger condition types
// Note: Severity-based conditions removed until backend implementation is complete
export const triggerConditionSchema = z.union([
  z.object({}).strict(), // Empty object (strict) = use default reference range logic
  thresholdConditionSchema,
  rangeConditionSchema,
]).nullable().optional();

// Notification trigger schemas
export const insertNotificationTriggerSchema = createInsertSchema(notificationTriggers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  triggerConditions: triggerConditionSchema,
});

export type InsertNotificationTrigger = z.infer<typeof insertNotificationTriggerSchema>;
export type NotificationTrigger = typeof notificationTriggers.$inferSelect;

// Notification log schemas
export const insertNotificationLogSchema = createInsertSchema(notificationLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertNotificationLog = z.infer<typeof insertNotificationLogSchema>;
export type NotificationLog = typeof notificationLogs.$inferSelect;

// Device token schemas
export const insertDeviceTokenSchema = createInsertSchema(deviceTokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDeviceToken = z.infer<typeof insertDeviceTokenSchema>;
export type DeviceToken = typeof deviceTokens.$inferSelect;

// APNs configuration schemas
export const insertApnsConfigurationSchema = createInsertSchema(apnsConfiguration).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertApnsConfiguration = z.infer<typeof insertApnsConfigurationSchema>;
export type ApnsConfiguration = typeof apnsConfiguration.$inferSelect;

// Insight category enum for validation
export const InsightCategoryEnum = z.enum([
  "activity_sleep",
  "recovery_hrv",
  "sleep_quality",
  "biomarkers",
  "nutrition",
  "stress",
  "general"
]);

// Insight card schemas
export const insertInsightCardSchema = createInsertSchema(insightCards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInsightCard = z.infer<typeof insertInsightCardSchema>;
export type InsightCard = typeof insightCards.$inferSelect;

// Health embedding schemas
export const insertHealthEmbeddingSchema = createInsertSchema(healthEmbeddings).omit({
  id: true,
  createdAt: true,
});

export type InsertHealthEmbedding = z.infer<typeof insertHealthEmbeddingSchema>;
export type HealthEmbedding = typeof healthEmbeddings.$inferSelect;

// Life event schemas
export const insertLifeEventSchema = createInsertSchema(lifeEvents).omit({
  id: true,
  createdAt: true,
}).extend({
  happenedAt: z.coerce.date().optional(), // Allow override, default to now
});

export type InsertLifeEvent = z.infer<typeof insertLifeEventSchema>;
export type LifeEvent = typeof lifeEvents.$inferSelect;

// ============================================================================
// Daily Insights Engine v2.0 - Science-First Proactive Health Intelligence
// ============================================================================

// Evidence hierarchy for insights (Tier 1 = strongest evidence)
export const evidenceTierEnum = pgEnum("evidence_tier", ["1", "2", "3", "4", "5"]);

// Freshness categories for slow-moving biomarkers
export const freshnessCategoryEnum = pgEnum("freshness_category", ["green", "yellow", "red"]);

// Insight replication history - tracks personal Tier 5 evidence
// When a pattern is replicated ≥2 times with ≥medium effect, it becomes Tier 5 evidence
export const insightReplicationHistory = pgTable("insight_replication_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  patternSignature: text("pattern_signature").notNull(), // e.g., "alcohol_intake → sleep_deep_minutes_decrease"
  generatingLayer: text("generating_layer").notNull(), // "A_physiological", "B_open_discovery", "C_dose_response", "D_anomaly"
  independentVariable: text("independent_variable").notNull(), // e.g., "alcohol_intake", "ferritin_low"
  dependentVariable: text("dependent_variable").notNull(), // e.g., "sleep_deep_minutes", "hrv_sdnn_ms"
  effectSize: real("effect_size").notNull(), // Spearman ρ or Cliff's delta
  windowType: text("window_type").notNull(), // "short_term", "medium_term", "long_term"
  dateRange: jsonb("date_range").notNull(), // { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
  metadata: jsonb("metadata"), // { avgBefore, avgAfter, nSamples, bayesianProb, etc. }
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
}, (table) => ({
  userPatternIdx: index("insight_replication_user_pattern_idx").on(table.userId, table.patternSignature),
  userLayerIdx: index("insight_replication_user_layer_idx").on(table.userId, table.generatingLayer),
  userIdx: index("insight_replication_user_idx").on(table.userId),
  detectedIdx: index("insight_replication_detected_idx").on(table.detectedAt),
}));

// Biomarker freshness metadata - tracks staleness of slow-moving data
// Used for "stale lab early warning" system
export const biomarkerFreshnessMetadata = pgTable("biomarker_freshness_metadata", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  biomarkerId: varchar("biomarker_id").notNull().references(() => biomarkers.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id").notNull().references(() => biomarkerTestSessions.id, { onDelete: "cascade" }),
  testDate: timestamp("test_date").notNull(),
  ageMonths: real("age_months").notNull(), // Calculated age in months since test
  freshnessCategory: freshnessCategoryEnum("freshness_category").notNull(), // green ≤3mo, yellow 3-9mo, red ≥9mo
  decayWeight: real("decay_weight").notNull(), // Exponential decay λ=0.15/month → 41% at 6mo, 17% at 12mo
  lastCalculatedAt: timestamp("last_calculated_at").defaultNow().notNull(),
}, (table) => ({
  userBiomarkerIdx: uniqueIndex("biomarker_freshness_user_biomarker_idx").on(table.userId, table.biomarkerId),
  freshnessIdx: index("biomarker_freshness_category_idx").on(table.freshnessCategory),
  userIdx: index("biomarker_freshness_user_idx").on(table.userId),
}));

// Insight feedback - user ratings for adjusting pathway weights
// Powers the "Helpful/Accurate" feedback loop
export const insightFeedback = pgTable("insight_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  insightId: varchar("insight_id"), // Reference to generated insight (if stored separately)
  patternSignature: text("pattern_signature").notNull(), // Same format as replication history
  isHelpful: boolean("is_helpful"), // True/False/null
  isAccurate: boolean("is_accurate"), // True/False/null
  feedbackNotes: text("feedback_notes"), // Optional user comment
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userPatternIdx: index("insight_feedback_user_pattern_idx").on(table.userId, table.patternSignature),
  userIdx: index("insight_feedback_user_idx").on(table.userId),
}));

// Daily generated insights v2.0
// Replaces correlation engine with evidence-based multi-layer approach
export const dailyInsights = pgTable("daily_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  generatedDate: text("generated_date").notNull(), // YYYY-MM-DD
  
  // Insight content
  title: text("title").notNull(), // Short punchy headline
  body: text("body").notNull(), // Magnitude + evidence + context + freshness note
  action: text("action"), // Exact recommendation or experiment
  
  // Progress tracking (for biomarker-related insights)
  targetBiomarker: text("target_biomarker"), // Name of the biomarker being tracked (e.g., "Vitamin D")
  currentValue: real("current_value"), // Current value (e.g., 28)
  targetValue: real("target_value"), // Target value to achieve (e.g., 50)
  unit: text("unit"), // Unit of measurement (e.g., "ng/mL")
  
  // Scoring and classification
  confidenceScore: real("confidence_score").notNull(), // 0-100
  impactScore: real("impact_score").notNull(), // 0-100
  actionabilityScore: real("actionability_score").notNull(), // 0-100
  freshnessScore: real("freshness_score").notNull(), // 0-100
  overallScore: real("overall_score").notNull(), // Confidence × Impact × Actionability × Freshness
  
  // Evidence and sources
  evidenceTier: evidenceTierEnum("evidence_tier").notNull(),
  primarySources: text("primary_sources").array().notNull(), // ["Sleep", "Life Events", "Labs (yellow)"]
  category: insightCategoryEnum("category").notNull(),
  
  // Layer that generated this insight
  generatingLayer: text("generating_layer").notNull(), // "A_physiological", "B_open_discovery", "C_dose_response", "D_anomaly"
  
  // Supporting data
  details: jsonb("details").notNull(), // Extended data: { daysAnalyzed, avgBefore, avgAfter, dateRange, correlationStrength, etc. }
  
  // User interaction
  isNew: boolean("is_new").default(true).notNull(),
  isDismissed: boolean("is_dismissed").default(false).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // v2.0 allows multiple insights per user per day (0-5 insights)
  // Changed from uniqueIndex to regular index
  userDateIdx: index("daily_insights_user_date_idx").on(table.userId, table.generatedDate),
  userIdx: index("daily_insights_user_idx").on(table.userId),
  scoreIdx: index("daily_insights_score_idx").on(table.overallScore),
  categoryIdx: index("daily_insights_category_idx").on(table.category),
  tierIdx: index("daily_insights_tier_idx").on(table.evidenceTier),
}));

// Action Plan Items - user-selected insights saved to action plan
// Snapshots insight content to preserve even if original insight changes
export const actionPlanItems = pgTable("action_plan_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Reference to original daily insight (nullable for future manual entries)
  dailyInsightId: varchar("daily_insight_id").references(() => dailyInsights.id, { onDelete: "set null" }),
  
  // Snapshot fields - preserve content even if original insight changes/deleted
  snapshotTitle: text("snapshot_title").notNull(),
  snapshotInsight: text("snapshot_insight").notNull(), // The "insight" text
  snapshotAction: text("snapshot_action").notNull(), // The "recommended action" text
  category: insightCategoryEnum("category").notNull(),
  
  // Progress tracking
  status: actionPlanStatusEnum("status").notNull().default("active"),
  biomarkerId: varchar("biomarker_id").references(() => biomarkers.id, { onDelete: "set null" }), // For deterministic biomarker joins
  targetBiomarker: text("target_biomarker"), // Display name e.g., "Vitamin D"
  currentValue: real("current_value"), // Starting value
  targetValue: real("target_value"), // Goal value
  unit: text("unit"), // e.g., "ng/mL"
  
  // Metadata for additional tracking
  metadata: jsonb("metadata"), // { progressData, notes, etc. }
  
  // Timestamps
  addedAt: timestamp("added_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("action_plan_items_user_idx").on(table.userId),
  statusIdx: index("action_plan_items_status_idx").on(table.status),
  // Prevent duplicate active entries for same insight
  userInsightStatusIdx: uniqueIndex("action_plan_items_user_insight_active_idx")
    .on(table.userId, table.dailyInsightId)
    .where(sql`${table.status} = 'active' AND ${table.dailyInsightId} IS NOT NULL`),
}));

// Zod enums for validation
export const EvidenceTierEnum = z.enum(["1", "2", "3", "4", "5"]);
export const FreshnessCategoryEnum = z.enum(["green", "yellow", "red"]);
export const ActionPlanStatusEnum = z.enum(["active", "completed", "dismissed"]);

// Insert schemas
export const insertInsightReplicationHistorySchema = createInsertSchema(insightReplicationHistory).omit({
  id: true,
  detectedAt: true,
});

export const insertBiomarkerFreshnessMetadataSchema = createInsertSchema(biomarkerFreshnessMetadata).omit({
  id: true,
  lastCalculatedAt: true,
});

export const insertInsightFeedbackSchema = createInsertSchema(insightFeedback).omit({
  id: true,
  createdAt: true,
});

export const insertDailyInsightSchema = createInsertSchema(dailyInsights).omit({
  id: true,
  createdAt: true,
});

export const insertActionPlanItemSchema = createInsertSchema(actionPlanItems).omit({
  id: true,
  userId: true,  // userId is added by server, not client
  addedAt: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type InsertInsightReplicationHistory = z.infer<typeof insertInsightReplicationHistorySchema>;
export type InsightReplicationHistory = typeof insightReplicationHistory.$inferSelect;

export type InsertActionPlanItem = z.infer<typeof insertActionPlanItemSchema>;
export type ActionPlanItem = typeof actionPlanItems.$inferSelect;

export type InsertBiomarkerFreshnessMetadata = z.infer<typeof insertBiomarkerFreshnessMetadataSchema>;
export type BiomarkerFreshnessMetadata = typeof biomarkerFreshnessMetadata.$inferSelect;

export type InsertInsightFeedback = z.infer<typeof insertInsightFeedbackSchema>;
export type InsightFeedback = typeof insightFeedback.$inferSelect;

export type InsertDailyInsight = z.infer<typeof insertDailyInsightSchema>;
export type DailyInsight = typeof dailyInsights.$inferSelect;
