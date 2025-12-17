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
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Admin & Billing enums
export const userRoleEnum = pgEnum("user_role", ["free", "premium", "admin", "apple_test"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended", "pending_approval"]);
export const billingProviderEnum = pgEnum("billing_provider", ["stripe", "app_store"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "expired"
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
export const voicePreferenceEnum = pgEnum("voice_preference", ["Amanda", "Morgan", "Izzy", "Ethan", "Jon"]);

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
export const UserRoleEnum = z.enum(["free", "premium", "admin", "apple_test"]);
export const UserStatusEnum = z.enum(["active", "suspended", "pending_approval"]);
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
export const HeightUnitEnum = z.enum(["cm", "inches", "in"]); // "in" is alias for "inches"
export const ActivityLevelEnum = z.enum(["Sedentary", "Light", "Moderate", "Active", "Very Active"]);
export const DietTypeEnum = z.enum(["Balanced", "Low Carb", "Mediterranean", "Vegetarian", "Vegan", "Keto", "Paleo"]);
export const SmokingStatusEnum = z.enum(["Never", "Former", "Current"]);
export const AlcoholIntakeEnum = z.enum(["None", "Occasional", "Moderate", "Heavy"]);
export const CommunicationToneEnum = z.enum(["Casual", "Professional", "Scientific"]);
export const InsightsFrequencyEnum = z.enum(["Daily", "Weekly", "Bi-weekly", "Monthly"]);
export const VoicePreferenceEnum = z.enum(["Amanda", "Morgan", "Izzy", "Ethan", "Jon"]);

// Voice preference to Gemini voice name mapping
export const VOICE_NAME_TO_GEMINI: Record<string, string> = {
  "Amanda": "Zephyr",   // Warm & Professional (Female - bright, cheerful)
  "Morgan": "Kore",     // Calm & Reassuring (Female - firm, confident)
  "Izzy": "Aoede",      // Energetic & Friendly (Female - breezy, natural)
  "Ethan": "Charon",    // Clear & Confident (Male - informative, clear)
  "Jon": "Fenrir",      // Thoughtful & Steady (Male - excitable, dynamic)
};

export const GEMINI_VOICES = ["Puck", "Charon", "Kore", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"] as const;

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
  focusAreas: z.array(z.string()).optional(), // Allow custom focus areas, not just enum values
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
  
  // Pseudonymous health data link - UUID that connects to Supabase health records
  // This ID is used instead of user ID in Supabase to maintain data segregation
  healthId: varchar("health_id").unique().default(sql`gen_random_uuid()`),
  
  // JWT token version - increment to invalidate all sessions
  tokenVersion: integer("token_version").default(0).notNull(),
  
  // Daily reminder preferences
  reminderEnabled: boolean("reminder_enabled").default(true).notNull(),
  reminderTime: varchar("reminder_time").default("08:15").notNull(), // HH:MM format (24hr)
  reminderTimezone: varchar("reminder_timezone").default("UTC").notNull(), // IANA timezone
  
  // Insights v2.0 - User timezone for local-time cron jobs
  timezone: varchar("timezone").default("America/Los_Angeles").notNull(), // IANA timezone for 06:00 local insights
  timezoneSource: varchar("timezone_source").default("manual"), // 'device_auto' or 'manual'
  timezoneUpdatedAt: timestamp("timezone_updated_at"), // When timezone was last synced
  
  // Flō Oracle voice preference
  voicePreference: voicePreferenceEnum("voice_preference").default("Amanda").notNull(),
  
  // AI Features Consent (Apple App Store compliance - Nov 2025)
  // Tracks user consent for sending anonymized health data to third-party AI providers
  aiConsentGranted: boolean("ai_consent_granted").default(false).notNull(),
  aiConsentDate: timestamp("ai_consent_date"), // When consent was granted/revoked
  aiConsentVersion: varchar("ai_consent_version").default("1.0"), // Version for re-prompting on policy changes
  
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
  verificationToken: varchar("verification_token").unique(), // Email verification token
  verificationTokenExpiresAt: timestamp("verification_token_expires_at"), // Verification token expiry
  failedAttempts: integer("failed_attempts").default(0).notNull(), // Count of consecutive failed login attempts
  lockedUntil: timestamp("locked_until"), // Account locked until this time
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

// Passkey credentials table - for WebAuthn/FIDO2 biometric authentication
export const passkeyCredentials = pgTable("passkey_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(), // Base64URL-encoded credential ID
  publicKey: text("public_key").notNull(), // Base64-encoded public key
  counter: integer("counter").notNull().default(0), // Signature counter for replay protection
  deviceType: varchar("device_type"), // 'singleDevice' or 'multiDevice'
  backedUp: boolean("backed_up").default(false), // Whether credential is backed up to cloud
  transports: jsonb("transports").$type<string[]>(), // Authenticator transports (usb, nfc, ble, internal, hybrid)
  deviceName: varchar("device_name"), // User-friendly name (e.g., "iPhone 15 Pro")
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("passkey_credentials_user_idx").on(table.userId),
  index("passkey_credentials_credential_idx").on(table.credentialId),
]);

export type PasskeyCredential = typeof passkeyCredentials.$inferSelect;
export type InsertPasskeyCredential = typeof passkeyCredentials.$inferInsert;

// User health profiles table (1:1 with users)
export const profiles = pgTable("profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  
  // Demographics (queryable columns)
  // Note: We only store birth year (not full DOB) for privacy - reduces re-identification risk
  birthYear: integer("birth_year"),
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
  
  // Body fat calibration correction (from DEXA scan comparison)
  // This is a percentage to add to smart scale readings to match DEXA results
  bodyFatCorrectionPct: real("body_fat_correction_pct").default(0),
  
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

// Billing customers table (links users to Stripe or App Store)
export const billingCustomers = pgTable("billing_customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  provider: billingProviderEnum("provider").default("stripe").notNull(),
  stripeCustomerId: varchar("stripe_customer_id").unique(),
  appStoreOriginalTransactionId: varchar("app_store_original_transaction_id"),
  countryCode: varchar("country_code", { length: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscriptions table
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id"), // Legacy column - kept for backwards compatibility (nullable)
  billingCustomerId: varchar("billing_customer_id"), // No FK constraint - allows orphaned/legacy records
  stripeSubscriptionId: varchar("stripe_subscription_id").unique(),
  stripePriceId: varchar("stripe_price_id"),
  provider: billingProviderEnum("provider").default("stripe"),
  planId: varchar("plan_id").default("premium"),
  planInterval: varchar("plan_interval"),
  appStoreTransactionId: varchar("app_store_transaction_id"),
  appStoreProductId: varchar("app_store_product_id"),
  status: subscriptionStatusEnum("status").notNull(),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payments table (for App Store and Stripe transactions)
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id"), // Legacy column - kept for backwards compatibility (nullable)
  billingCustomerId: varchar("billing_customer_id"), // No FK constraint - allows orphaned/legacy records
  stripePaymentIntentId: varchar("stripe_payment_intent_id").unique(),
  provider: billingProviderEnum("provider").default("stripe"),
  appStoreTransactionId: varchar("app_store_transaction_id"),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 3 }).default("aud"),
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

// ==================== CENTRALIZED NOTIFICATION SERVICE ====================
// Reliable, timezone-aware notification scheduling with retry logic and admin controls

// Notification types for scheduled reminders
export const scheduledNotificationTypeEnum = pgEnum("scheduled_notification_type", [
  "daily_brief",
  "survey_3pm",
  "supplement_reminder",
  "weekly_summary",
  "custom"
]);

// Delivery status for queue items
export const notificationDeliveryStatusEnum = pgEnum("notification_delivery_status", [
  "scheduled",     // Waiting for fire time
  "processing",    // Currently being sent
  "delivered",     // Successfully sent
  "failed",        // Failed after all retries
  "skipped"        // User disabled or no device token
]);

// Templates for scheduled notifications (admin-configurable)
export const scheduledNotificationTemplates = pgTable("scheduled_notification_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: scheduledNotificationTypeEnum("type").notNull().unique(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  defaultLocalTime: varchar("default_local_time").notNull().default("08:00"), // HH:MM format
  isActive: boolean("is_active").default(true).notNull(),
  interruptionLevel: varchar("interruption_level").default("active"), // passive|active|time-sensitive|critical
  metadata: jsonb("metadata"), // Additional config (deeplinks, sounds, etc.)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User notification preferences (per-type subscriptions with timezone)
export const userNotificationSchedules = pgTable("user_notification_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: scheduledNotificationTypeEnum("type").notNull(),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  localTime: varchar("local_time").notNull(), // HH:MM format (24hr)
  timezone: varchar("timezone").notNull(), // IANA timezone (e.g., "America/Los_Angeles")
  daysOfWeek: jsonb("days_of_week").default(sql`'[0,1,2,3,4,5,6]'`), // Array of day numbers (0=Sun, 6=Sat)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userTypeIdx: uniqueIndex("user_notification_schedules_user_type_idx").on(table.userId, table.type),
  enabledIdx: index("user_notification_schedules_enabled_idx").on(table.isEnabled),
  timezoneIdx: index("user_notification_schedules_timezone_idx").on(table.timezone),
}));

// Notification queue (scheduled jobs with retry state)
export const notificationQueue = pgTable("notification_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scheduleId: varchar("schedule_id").references(() => userNotificationSchedules.id, { onDelete: "set null" }),
  type: scheduledNotificationTypeEnum("type").notNull(),
  
  // Scheduling
  scheduledForUtc: timestamp("scheduled_for_utc").notNull(), // When to fire (in UTC)
  localDateKey: varchar("local_date_key").notNull(), // YYYY-MM-DD in user's timezone (for dedup)
  
  // Content (may be pre-generated or template-based)
  title: text("title").notNull(),
  body: text("body").notNull(),
  payload: jsonb("payload"), // Additional data for the notification
  
  // Delivery state
  status: notificationDeliveryStatusEnum("status").default("scheduled").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(3).notNull(),
  lastAttemptAt: timestamp("last_attempt_at"),
  nextRetryAt: timestamp("next_retry_at"),
  deliveredAt: timestamp("delivered_at"),
  failureReason: text("failure_reason"),
  
  // Tracking
  devicesReached: integer("devices_reached").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("notification_queue_user_idx").on(table.userId),
  statusIdx: index("notification_queue_status_idx").on(table.status),
  scheduledIdx: index("notification_queue_scheduled_idx").on(table.scheduledForUtc),
  typeStatusIdx: index("notification_queue_type_status_idx").on(table.type, table.status),
  userDateTypeIdx: uniqueIndex("notification_queue_user_date_type_idx").on(table.userId, table.localDateKey, table.type),
}));

// Notification delivery audit log (permanent record of all deliveries)
export const notificationDeliveryLog = pgTable("notification_delivery_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  queueId: varchar("queue_id").references(() => notificationQueue.id, { onDelete: "set null" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: scheduledNotificationTypeEnum("type").notNull(),
  
  // What was sent
  title: text("title").notNull(),
  body: text("body").notNull(),
  
  // Result
  success: boolean("success").notNull(),
  devicesReached: integer("devices_reached").default(0),
  errorCode: varchar("error_code"),
  errorMessage: text("error_message"),
  
  // Timing
  scheduledForUtc: timestamp("scheduled_for_utc"),
  attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
  latencyMs: integer("latency_ms"), // Time from scheduled to delivered
  
  // Device info
  deviceTokensAttempted: integer("device_tokens_attempted").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("notification_delivery_log_user_idx").on(table.userId),
  typeIdx: index("notification_delivery_log_type_idx").on(table.type),
  attemptedAtIdx: index("notification_delivery_log_attempted_at_idx").on(table.attemptedAt),
  successIdx: index("notification_delivery_log_success_idx").on(table.success),
}));

// ==================== END CENTRALIZED NOTIFICATION SERVICE ====================

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
  referenceLowRaw: real("reference_low_raw"),
  referenceHighRaw: real("reference_high_raw"),
  referenceUnitRaw: text("reference_unit_raw"),
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
  weightKg: real("weight_kg"), // Body weight in kg (most recent sample)
  heightCm: real("height_cm"), // Height in cm
  bmi: real("bmi"), // Body Mass Index
  bodyFatPercent: real("body_fat_percent"), // Body fat percentage (0-100)
  leanBodyMassKg: real("lean_body_mass_kg"), // Lean body mass in kg
  waistCircumferenceCm: real("waist_circumference_cm"), // Waist circumference in cm
  distanceMeters: real("distance_meters"), // Walking + running distance in meters
  flightsClimbed: integer("flights_climbed"), // Flights of stairs climbed
  standHours: integer("stand_hours"), // Hours with at least 1 minute of standing
  avgHeartRateBpm: real("avg_heart_rate_bpm"), // Average heart rate during day
  systolicBp: real("systolic_bp"), // Systolic blood pressure in mmHg
  diastolicBp: real("diastolic_bp"), // Diastolic blood pressure in mmHg
  bloodGlucoseMgDl: real("blood_glucose_mg_dl"), // Blood glucose in mg/dL
  vo2Max: real("vo2_max"), // VO2 max in mL/kg/min
  basalEnergyKcal: real("basal_energy_kcal"), // Basal energy burned (resting metabolism)
  walkingHrAvgBpm: real("walking_hr_avg_bpm"), // Walking heart rate average
  dietaryWaterMl: real("dietary_water_ml"), // Water intake in milliliters
  oxygenSaturationPct: real("oxygen_saturation_pct"), // Blood oxygen saturation percentage (0-100)
  respiratoryRateBpm: real("respiratory_rate_bpm"), // Respiratory rate in breaths per minute
  bodyTempC: real("body_temp_c"), // Body temperature in Celsius
  // Gait & Mobility metrics (8 new fields for elderly fall prevention)
  walkingSpeedMs: real("walking_speed_ms"), // Walking speed in meters/second
  walkingStepLengthM: real("walking_step_length_m"), // Step length in meters
  walkingDoubleSupportPct: real("walking_double_support_pct"), // % of gait with both feet on ground (higher = less stable)
  walkingAsymmetryPct: real("walking_asymmetry_pct"), // Left/right step timing difference percentage
  appleWalkingSteadiness: real("apple_walking_steadiness"), // Fall-risk score (0-1, iOS 15+)
  sixMinuteWalkDistanceM: real("six_minute_walk_distance_m"), // 6-minute walk test distance in meters (Apple Watch)
  stairAscentSpeedMs: real("stair_ascent_speed_ms"), // Stair climbing speed (vertical m/s)
  stairDescentSpeedMs: real("stair_descent_speed_ms"), // Stair descending speed (vertical m/s)
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

// Manual Sleep Entries - User-logged sleep for those who don't wear wearables to bed
export const manualSleepEntries = pgTable("manual_sleep_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sleepDate: text("sleep_date").notNull(), // YYYY-MM-DD (local calendar day of wake)
  timezone: text("timezone").notNull(), // IANA timezone (e.g., 'Australia/Perth')
  bedtime: timestamp("bedtime").notNull(), // When user went to bed (UTC)
  wakeTime: timestamp("wake_time").notNull(), // When user woke up (UTC)
  bedtimeLocal: text("bedtime_local").notNull(), // Formatted bedtime (e.g., "10:47 pm")
  waketimeLocal: text("waketime_local").notNull(), // Formatted wake time (e.g., "6:19 am")
  durationMinutes: real("duration_minutes").notNull(), // Total time asleep (calculated)
  qualityRating: integer("quality_rating").notNull(), // 1-5 subjective rating
  notes: text("notes"), // Optional notes about sleep
  nightfloScore: real("nightflo_score").notNull(), // 0-100 (calculated from duration + quality)
  scoreLabel: text("score_label").notNull(), // 'Low' | 'Fair' | 'Good' | 'Excellent'
  isTimerActive: boolean("is_timer_active").default(false), // True if sleep timer is in progress
  timerStartedAt: timestamp("timer_started_at"), // When sleep timer was started (UTC)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_manual_sleep_unique").on(table.userId, table.sleepDate),
  index("idx_manual_sleep_user_date").on(table.userId, table.sleepDate),
]);

