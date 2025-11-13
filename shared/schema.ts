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

// User storage table (required for Replit Auth)
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
  name: text("name").notNull(),
  category: text("category").notNull(),
  canonicalUnit: text("canonical_unit").notNull(),
  displayUnitPreference: text("display_unit_preference"),
  precision: integer("precision").default(1),
  decimalsPolicy: decimalsPolicyEnum("decimals_policy").default("round"),
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

export type InsertBillingCustomer = z.infer<typeof insertBillingCustomerSchema>;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type BillingCustomer = typeof billingCustomers.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;

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