export type ManualSleepEntry = typeof manualSleepEntries.$inferSelect;
export type InsertManualSleepEntry = typeof manualSleepEntries.$inferInsert;

// Mindfulness Sessions - Individual meditation/mindfulness sessions from HealthKit
export const mindfulnessSessions = pgTable("mindfulness_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionDate: text("session_date").notNull(), // YYYY-MM-DD (local calendar day)
  timezone: text("timezone").notNull(), // IANA timezone (e.g., 'America/Los_Angeles')
  startTime: timestamp("start_time").notNull(), // Session start (UTC)
  endTime: timestamp("end_time").notNull(), // Session end (UTC)
  durationMinutes: real("duration_minutes").notNull(), // Duration in minutes
  sourceName: text("source_name"), // App name (e.g., 'Headspace', 'Calm')
  sourceId: text("source_id"), // App bundle identifier
  healthkitUuid: text("healthkit_uuid"), // HealthKit sample UUID for deduplication
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_mindfulness_sessions_user_date").on(table.userId, table.sessionDate),
  uniqueIndex("idx_mindfulness_sessions_uuid").on(table.userId, table.healthkitUuid),
]);

// Mindfulness Daily Metrics - Daily aggregation of mindfulness sessions
export const mindfulnessDailyMetrics = pgTable("mindfulness_daily_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  localDate: text("local_date").notNull(), // YYYY-MM-DD
  timezone: text("timezone").notNull(), // IANA timezone
  totalMinutes: real("total_minutes").notNull().default(0), // Total mindful minutes for the day
  sessionCount: integer("session_count").notNull().default(0), // Number of sessions
  avgSessionMinutes: real("avg_session_minutes"), // Average session duration
  longestSessionMinutes: real("longest_session_minutes"), // Longest session of the day
  sources: jsonb("sources"), // Array of sources that contributed
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_mindfulness_daily_unique").on(table.userId, table.localDate),
  index("idx_mindfulness_daily_user_date").on(table.userId, table.localDate),
]);

// Nutrition Daily Metrics - Daily aggregation of all 38 nutrition types from HealthKit
export const nutritionDailyMetrics = pgTable("nutrition_daily_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  localDate: text("local_date").notNull(), // YYYY-MM-DD
  timezone: text("timezone").notNull(), // IANA timezone
  // Macronutrients
  energyKcal: real("energy_kcal"), // Total calories consumed
  carbohydratesG: real("carbohydrates_g"), // Carbohydrates in grams
  proteinG: real("protein_g"), // Protein in grams
  fatTotalG: real("fat_total_g"), // Total fat in grams
  fatSaturatedG: real("fat_saturated_g"), // Saturated fat in grams
  fatPolyunsaturatedG: real("fat_polyunsaturated_g"), // Polyunsaturated fat
  fatMonounsaturatedG: real("fat_monounsaturated_g"), // Monounsaturated fat
  cholesterolMg: real("cholesterol_mg"), // Cholesterol in milligrams
  fiberG: real("fiber_g"), // Dietary fiber in grams
  sugarG: real("sugar_g"), // Sugar in grams
  // Vitamins
  vitaminAMcg: real("vitamin_a_mcg"), // Vitamin A in micrograms RAE
  vitaminB6Mg: real("vitamin_b6_mg"), // Vitamin B6 in milligrams
  vitaminB12Mcg: real("vitamin_b12_mcg"), // Vitamin B12 in micrograms
  vitaminCMg: real("vitamin_c_mg"), // Vitamin C in milligrams
  vitaminDMcg: real("vitamin_d_mcg"), // Vitamin D in micrograms
  vitaminEMg: real("vitamin_e_mg"), // Vitamin E in milligrams
  vitaminKMcg: real("vitamin_k_mcg"), // Vitamin K in micrograms
  thiaminMg: real("thiamin_mg"), // Thiamin (B1) in milligrams
  riboflavinMg: real("riboflavin_mg"), // Riboflavin (B2) in milligrams
  niacinMg: real("niacin_mg"), // Niacin (B3) in milligrams
  folateMcg: real("folate_mcg"), // Folate in micrograms
  biotinMcg: real("biotin_mcg"), // Biotin in micrograms
  pantothenicAcidMg: real("pantothenic_acid_mg"), // Pantothenic acid (B5) in milligrams
  // Minerals
  calciumMg: real("calcium_mg"), // Calcium in milligrams
  chlorideMg: real("chloride_mg"), // Chloride in milligrams
  chromiumMcg: real("chromium_mcg"), // Chromium in micrograms
  copperMg: real("copper_mg"), // Copper in milligrams
  iodineMcg: real("iodine_mcg"), // Iodine in micrograms
  ironMg: real("iron_mg"), // Iron in milligrams
  magnesiumMg: real("magnesium_mg"), // Magnesium in milligrams
  manganeseMg: real("manganese_mg"), // Manganese in milligrams
  molybdenumMcg: real("molybdenum_mcg"), // Molybdenum in micrograms
  phosphorusMg: real("phosphorus_mg"), // Phosphorus in milligrams
  potassiumMg: real("potassium_mg"), // Potassium in milligrams
  seleniumMcg: real("selenium_mcg"), // Selenium in micrograms
  sodiumMg: real("sodium_mg"), // Sodium in milligrams
  zincMg: real("zinc_mg"), // Zinc in milligrams
  // Other
  caffeineMg: real("caffeine_mg"), // Caffeine in milligrams
  waterMl: real("water_ml"), // Water intake in milliliters (from dietaryWater)
  // Metadata
  mealCount: integer("meal_count"), // Number of meals/entries logged
  sources: jsonb("sources"), // Array of apps that contributed data
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_nutrition_daily_unique").on(table.userId, table.localDate),
  index("idx_nutrition_daily_user_date").on(table.userId, table.localDate),
]);

// Flōmentum user settings
export const userSettings = pgTable("user_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").unique().notNull().references(() => users.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull().default("UTC"),
  stepsTarget: integer("steps_target").notNull().default(7000),
  sleepTargetMinutes: integer("sleep_target_minutes").notNull().default(480),
  flomentumEnabled: boolean("flomentum_enabled").notNull().default(true),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_user_settings_user").on(table.userId),
]);

// Login verification tokens for email magic link 2FA
export const loginVerifications = pgTable("login_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token").notNull().unique(), // Secure random token
  deviceInfo: text("device_info"), // Device/browser info for context
  ipAddress: text("ip_address"), // IP address of login attempt
  expiresAt: timestamp("expires_at").notNull(), // 10 minute expiry
  verifiedAt: timestamp("verified_at"), // When user clicked the link
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_login_verifications_user").on(table.userId),
  index("idx_login_verifications_token").on(table.token),
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

// User Daily Engagement - Tracks daily app engagement for gamification
export const userDailyEngagement = pgTable("user_daily_engagement", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  insightsViewed: boolean("insights_viewed").notNull().default(false),
  actionsChecked: boolean("actions_checked").notNull().default(false),
  aiChatUsed: boolean("ai_chat_used").notNull().default(false),
  currentStreak: integer("current_streak").notNull().default(1),
  longestStreak: integer("longest_streak").notNull().default(1),
  totalXP: integer("total_xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_user_daily_engagement_unique").on(table.userId, table.date),
  index("idx_user_daily_engagement_user_date").on(table.userId, table.date),
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
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  sex: SexEnum.optional(),
  weight: z.number().min(0).optional(),
  weightUnit: WeightUnitEnum.optional(),
  height: z.number().min(0).optional(),
  heightUnit: HeightUnitEnum.optional(),
  goals: z.array(z.string()).optional(), // Allow custom goals, not just enum values
  healthBaseline: healthBaselineSchema.optional(),
  aiPersonalization: aiPersonalizationSchema.optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Section-specific update schemas
export const updateDemographicsSchema = z.object({
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
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
  goals: z.array(z.string()), // Allow custom goals, not just enum values
});

export const updateAIPersonalizationSchema = z.object({
  aiPersonalization: aiPersonalizationSchema,
});

export const updateReminderPreferencesSchema = z.object({
  reminderEnabled: z.boolean().optional(),
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(), // HH:MM format (24hr)
  reminderTimezone: z.string().optional(), // IANA timezone
});

export const updateBodyFatCalibrationSchema = z.object({
  bodyFatCorrectionPct: z.number().min(-15).max(15), // Range -15% to +15% correction
});

export const updateNameSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
}).refine(data => data.firstName !== undefined || data.lastName !== undefined, {
  message: "At least one of 'firstName' or 'lastName' must be provided",
});

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;
export type UpdateDemographics = z.infer<typeof updateDemographicsSchema>;
export type UpdateHealthBaseline = z.infer<typeof updateHealthBaselineSchema>;
export type UpdateGoals = z.infer<typeof updateGoalsSchema>;
export type UpdateAIPersonalization = z.infer<typeof updateAIPersonalizationSchema>;
export type UpdateReminderPreferences = z.infer<typeof updateReminderPreferencesSchema>;
export type UpdateBodyFatCalibration = z.infer<typeof updateBodyFatCalibrationSchema>;
export type UpdateName = z.infer<typeof updateNameSchema>;

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
  referenceLowRaw: z.number().optional(),
  referenceHighRaw: z.number().optional(),
  referenceUnitRaw: z.string().optional(),
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
  verificationTokenExpiresAt: z.coerce.date().nullable().optional(),
  lockedUntil: z.coerce.date().nullable().optional(),
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
  verificationToken: z.string().nullable(),
  verificationTokenExpiresAt: z.date().nullable(),
  failedAttempts: z.number(),
  lockedUntil: z.date().nullable(),
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

// Mindfulness Sessions schemas
export const insertMindfulnessSessionSchema = createInsertSchema(mindfulnessSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startTime: z.union([z.date(), z.string().transform(str => new Date(str))]),
  endTime: z.union([z.date(), z.string().transform(str => new Date(str))]),
});

export type InsertMindfulnessSession = z.infer<typeof insertMindfulnessSessionSchema>;
export type MindfulnessSession = typeof mindfulnessSessions.$inferSelect;

// Mindfulness Daily Metrics schemas
export const insertMindfulnessDailyMetricsSchema = createInsertSchema(mindfulnessDailyMetrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMindfulnessDailyMetrics = z.infer<typeof insertMindfulnessDailyMetricsSchema>;
export type MindfulnessDailyMetrics = typeof mindfulnessDailyMetrics.$inferSelect;

// Nutrition Daily Metrics schemas
export const insertNutritionDailyMetricsSchema = createInsertSchema(nutritionDailyMetrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertNutritionDailyMetrics = z.infer<typeof insertNutritionDailyMetricsSchema>;
export type NutritionDailyMetrics = typeof nutritionDailyMetrics.$inferSelect;

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

// Login verification schemas and types
export const insertLoginVerificationSchema = createInsertSchema(loginVerifications).omit({
  id: true,
  createdAt: true,
  verifiedAt: true,
});
export type InsertLoginVerification = z.infer<typeof insertLoginVerificationSchema>;
export type LoginVerification = typeof loginVerifications.$inferSelect;

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

export const insertUserDailyEngagementSchema = createInsertSchema(userDailyEngagement).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserDailyEngagement = z.infer<typeof insertUserDailyEngagementSchema>;
export type UserDailyEngagement = typeof userDailyEngagement.$inferSelect;

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

// ==================== CENTRALIZED NOTIFICATION SERVICE SCHEMAS ====================

// Zod enums for validation
export const ScheduledNotificationTypeEnum = z.enum([
  "daily_brief", "survey_3pm", "supplement_reminder", "weekly_summary", "custom"
]);
export const NotificationDeliveryStatusEnum = z.enum([
  "scheduled", "processing", "delivered", "failed", "skipped"
]);

// Scheduled notification template schemas
export const insertScheduledNotificationTemplateSchema = createInsertSchema(scheduledNotificationTemplates).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertScheduledNotificationTemplate = z.infer<typeof insertScheduledNotificationTemplateSchema>;
export type ScheduledNotificationTemplate = typeof scheduledNotificationTemplates.$inferSelect;

// User notification schedule schemas
export const insertUserNotificationScheduleSchema = createInsertSchema(userNotificationSchedules).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertUserNotificationSchedule = z.infer<typeof insertUserNotificationScheduleSchema>;
export type UserNotificationSchedule = typeof userNotificationSchedules.$inferSelect;

// Notification queue schemas
export const insertNotificationQueueSchema = createInsertSchema(notificationQueue).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertNotificationQueue = z.infer<typeof insertNotificationQueueSchema>;
export type NotificationQueueItem = typeof notificationQueue.$inferSelect;

// Notification delivery log schemas
export const insertNotificationDeliveryLogSchema = createInsertSchema(notificationDeliveryLog).omit({
  id: true, createdAt: true,
});
export type InsertNotificationDeliveryLog = z.infer<typeof insertNotificationDeliveryLogSchema>;
export type NotificationDeliveryLogEntry = typeof notificationDeliveryLog.$inferSelect;

// ==================== END CENTRALIZED NOTIFICATION SERVICE SCHEMAS ====================

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

// ============================================================================
// Shared Brain - User Insights (GPT Insights + Grok Chat Memory Layer)
// ============================================================================

// Source of insight: which subsystem created it
export const userInsightSourceEnum = pgEnum("user_insight_source", [
  "gpt_insights_job",    // From GPT-based daily insights generation
  "chat_brain_update",   // From Grok chat BRAIN_UPDATE_JSON
  "chat_summary_job",    // From nightly chat transcript summarization
  "manual",              // Manual entry (future use)
  "medical_document",    // From uploaded medical documents (specialist reports, imaging, etc.)
  "correlation_insight"  // From BigQuery correlation engine pattern detection
]);

// Status of insight: whether it's still relevant
export const userInsightStatusEnum = pgEnum("user_insight_status", [
  "active",    // Currently relevant
  "resolved",  // Issue/pattern has been addressed
  "dismissed"  // User or system dismissed it
]);

// Shared user_insights store - the "brain" that both GPT Insights and Grok Chat read/write
export const userInsights = pgTable("user_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Natural language insight or note about user's health, behavior, or patterns
  text: text("text").notNull(),
  
  // Which subsystem created this insight
  source: userInsightSourceEnum("source").default("gpt_insights_job").notNull(),
  
  // Short keywords for filtering and retrieval (e.g., ['lipids', 'sleep', 'trend-worse'])
  tags: text("tags").array().default(sql`ARRAY[]::text[]`).notNull(),
  
  // 1-5 where 5 = critical/high impact - used to prioritize what we pass into chat
  importance: integer("importance").default(3).notNull(),
  
  // Whether this insight is still relevant (soft delete pattern)
  status: userInsightStatusEnum("status").default("active").notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Primary retrieval: recent insights for a user
  userIdCreatedAtIdx: index("idx_user_insights_user_id_created_at").on(table.userId, table.createdAt),
  // Filter by status
  userIdStatusIdx: index("idx_user_insights_user_id_status").on(table.userId, table.status),
  // For deduplication: find similar insights by user
  userIdx: index("idx_user_insights_user_idx").on(table.userId),
}));

// Zod enums for validation
export const UserInsightSourceEnum = z.enum(["gpt_insights_job", "chat_brain_update", "chat_summary_job", "manual", "medical_document", "correlation_insight"]);
export const UserInsightStatusEnum = z.enum(["active", "resolved", "dismissed"]);

// Insert schema
export const insertUserInsightSchema = createInsertSchema(userInsights).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type InsertUserInsight = z.infer<typeof insertUserInsightSchema>;
export type UserInsight = typeof userInsights.$inferSelect;

// ============================================================================
// Flo Chat Messages - Transcript Storage for Chat Summary Job
// ============================================================================

// Sender of chat message
export const chatSenderEnum = pgEnum("chat_sender", ["user", "flo"]);

// Chat messages between user and Flo Oracle
export const floChatMessages = pgTable("flo_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Who sent the message
  sender: chatSenderEnum("sender").notNull(),
  
  // The message content
  message: text("message").notNull(),
  
  // Optional: session ID to group conversations
  sessionId: varchar("session_id"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Primary retrieval: recent messages for a user
  userIdCreatedAtIdx: index("idx_flo_chat_messages_user_id_created_at").on(table.userId, table.createdAt),
  // Session lookup
  sessionIdx: index("idx_flo_chat_messages_session_id").on(table.sessionId),
}));

// Zod enums for validation
export const ChatSenderEnum = z.enum(["user", "flo"]);

// Insert schema
export const insertFloChatMessageSchema = createInsertSchema(floChatMessages).omit({
  id: true,
  createdAt: true,
});

// Types
export type InsertFloChatMessage = z.infer<typeof insertFloChatMessageSchema>;
export type FloChatMessage = typeof floChatMessages.$inferSelect;

// ============================================================================
// Developer Messages - Admin-to-User Announcements
// ============================================================================

// Type of developer message
export const developerMessageTypeEnum = pgEnum("developer_message_type", [
  "update",   // App updates and releases
  "outage",   // Scheduled maintenance or outages
  "feature"   // New feature announcements
]);

// Developer messages table - for broadcasting announcements from admins to users
export const developerMessages = pgTable("developer_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  
  // Message content
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: developerMessageTypeEnum("type").default("update").notNull(),
  
  // Targeting: null = all users, array = specific user IDs
  targetUserIds: jsonb("target_user_ids").$type<string[]>(),
  
  // Publishing controls
  isActive: boolean("is_active").default(true).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // Optional expiry
}, (table) => ({
  activeCreatedAtIdx: index("idx_developer_messages_active_created").on(table.isActive, table.createdAt),
}));

// ============================================================================
// User Feedback - Bug Reports & Feature Requests from Users
// ============================================================================

export const userFeedbackTypeEnum = pgEnum("user_feedback_type", [
  "bug_report",
  "feature_request"
]);

export const userFeedbackStatusEnum = pgEnum("user_feedback_status", [
  "new",
  "in_review",
  "planned",
  "resolved",
  "dismissed"
]);

export const userFeedback = pgTable("user_feedback", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: userFeedbackTypeEnum("type").notNull(),
  
  // For feature requests: title is required
  title: varchar("title", { length: 255 }),
  message: text("message").notNull(),
  
  // Admin response/status
  status: userFeedbackStatusEnum("status").default("new").notNull(),
  adminNotes: text("admin_notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("idx_user_feedback_user").on(table.userId),
  typeStatusIdx: index("idx_user_feedback_type_status").on(table.type, table.status),
  createdAtIdx: index("idx_user_feedback_created").on(table.createdAt),
}));

// Zod enums for validation
export const UserFeedbackTypeEnum = z.enum(["bug_report", "feature_request"]);
export const UserFeedbackStatusEnum = z.enum(["new", "in_review", "planned", "resolved", "dismissed"]);

// Insert schema
export const insertUserFeedbackSchema = createInsertSchema(userFeedback).omit({
  createdAt: true,
  updatedAt: true,
} as const);

// Types
export type InsertUserFeedback = z.infer<typeof insertUserFeedbackSchema>;
export type UserFeedback = typeof userFeedback.$inferSelect;

// Track which users have read which messages
export const developerMessageReads = pgTable("developer_message_reads", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  messageId: integer("message_id").notNull().references(() => developerMessages.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at").defaultNow().notNull(),
}, (table) => ({
  userMessageUniqueIdx: uniqueIndex("idx_developer_message_reads_unique").on(table.userId, table.messageId),
  userIdIdx: index("idx_developer_message_reads_user").on(table.userId),
}));

// Track which users have dismissed (deleted from inbox) which messages
export const developerMessageDismissals = pgTable("developer_message_dismissals", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  messageId: integer("message_id").notNull().references(() => developerMessages.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dismissedAt: timestamp("dismissed_at").defaultNow().notNull(),
}, (table) => ({
  userMessageUniqueIdx: uniqueIndex("idx_developer_message_dismissals_unique").on(table.userId, table.messageId),
  userIdIdx: index("idx_developer_message_dismissals_user").on(table.userId),
}));

// Zod enums for validation
export const DeveloperMessageTypeEnum = z.enum(["update", "outage", "feature"]);

// Insert schemas - id is auto-excluded since it uses generatedAlwaysAsIdentity()
export const insertDeveloperMessageSchema = createInsertSchema(developerMessages).omit({
  createdAt: true,
} as const);

export const insertDeveloperMessageReadSchema = createInsertSchema(developerMessageReads).omit({
  readAt: true,
} as const);

// Types
export type InsertDeveloperMessage = z.infer<typeof insertDeveloperMessageSchema>;
export type DeveloperMessage = typeof developerMessages.$inferSelect;
export type InsertDeveloperMessageRead = z.infer<typeof insertDeveloperMessageReadSchema>;
export type DeveloperMessageRead = typeof developerMessageReads.$inferSelect;

// SIE Brainstorm Sessions - stores voice brainstorming sessions for admin review
export const sieBrainstormSessions = pgTable("sie_brainstorm_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => users.id),
  
  title: varchar("title", { length: 255 }).notNull(),
  transcript: jsonb("transcript").$type<Array<{
    role: 'user' | 'sie';
    text: string;
    timestamp: string;
  }>>().notNull(),
  
  audioFilePath: text("audio_file_path"),
  durationSeconds: integer("duration_seconds"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  adminIdIdx: index("idx_sie_sessions_admin").on(table.adminId),
  createdAtIdx: index("idx_sie_sessions_created").on(table.createdAt),
}));

// Insert schema
export const insertSIEBrainstormSessionSchema = createInsertSchema(sieBrainstormSessions).omit({
  createdAt: true,
} as const);

// Types
export type InsertSIEBrainstormSession = z.infer<typeof insertSIEBrainstormSessionSchema>;
export type SIEBrainstormSession = typeof sieBrainstormSessions.$inferSelect;

// ============================================================================
// Pending Correlation Feedback - Stores ML-generated feedback questions
// ============================================================================

export const feedbackQuestionTypeEnum = pgEnum("feedback_question_type", [
  "scale_1_10",
  "yes_no",
  "multiple_choice",
  "open_ended"
]);

export const feedbackUrgencyEnum = pgEnum("feedback_urgency", ["low", "medium", "high"]);

export const pendingCorrelationFeedback = pgTable("pending_correlation_feedback", {
  feedbackId: varchar("feedback_id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  questionText: text("question_text").notNull(),
  questionType: feedbackQuestionTypeEnum("question_type").notNull(),
  options: jsonb("options").$type<string[]>(),
  triggerPattern: varchar("trigger_pattern", { length: 100 }),
  triggerMetrics: jsonb("trigger_metrics").$type<Record<string, { value: number; deviation: number }>>(),
  urgency: feedbackUrgencyEnum("urgency").default("medium").notNull(),
  focusMetric: varchar("focus_metric", { length: 50 }),
  deliveryWindow: varchar("delivery_window", { length: 20 }),
  
  // ML-computed causal analysis (full history pattern matching)
  insightText: text("insight_text"),
  likelyCauses: jsonb("likely_causes").$type<string[]>(),
  whatsWorking: jsonb("whats_working").$type<string[]>(),
  patternConfidence: real("pattern_confidence"),
  isRecurringPattern: boolean("is_recurring_pattern").default(false),
  historicalMatchCount: integer("historical_match_count"),
  
  // Health context - explains WHY the anomaly matters and potential health implications
  healthContextClassification: varchar("health_context_classification", { length: 30 }),
  healthImplications: jsonb("health_implications").$type<string[]>(),
  conditionsToConsider: jsonb("conditions_to_consider").$type<string[]>(),
  actionableAdvice: text("actionable_advice"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  visibleAt: timestamp("visible_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => ({
  userIdIdx: index("idx_pending_feedback_user").on(table.userId),
  expiresAtIdx: index("idx_pending_feedback_expires").on(table.expiresAt),
  visibleAtIdx: index("idx_pending_feedback_visible").on(table.visibleAt),
}));

export const insertPendingCorrelationFeedbackSchema = createInsertSchema(pendingCorrelationFeedback).omit({
  createdAt: true,
} as const);

export type InsertPendingCorrelationFeedback = z.infer<typeof insertPendingCorrelationFeedbackSchema>;
export type PendingCorrelationFeedback = typeof pendingCorrelationFeedback.$inferSelect;

export const answeredFeedbackPatterns = pgTable("answered_feedback_patterns", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  triggerPattern: varchar("trigger_pattern", { length: 100 }).notNull(),
  focusMetric: varchar("focus_metric", { length: 100 }),
  answeredAt: timestamp("answered_at").defaultNow().notNull(),
}, (table) => ({
  userPatternIdx: index("idx_answered_patterns_user_pattern").on(table.userId, table.triggerPattern),
  answeredAtIdx: index("idx_answered_patterns_answered_at").on(table.answeredAt),
}));

export type AnsweredFeedbackPattern = typeof answeredFeedbackPatterns.$inferSelect;

// ML Sensitivity Settings (admin-tunable parameters for the causality engine)
export const mlSensitivitySettings = pgTable("ml_sensitivity_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Anomaly detection thresholds
  anomalyZScoreThreshold: real("anomaly_z_score_threshold").default(2.0).notNull(),
  anomalyMinConfidence: real("anomaly_min_confidence").default(0.5).notNull(),
  
  // Pattern matching settings
  minPatternMatches: integer("min_pattern_matches").default(3).notNull(),
  historyWindowMonths: integer("history_window_months").default(24).notNull(),
  
  // Positive pattern detection
  minPositiveOccurrences: integer("min_positive_occurrences").default(5).notNull(),
  positiveOutcomeThreshold: real("positive_outcome_threshold").default(0.1).notNull(),
  
  // Insight generation
  insightConfidenceThreshold: real("insight_confidence_threshold").default(0.3).notNull(),
  maxCausesToShow: integer("max_causes_to_show").default(3).notNull(),
  maxPositivePatternsToShow: integer("max_positive_patterns_to_show").default(3).notNull(),
  
  // Notification controls
  enableProactiveAlerts: boolean("enable_proactive_alerts").default(true).notNull(),
  alertCooldownHours: integer("alert_cooldown_hours").default(4).notNull(),
  
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

export const insertMLSensitivitySettingsSchema = createInsertSchema(mlSensitivitySettings).omit({
  id: true,
  updatedAt: true,
} as const);

export type InsertMLSensitivitySettings = z.infer<typeof insertMLSensitivitySettingsSchema>;
export type MLSensitivitySettings = typeof mlSensitivitySettings.$inferSelect;

// ============================================================================
// User Integrations - OAuth connections to external health data sources
// ============================================================================

export const integrationProviderEnum = pgEnum("integration_provider", ["oura", "dexcom"]);
export const integrationStatusEnum = pgEnum("integration_status", ["not_connected", "connected", "expired", "error"]);

export const userIntegrations = pgTable("user_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  provider: integrationProviderEnum("provider").notNull(),
  status: integrationStatusEnum("status").default("not_connected").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  
  // OAuth tokens (encrypted at rest via application layer)
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  tokenScope: text("token_scope"),
  
  // Sync metadata
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncError: text("last_sync_error"),
  syncCursor: text("sync_cursor"), // For pagination/incremental sync
  
  // Priority settings - which metrics to prefer from this source over others
  // e.g., ["hrv", "sleep_duration", "deep_sleep"] means prefer Oura for these metrics
  priorityMetrics: jsonb("priority_metrics").$type<string[]>().default([]),
  
  // Provider-specific metadata (user info, subscription status, etc.)
  providerMetadata: jsonb("provider_metadata").$type<Record<string, any>>(),
  
  connectedAt: timestamp("connected_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userProviderIdx: uniqueIndex("user_integrations_user_provider_idx").on(table.userId, table.provider),
  userIdIdx: index("user_integrations_user_idx").on(table.userId),
  statusIdx: index("user_integrations_status_idx").on(table.status),
}));

export const insertUserIntegrationSchema = createInsertSchema(userIntegrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
} as const);

export type InsertUserIntegration = z.infer<typeof insertUserIntegrationSchema>;
export type UserIntegration = typeof userIntegrations.$inferSelect;

// ============================================================================
// Data Source Priority Settings - Global user preference for metric sources
// ============================================================================

export const dataSourceEnum = pgEnum("data_source", ["healthkit", "oura", "dexcom", "manual"]);

export const userDataSourcePreferences = pgTable("user_data_source_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  
  // Per-metric source priority - e.g., { "hrv": "oura", "steps": "healthkit", "blood_glucose": "dexcom" }
  metricSources: jsonb("metric_sources").$type<Record<string, string>>().default({}),
  
  // Default source when no specific preference is set
  defaultSource: dataSourceEnum("default_source").default("healthkit").notNull(),
  
  // Auto-select best source based on data quality (future feature)
  autoSelectBestSource: boolean("auto_select_best_source").default(false).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("user_data_source_prefs_user_idx").on(table.userId),
}));

export const insertUserDataSourcePreferencesSchema = createInsertSchema(userDataSourcePreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
} as const);

export type InsertUserDataSourcePreferences = z.infer<typeof insertUserDataSourcePreferencesSchema>;
export type UserDataSourcePreferences = typeof userDataSourcePreferences.$inferSelect;
