// Reference: javascript_database and javascript_log_in_with_replit blueprints
import {
  users,
  profiles,
  authProviders,
  userCredentials,
  bloodWorkRecords,
  analysisResults,
  billingCustomers,
  subscriptions,
  payments,
  auditLogs,
  openaiUsageEvents,
  biomarkers,
  biomarkerSynonyms,
  biomarkerUnits,
  biomarkerReferenceRanges,
  biomarkerTestSessions,
  biomarkerMeasurements,
  biomarkerInsights,
  labUploadJobs,
  healthInsights,
  diagnosticsStudies,
  diagnosticMetrics,
  type User,
  type UpsertUser,
  type Profile,
  type InsertProfile,
  type UpdateDemographics,
  type UpdateHealthBaseline,
  type UpdateGoals,
  type UpdateAIPersonalization,
  type BloodWorkRecord,
  type InsertBloodWorkRecord,
  type AnalysisResult,
  type InsertAnalysisResult,
  type UpdateUser,
  type AdminUserSummary,
  type BillingCustomer,
  type Subscription,
  type Payment,
  type AuditLog,
  type OpenaiUsageEvent,
  type Biomarker,
  type BiomarkerSynonym,
  type BiomarkerUnit,
  type BiomarkerReferenceRange,
  type BiomarkerTestSession,
  type BiomarkerMeasurement,
  type InsertBiomarkerTestSession,
  type InsertBiomarkerMeasurement,
  type LabUploadJob,
  type InsertLabUploadJob,
  type AuthProvider,
  type InsertAuthProvider,
  type UserCredentials,
  type InsertUserCredentials,
  type DiagnosticsStudy,
  type InsertDiagnosticsStudy,
  type DiagnosticMetric,
  type InsertDiagnosticMetric,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, or, ilike, and, sql, lt, gt } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Profile operations
  getProfile(userId: string): Promise<Profile | undefined>;
  upsertProfile(userId: string, data: Partial<InsertProfile>): Promise<Profile>;
  updateDemographics(userId: string, data: UpdateDemographics): Promise<Profile>;
  updateHealthBaseline(userId: string, data: UpdateHealthBaseline): Promise<Profile>;
  updateGoals(userId: string, data: UpdateGoals): Promise<Profile>;
  updateAIPersonalization(userId: string, data: UpdateAIPersonalization): Promise<Profile>;
  
  // Blood work operations
  createBloodWorkRecord(record: InsertBloodWorkRecord): Promise<BloodWorkRecord>;
  getBloodWorkRecord(id: string): Promise<BloodWorkRecord | undefined>;
  getBloodWorkRecordsByUser(userId: string): Promise<BloodWorkRecord[]>;
  getLatestBloodWorkRecord(userId: string): Promise<BloodWorkRecord | undefined>;
  updateBloodWorkRecordStatus(id: string, status: string): Promise<void>;
  
  // Analysis operations
  createAnalysisResult(analysis: InsertAnalysisResult): Promise<AnalysisResult>;
  getAnalysisResultByRecordId(recordId: string): Promise<AnalysisResult | undefined>;
  
  // Admin operations
  listUsers(params: { query?: string; role?: string; status?: string; limit?: number; offset?: number }): Promise<{ users: AdminUserSummary[]; total: number }>;
  updateUser(userId: string, data: UpdateUser, adminId: string): Promise<User | null>;
  
  // Admin analytics operations
  getAdminOverviewStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalRevenue: number;
    apiQueries7d: number;
    apiCost7d: number;
  }>;
  getApiUsageDaily(days?: number): Promise<Array<{
    date: string;
    queries: number;
    cost: number;
    model: string;
    avgLatency: number | null;
  }>>;
  getRevenueTrends(months?: number): Promise<Array<{
    month: string;
    revenue: number;
    userCount: number;
    churnCount: number;
  }>>;
  getSubscriptionBreakdown(): Promise<{
    free: number;
    premium: number;
    admin: number;
  }>;
  getAuditLogs(limit?: number): Promise<AuditLog[]>;
  
  // Billing operations
  getBillingInfo(userId: string): Promise<{ customer?: BillingCustomer; subscription?: Subscription; lastPayment?: Payment }>;
  createAuditLog(log: { adminId: string; targetUserId?: string; action: string; changes?: any; actionMetadata?: any }): Promise<void>;
  
  // Auth provider operations (mobile auth)
  upsertAuthProvider(data: InsertAuthProvider): Promise<AuthProvider>;
  getUserByProvider(provider: string, providerUserId: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  
  // User credentials operations (email/password auth)
  createUserCredentials(data: InsertUserCredentials): Promise<UserCredentials>;
  getUserCredentials(userId: string): Promise<UserCredentials | undefined>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  updateLastLoginAt(userId: string): Promise<void>;
  
  // Biomarker operations
  getBiomarkers(): Promise<Biomarker[]>;
  getBiomarkerBySynonym(name: string): Promise<{ biomarker: Biomarker; synonyms: BiomarkerSynonym[]; units: BiomarkerUnit[]; ranges: BiomarkerReferenceRange[] } | null>;
  getUnitConversions(biomarkerId: string): Promise<BiomarkerUnit[]>;
  getReferenceRanges(biomarkerId: string): Promise<BiomarkerReferenceRange[]>;
  getAllBiomarkerData(): Promise<{ biomarkers: Biomarker[]; synonyms: BiomarkerSynonym[]; units: BiomarkerUnit[]; ranges: BiomarkerReferenceRange[] }>;
  
  // Biomarker measurements operations
  createTestSession(session: InsertBiomarkerTestSession): Promise<BiomarkerTestSession>;
  createMeasurement(measurement: InsertBiomarkerMeasurement): Promise<BiomarkerMeasurement>;
  createMeasurementWithSession(params: {
    userId: string;
    biomarkerId: string;
    value: number;
    unit: string;
    testDate: Date;
    valueCanonical: number;
    unitCanonical: string;
    valueDisplay: string;
    referenceLow: number | null;
    referenceHigh: number | null;
    flags: string[];
    warnings: string[];
    normalizationContext: any;
  }): Promise<{ session: BiomarkerTestSession; measurement: BiomarkerMeasurement }>;
  getTestSessionsByUser(userId: string): Promise<BiomarkerTestSession[]>;
  getMeasurementsBySession(sessionId: string): Promise<BiomarkerMeasurement[]>;
  getMeasurementById(id: string): Promise<BiomarkerMeasurement | undefined>;
  getTestSessionById(id: string): Promise<BiomarkerTestSession | undefined>;
  getMeasurementBySessionAndBiomarker(sessionId: string, biomarkerId: string): Promise<BiomarkerMeasurement | undefined>;
  updateMeasurement(id: string, updates: Partial<BiomarkerMeasurement>): Promise<BiomarkerMeasurement>;
  deleteMeasurement(id: string): Promise<void>;
  deleteTestSession(id: string): Promise<void>;
  getMeasurementHistory(userId: string, biomarkerId: string, limit?: number): Promise<BiomarkerMeasurement[]>;
  getLatestMeasurementForBiomarker(userId: string, biomarkerId: string, measurementId?: string): Promise<BiomarkerMeasurement | undefined>;
  getCachedBiomarkerInsights(userId: string, biomarkerId: string, measurementSignature: string): Promise<any>;
  cacheBiomarkerInsights(params: {
    userId: string;
    biomarkerId: string;
    measurementSignature: string;
    profileSnapshot: any;
    measurementSummary: any;
    lifestyleActions: string[];
    nutrition: string[];
    supplementation: string[];
    medicalReferral: string | null;
    medicalUrgency: string;
    model: string;
    expiresAt: Date;
  }): Promise<any>;
  checkDuplicateMeasurement(params: {
    userId: string;
    biomarkerId: string;
    valueCanonical: number;
    testDate: Date;
  }): Promise<boolean>;
  
  createLabUploadJob(job: InsertLabUploadJob): Promise<LabUploadJob>;
  getLabUploadJob(id: string): Promise<LabUploadJob | undefined>;
  updateLabUploadJob(id: string, updates: Partial<LabUploadJob>): Promise<LabUploadJob>;
  getLabUploadJobsByUser(userId: string, limit?: number): Promise<LabUploadJob[]>;
  
  saveHealthInsights(params: {
    userId: string;
    analysisData: any;
    dataWindowDays: number | null;
    model: string;
    expiresAt: Date | null;
  }): Promise<any>;
  getLatestHealthInsights(userId: string): Promise<any | null>;
  
  // Diagnostic studies operations
  createDiagnosticStudy(study: InsertDiagnosticsStudy): Promise<DiagnosticsStudy>;
  createDiagnosticMetrics(metrics: InsertDiagnosticMetric[]): Promise<void>;
  getLatestDiagnosticStudy(userId: string, type: string): Promise<DiagnosticsStudy | null>;
  
  deleteUserData(userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    try {
      const [user] = await db
        .insert(users)
        .values(userData)
        .onConflictDoUpdate({
          target: users.id,
          set: {
            ...userData,
            updatedAt: new Date(),
          },
        })
        .returning();
      return user;
    } catch (error: any) {
      // Handle duplicate email constraint violation gracefully
      if (error.code === '23505' && error.constraint === 'users_email_unique') {
        // Email already exists but with different ID - update existing user by email
        const [existingUser] = await db.select().from(users).where(eq(users.email, userData.email!));
        if (existingUser) {
          const [updated] = await db
            .update(users)
            .set({
              ...userData,
              updatedAt: new Date(),
            })
            .where(eq(users.id, existingUser.id))
            .returning();
          return updated;
        }
      }
      throw error;
    }
  }

  // Profile operations
  async getProfile(userId: string): Promise<Profile | undefined> {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId));
    return profile;
  }

  async upsertProfile(userId: string, data: Partial<InsertProfile>): Promise<Profile> {
    const [profile] = await db
      .insert(profiles)
      .values({
        userId,
        ...data,
      })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: {
          ...data,
          updatedAt: new Date(),
        },
      })
      .returning();
    return profile;
  }

  async updateDemographics(userId: string, data: UpdateDemographics): Promise<Profile> {
    return await this.upsertProfile(userId, data);
  }

  async updateHealthBaseline(userId: string, data: UpdateHealthBaseline): Promise<Profile> {
    return await this.upsertProfile(userId, data);
  }

  async updateGoals(userId: string, data: UpdateGoals): Promise<Profile> {
    return await this.upsertProfile(userId, data);
  }

  async updateAIPersonalization(userId: string, data: UpdateAIPersonalization): Promise<Profile> {
    return await this.upsertProfile(userId, data);
  }

  // Blood work operations
  async createBloodWorkRecord(record: InsertBloodWorkRecord): Promise<BloodWorkRecord> {
    const [created] = await db
      .insert(bloodWorkRecords)
      .values(record)
      .returning();
    return created;
  }

  async getBloodWorkRecord(id: string): Promise<BloodWorkRecord | undefined> {
    const [record] = await db
      .select()
      .from(bloodWorkRecords)
      .where(eq(bloodWorkRecords.id, id));
    return record;
  }

  async getBloodWorkRecordsByUser(userId: string): Promise<BloodWorkRecord[]> {
    return await db
      .select()
      .from(bloodWorkRecords)
      .where(eq(bloodWorkRecords.userId, userId))
      .orderBy(desc(bloodWorkRecords.uploadedAt));
  }

  async getLatestBloodWorkRecord(userId: string): Promise<BloodWorkRecord | undefined> {
    const [record] = await db
      .select()
      .from(bloodWorkRecords)
      .where(eq(bloodWorkRecords.userId, userId))
      .orderBy(desc(bloodWorkRecords.uploadedAt))
      .limit(1);
    return record;
  }

  async updateBloodWorkRecordStatus(id: string, status: string): Promise<void> {
    await db
      .update(bloodWorkRecords)
      .set({ status })
      .where(eq(bloodWorkRecords.id, id));
  }

  // Analysis operations
  async createAnalysisResult(analysis: InsertAnalysisResult): Promise<AnalysisResult> {
    const [created] = await db
      .insert(analysisResults)
      .values(analysis)
      .returning();
    return created;
  }

  async getAnalysisResultByRecordId(recordId: string): Promise<AnalysisResult | undefined> {
    const [result] = await db
      .select()
      .from(analysisResults)
      .where(eq(analysisResults.recordId, recordId));
    return result;
  }

  // Admin operations
  async listUsers(params: { query?: string; role?: string; status?: string; limit?: number; offset?: number }): Promise<{ users: AdminUserSummary[]; total: number }> {
    const { query = '', role, status, limit = 50, offset = 0 } = params;
    
    const conditions = [];
    
    if (query) {
      conditions.push(
        or(
          ilike(users.email, `%${query}%`),
          ilike(users.firstName, `%${query}%`),
          ilike(users.lastName, `%${query}%`)
        )
      );
    }
    
    if (role) {
      conditions.push(eq(users.role, role as any));
    }
    
    if (status) {
      conditions.push(eq(users.status, status as any));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    // Enrich users with subscription and activity data
    const enrichedUsers = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        subscriptionStatus: sql<string>`
          CASE 
            WHEN ${subscriptions.status} IN ('active', 'trialing') THEN 'premium'
            ELSE 'free'
          END
        `,
        measurementCount: sql<number>`COALESCE(COUNT(DISTINCT ${bloodWorkRecords.id}), 0)`,
        lastUpload: sql<string | null>`MAX(${bloodWorkRecords.uploadedAt})`,
      })
      .from(users)
      .leftJoin(billingCustomers, eq(users.id, billingCustomers.userId))
      .leftJoin(
        subscriptions, 
        and(
          eq(billingCustomers.id, subscriptions.customerId),
          sql`${subscriptions.id} = (
            SELECT id FROM ${subscriptions} s2
            WHERE s2.customer_id = ${billingCustomers.id}
            ORDER BY s2.created_at DESC
            LIMIT 1
          )`
        )
      )
      .leftJoin(bloodWorkRecords, eq(users.id, bloodWorkRecords.userId))
      .where(whereClause)
      .groupBy(
        users.id,
        users.email,
        users.firstName,
        users.lastName,
        users.role,
        users.status,
        users.createdAt,
        users.updatedAt,
        subscriptions.status
      )
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);
    
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(whereClause);
    
    // Format dates and ensure types match AdminUserSummary
    const formattedUsers = enrichedUsers.map(user => ({
      ...user,
      subscriptionStatus: (user.subscriptionStatus || 'free') as 'free' | 'premium',
      measurementCount: Number(user.measurementCount || 0),
      lastUpload: user.lastUpload ? new Date(user.lastUpload).toISOString() : null,
      createdAt: new Date(user.createdAt).toISOString(),
      updatedAt: new Date(user.updatedAt).toISOString(),
    }));
    
    return {
      users: formattedUsers,
      total: Number(countResult?.count || 0),
    };
  }

  async updateUser(userId: string, data: UpdateUser, adminId: string): Promise<User | null> {
    const updateData: any = { updatedAt: new Date() };
    if (data.role !== undefined) {
      updateData.role = data.role;
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    
    if (!user) {
      return null;
    }
    
    await this.createAuditLog({
      adminId,
      targetUserId: userId,
      action: 'update_user',
      changes: data,
      actionMetadata: { role: data.role, status: data.status },
    });
    
    return user;
  }

  // Billing operations
  async getBillingInfo(userId: string): Promise<{ customer?: BillingCustomer; subscription?: Subscription; lastPayment?: Payment }> {
    const [customer] = await db
      .select()
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId));
    
    if (!customer) {
      return {};
    }
    
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.customerId, customer.id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    
    const [lastPayment] = await db
      .select()
      .from(payments)
      .where(eq(payments.customerId, customer.id))
      .orderBy(desc(payments.createdAt))
      .limit(1);
    
    return {
      customer,
      subscription,
      lastPayment,
    };
  }

  async createAuditLog(log: { adminId: string; targetUserId?: string; action: string; changes?: any; actionMetadata?: any }): Promise<void> {
    await db.insert(auditLogs).values({
      adminId: log.adminId,
      targetUserId: log.targetUserId,
      action: log.action,
      changes: log.changes,
      actionMetadata: log.actionMetadata,
    });
  }

  // Auth provider operations (mobile auth)
  async upsertAuthProvider(data: InsertAuthProvider): Promise<AuthProvider> {
    const [provider] = await db
      .insert(authProviders)
      .values(data)
      .onConflictDoUpdate({
        target: [authProviders.provider, authProviders.providerUserId],
        set: {
          ...data,
          updatedAt: new Date(),
        },
      })
      .returning();
    return provider;
  }

  async getUserByProvider(provider: string, providerUserId: string): Promise<User | undefined> {
    const [authProvider] = await db
      .select()
      .from(authProviders)
      .where(
        and(
          eq(authProviders.provider, provider as any),
          eq(authProviders.providerUserId, providerUserId)
        )
      );
    
    if (!authProvider) {
      return undefined;
    }
    
    return this.getUser(authProvider.userId);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    return user;
  }

  // User credentials operations (email/password auth)
  async createUserCredentials(data: InsertUserCredentials): Promise<UserCredentials> {
    const [credentials] = await db
      .insert(userCredentials)
      .values(data)
      .returning();
    return credentials;
  }

  async getUserCredentials(userId: string): Promise<UserCredentials | undefined> {
    const [credentials] = await db
      .select()
      .from(userCredentials)
      .where(eq(userCredentials.userId, userId));
    return credentials;
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await db
      .update(userCredentials)
      .set({ 
        passwordHash,
        resetToken: null,
        resetTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(userCredentials.userId, userId));
  }

  async createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await db
      .update(userCredentials)
      .set({ 
        resetToken: token,
        resetTokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(userCredentials.userId, userId));
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const [credentials] = await db
      .select()
      .from(userCredentials)
      .where(
        and(
          eq(userCredentials.resetToken, token),
          gt(userCredentials.resetTokenExpiresAt, sql`now()`)
        )
      );
    
    if (!credentials) {
      return undefined;
    }
    
    return this.getUser(credentials.userId);
  }

  async updateLastLoginAt(userId: string): Promise<void> {
    await db
      .update(userCredentials)
      .set({ 
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(userCredentials.userId, userId));
  }

  // Admin analytics operations
  async getAdminOverviewStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalRevenue: number;
    apiQueries7d: number;
    apiCost7d: number;
  }> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [userStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) FILTER (WHERE status = 'active')::int`,
      })
      .from(users);

    const [revenueStats] = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(amount) / 100.0, 0)`,
      })
      .from(payments)
      .where(eq(payments.status, "succeeded"));

    const [apiStats] = await db
      .select({
        queries: sql<number>`COALESCE(COUNT(*), 0)::int`,
        cost: sql<number>`COALESCE(SUM(cost), 0)`,
      })
      .from(openaiUsageEvents)
      .where(sql`created_at >= ${sevenDaysAgo}`);

    return {
      totalUsers: userStats?.total || 0,
      activeUsers: userStats?.active || 0,
      totalRevenue: Number(revenueStats?.totalRevenue || 0),
      apiQueries7d: apiStats?.queries || 0,
      apiCost7d: Number(apiStats?.cost || 0),
    };
  }

  async getApiUsageDaily(days: number = 7): Promise<Array<{
    date: string;
    queries: number;
    cost: number;
    model: string;
    avgLatency: number | null;
  }>> {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);

    const results = await db
      .select({
        date: sql<string>`DATE(created_at)::text`,
        model: openaiUsageEvents.model,
        queries: sql<number>`COUNT(*)::int`,
        cost: sql<number>`SUM(cost)`,
        avgLatency: sql<number>`AVG(latency_ms)`,
      })
      .from(openaiUsageEvents)
      .where(sql`created_at >= ${daysAgo}`)
      .groupBy(sql`DATE(created_at)`, openaiUsageEvents.model)
      .orderBy(sql`DATE(created_at) DESC`);

    return results.map(r => ({
      date: r.date,
      queries: r.queries,
      cost: Number(r.cost),
      model: r.model,
      avgLatency: r.avgLatency ? Number(r.avgLatency) : null,
    }));
  }

  async getRevenueTrends(months: number = 7): Promise<Array<{
    month: string;
    revenue: number;
    userCount: number;
    churnCount: number;
  }>> {
    const monthsAgo = new Date();
    monthsAgo.setMonth(monthsAgo.getMonth() - months);

    const revenueResults = await db
      .select({
        month: sql<string>`TO_CHAR(created_at, 'Mon YYYY')`,
        monthSort: sql<string>`DATE_TRUNC('month', created_at)::text`,
        revenue: sql<number>`SUM(amount) / 100.0`,
      })
      .from(payments)
      .where(
        and(
          sql`created_at >= ${monthsAgo}`,
          eq(payments.status, "succeeded")
        )
      )
      .groupBy(sql`DATE_TRUNC('month', created_at)`)
      .orderBy(sql`DATE_TRUNC('month', created_at) DESC`);

    const userResults = await db
      .select({
        month: sql<string>`TO_CHAR(created_at, 'Mon YYYY')`,
        monthSort: sql<string>`DATE_TRUNC('month', created_at)::text`,
        userCount: sql<number>`COUNT(*)::int`,
      })
      .from(users)
      .where(sql`created_at >= ${monthsAgo}`)
      .groupBy(sql`DATE_TRUNC('month', created_at)`)
      .orderBy(sql`DATE_TRUNC('month', created_at) DESC`);

    const churnResults = await db
      .select({
        month: sql<string>`TO_CHAR(updated_at, 'Mon YYYY')`,
        monthSort: sql<string>`DATE_TRUNC('month', updated_at)::text`,
        churnCount: sql<number>`COUNT(*) FILTER (WHERE status IN ('canceled', 'unpaid', 'past_due'))::int`,
      })
      .from(subscriptions)
      .where(sql`updated_at >= ${monthsAgo}`)
      .groupBy(sql`DATE_TRUNC('month', updated_at)`)
      .orderBy(sql`DATE_TRUNC('month', updated_at) DESC`);

    const monthMap = new Map<string, { revenue: number; userCount: number; churnCount: number }>();
    
    revenueResults.forEach(r => {
      monthMap.set(r.month, { revenue: Number(r.revenue || 0), userCount: 0, churnCount: 0 });
    });
    
    userResults.forEach(r => {
      const existing = monthMap.get(r.month) || { revenue: 0, userCount: 0, churnCount: 0 };
      monthMap.set(r.month, { ...existing, userCount: r.userCount });
    });
    
    churnResults.forEach(r => {
      const existing = monthMap.get(r.month) || { revenue: 0, userCount: 0, churnCount: 0 };
      monthMap.set(r.month, { ...existing, churnCount: r.churnCount });
    });

    return Array.from(monthMap.entries()).map(([month, data]) => ({
      month,
      ...data,
    }));
  }

  async getSubscriptionBreakdown(): Promise<{
    free: number;
    premium: number;
    admin: number;
  }> {
    const results = await db
      .select({
        role: users.role,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(users)
      .groupBy(users.role);

    const breakdown = {
      free: 0,
      premium: 0,
      admin: 0,
    };

    results.forEach(r => {
      if (r.role === 'free') breakdown.free = r.count;
      if (r.role === 'premium') breakdown.premium = r.count;
      if (r.role === 'admin') breakdown.admin = r.count;
    });

    return breakdown;
  }

  async getAuditLogs(limit: number = 50): Promise<AuditLog[]> {
    return await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  // Biomarker operations
  async getBiomarkers(): Promise<Biomarker[]> {
    return await db.select().from(biomarkers);
  }

  async getBiomarkerBySynonym(name: string): Promise<{ biomarker: Biomarker; synonyms: BiomarkerSynonym[]; units: BiomarkerUnit[]; ranges: BiomarkerReferenceRange[] } | null> {
    // Import the normalization function
    const { resolveBiomarker, BiomarkerNotFoundError } = await import("@shared/domain/biomarkers");
    
    // Get all biomarkers and synonyms
    const allBiomarkers = await this.getBiomarkers();
    const allSynonyms = await db.select().from(biomarkerSynonyms);
    
    // Resolve the biomarker (throws BiomarkerNotFoundError if not found)
    let biomarker;
    try {
      biomarker = resolveBiomarker(name, allBiomarkers, allSynonyms);
    } catch (error) {
      if (error instanceof BiomarkerNotFoundError) {
        return null;
      }
      throw error;
    }
    
    // Get all related data for this biomarker
    const [synonyms, units, ranges] = await Promise.all([
      db.select().from(biomarkerSynonyms).where(eq(biomarkerSynonyms.biomarkerId, biomarker.id)),
      db.select().from(biomarkerUnits).where(eq(biomarkerUnits.biomarkerId, biomarker.id)),
      db.select().from(biomarkerReferenceRanges).where(eq(biomarkerReferenceRanges.biomarkerId, biomarker.id)),
    ]);
    
    return {
      biomarker,
      synonyms,
      units,
      ranges,
    };
  }

  async getUnitConversions(biomarkerId: string): Promise<BiomarkerUnit[]> {
    return await db
      .select()
      .from(biomarkerUnits)
      .where(eq(biomarkerUnits.biomarkerId, biomarkerId));
  }

  async getReferenceRanges(biomarkerId: string): Promise<BiomarkerReferenceRange[]> {
    return await db
      .select()
      .from(biomarkerReferenceRanges)
      .where(eq(biomarkerReferenceRanges.biomarkerId, biomarkerId));
  }

  async getAllBiomarkerData(): Promise<{ biomarkers: Biomarker[]; synonyms: BiomarkerSynonym[]; units: BiomarkerUnit[]; ranges: BiomarkerReferenceRange[] }> {
    const [biomarkersData, synonyms, units, ranges] = await Promise.all([
      db.select().from(biomarkers),
      db.select().from(biomarkerSynonyms),
      db.select().from(biomarkerUnits),
      db.select().from(biomarkerReferenceRanges),
    ]);
    
    return {
      biomarkers: biomarkersData,
      synonyms,
      units,
      ranges,
    };
  }

  async createTestSession(session: InsertBiomarkerTestSession): Promise<BiomarkerTestSession> {
    const [newSession] = await db
      .insert(biomarkerTestSessions)
      .values(session)
      .returning();
    return newSession;
  }

  async createMeasurement(measurement: InsertBiomarkerMeasurement): Promise<BiomarkerMeasurement> {
    const [newMeasurement] = await db
      .insert(biomarkerMeasurements)
      .values(measurement)
      .returning();
    return newMeasurement;
  }

  async getTestSessionsByUser(userId: string): Promise<BiomarkerTestSession[]> {
    return await db
      .select()
      .from(biomarkerTestSessions)
      .where(eq(biomarkerTestSessions.userId, userId))
      .orderBy(desc(biomarkerTestSessions.testDate));
  }

  async getMeasurementsBySession(sessionId: string): Promise<BiomarkerMeasurement[]> {
    return await db
      .select()
      .from(biomarkerMeasurements)
      .where(eq(biomarkerMeasurements.sessionId, sessionId));
  }

  async createMeasurementWithSession(params: {
    userId: string;
    biomarkerId: string;
    value: number;
    unit: string;
    testDate: Date;
    valueCanonical: number;
    unitCanonical: string;
    valueDisplay: string;
    referenceLow: number | null;
    referenceHigh: number | null;
    flags: string[];
    warnings: string[];
    normalizationContext: any;
  }): Promise<{ session: BiomarkerTestSession; measurement: BiomarkerMeasurement }> {
    return await db.transaction(async (tx) => {
      const testDateStart = new Date(params.testDate);
      testDateStart.setHours(0, 0, 0, 0);
      const testDateEnd = new Date(params.testDate);
      testDateEnd.setHours(23, 59, 59, 999);

      const [existingSession] = await tx
        .select()
        .from(biomarkerTestSessions)
        .where(
          and(
            eq(biomarkerTestSessions.userId, params.userId),
            eq(biomarkerTestSessions.source, "manual"),
            sql`${biomarkerTestSessions.testDate} >= ${testDateStart}`,
            sql`${biomarkerTestSessions.testDate} <= ${testDateEnd}`
          )
        )
        .orderBy(desc(biomarkerTestSessions.createdAt))
        .limit(1);

      let session: BiomarkerTestSession;
      if (existingSession) {
        session = existingSession;
      } else {
        const [newSession] = await tx
          .insert(biomarkerTestSessions)
          .values({
            userId: params.userId,
            source: "manual",
            testDate: params.testDate,
          })
          .returning();
        session = newSession;
      }

      const [measurement] = await tx
        .insert(biomarkerMeasurements)
        .values({
          sessionId: session.id,
          biomarkerId: params.biomarkerId,
          valueRaw: params.value,
          unitRaw: params.unit,
          valueCanonical: params.valueCanonical,
          unitCanonical: params.unitCanonical,
          valueDisplay: params.valueDisplay,
          referenceLow: params.referenceLow,
          referenceHigh: params.referenceHigh,
          flags: params.flags,
          warnings: params.warnings,
          normalizationContext: params.normalizationContext,
        })
        .returning();

      return { session, measurement };
    });
  }

  async getLatestMeasurementForBiomarker(userId: string, biomarkerId: string, measurementId?: string): Promise<BiomarkerMeasurement | undefined> {
    if (measurementId) {
      const [measurement] = await db
        .select()
        .from(biomarkerMeasurements)
        .innerJoin(biomarkerTestSessions, eq(biomarkerMeasurements.sessionId, biomarkerTestSessions.id))
        .where(
          and(
            eq(biomarkerMeasurements.id, measurementId),
            eq(biomarkerTestSessions.userId, userId),
            eq(biomarkerMeasurements.biomarkerId, biomarkerId)
          )
        )
        .limit(1);
      return measurement?.biomarker_measurements;
    }

    const [measurement] = await db
      .select()
      .from(biomarkerMeasurements)
      .innerJoin(biomarkerTestSessions, eq(biomarkerMeasurements.sessionId, biomarkerTestSessions.id))
      .where(
        and(
          eq(biomarkerTestSessions.userId, userId),
          eq(biomarkerMeasurements.biomarkerId, biomarkerId)
        )
      )
      .orderBy(desc(biomarkerTestSessions.testDate))
      .limit(1);
    return measurement?.biomarker_measurements;
  }

  async getMeasurementHistory(userId: string, biomarkerId: string, limit: number = 5): Promise<BiomarkerMeasurement[]> {
    const measurements = await db
      .select()
      .from(biomarkerMeasurements)
      .innerJoin(biomarkerTestSessions, eq(biomarkerMeasurements.sessionId, biomarkerTestSessions.id))
      .where(
        and(
          eq(biomarkerTestSessions.userId, userId),
          eq(biomarkerMeasurements.biomarkerId, biomarkerId)
        )
      )
      .orderBy(desc(biomarkerTestSessions.testDate))
      .limit(limit);
    return measurements.map(m => m.biomarker_measurements);
  }

  async checkDuplicateMeasurement(params: {
    userId: string;
    biomarkerId: string;
    valueCanonical: number;
    testDate: Date;
  }): Promise<boolean> {
    // Round canonical value to 3 decimal places to handle floating-point drift
    const roundedValue = Math.round(params.valueCanonical * 1000) / 1000;
    const epsilon = 0.001;
    
    // Check for existing measurements with same biomarker, same value (within epsilon), and same day
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(biomarkerMeasurements)
      .innerJoin(biomarkerTestSessions, eq(biomarkerMeasurements.sessionId, biomarkerTestSessions.id))
      .where(
        and(
          eq(biomarkerTestSessions.userId, params.userId),
          eq(biomarkerMeasurements.biomarkerId, params.biomarkerId),
          // Compare dates at day level using date_trunc
          sql`date_trunc('day', ${biomarkerTestSessions.testDate}) = date_trunc('day', ${params.testDate}::timestamp)`,
          // Compare canonical values using BETWEEN for epsilon tolerance
          sql`${biomarkerMeasurements.valueCanonical} BETWEEN ${roundedValue - epsilon} AND ${roundedValue + epsilon}`
        )
      );
    
    return result[0]?.count > 0;
  }

  async getMeasurementById(id: string): Promise<BiomarkerMeasurement | undefined> {
    const [measurement] = await db
      .select()
      .from(biomarkerMeasurements)
      .where(eq(biomarkerMeasurements.id, id));
    return measurement;
  }

  async getTestSessionById(id: string): Promise<BiomarkerTestSession | undefined> {
    const [session] = await db
      .select()
      .from(biomarkerTestSessions)
      .where(eq(biomarkerTestSessions.id, id));
    return session;
  }

  async getMeasurementBySessionAndBiomarker(sessionId: string, biomarkerId: string): Promise<BiomarkerMeasurement | undefined> {
    const [measurement] = await db
      .select()
      .from(biomarkerMeasurements)
      .where(
        and(
          eq(biomarkerMeasurements.sessionId, sessionId),
          eq(biomarkerMeasurements.biomarkerId, biomarkerId)
        )
      )
      .limit(1);
    return measurement;
  }

  async updateMeasurement(id: string, updates: Partial<BiomarkerMeasurement>): Promise<BiomarkerMeasurement> {
    const [updatedMeasurement] = await db
      .update(biomarkerMeasurements)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(biomarkerMeasurements.id, id))
      .returning();
    return updatedMeasurement;
  }

  async deleteMeasurement(id: string): Promise<void> {
    await db
      .delete(biomarkerMeasurements)
      .where(eq(biomarkerMeasurements.id, id));
  }

  async deleteTestSession(id: string): Promise<void> {
    await db
      .delete(biomarkerTestSessions)
      .where(eq(biomarkerTestSessions.id, id));
  }

  async deleteUserData(userId: string): Promise<void> {
    // Delete all user data in a transaction for atomicity
    // FK cascades will handle dependent records:
    // - bloodWorkRecords → analysisResults (cascade)
    // - biomarkerTestSessions → biomarkerMeasurements (cascade)
    // - diagnosticsStudies → diagnosticMetrics (cascade)
    await db.transaction(async (tx) => {
      // Delete diagnostic studies (cascades to diagnosticMetrics)
      await tx
        .delete(diagnosticsStudies)
        .where(eq(diagnosticsStudies.userId, userId));
      
      // Delete blood work records (cascades to analysisResults)
      await tx
        .delete(bloodWorkRecords)
        .where(eq(bloodWorkRecords.userId, userId));
      
      // Delete biomarker test sessions (cascades to biomarkerMeasurements)
      await tx
        .delete(biomarkerTestSessions)
        .where(eq(biomarkerTestSessions.userId, userId));
      
      // Delete cached biomarker insights
      await tx
        .delete(biomarkerInsights)
        .where(eq(biomarkerInsights.userId, userId));
      
      // Delete lab upload jobs
      await tx
        .delete(labUploadJobs)
        .where(eq(labUploadJobs.userId, userId));
    });
  }

  async getCachedBiomarkerInsights(userId: string, biomarkerId: string, measurementSignature: string) {
    const [insights] = await db
      .select()
      .from(biomarkerInsights)
      .where(
        and(
          eq(biomarkerInsights.userId, userId),
          eq(biomarkerInsights.biomarkerId, biomarkerId),
          eq(biomarkerInsights.measurementSignature, measurementSignature)
        )
      )
      .limit(1);
    return insights || null;
  }

  async getLatestCachedInsights(userId: string, biomarkerId: string) {
    const [insights] = await db
      .select()
      .from(biomarkerInsights)
      .where(
        and(
          eq(biomarkerInsights.userId, userId),
          eq(biomarkerInsights.biomarkerId, biomarkerId)
        )
      )
      .orderBy(desc(biomarkerInsights.generatedAt))
      .limit(1);
    return insights || null;
  }

  async cacheBiomarkerInsights(params: {
    userId: string;
    biomarkerId: string;
    measurementSignature: string;
    profileSnapshot: any;
    measurementSummary: any;
    lifestyleActions: string[];
    nutrition: string[];
    supplementation: string[];
    medicalReferral: string | null;
    medicalUrgency: string;
    model: string;
    expiresAt: Date;
  }) {
    const [insights] = await db
      .insert(biomarkerInsights)
      .values(params)
      .onConflictDoUpdate({
        target: [biomarkerInsights.userId, biomarkerInsights.biomarkerId, biomarkerInsights.measurementSignature],
        set: {
          profileSnapshot: params.profileSnapshot,
          measurementSummary: params.measurementSummary,
          lifestyleActions: params.lifestyleActions,
          nutrition: params.nutrition,
          supplementation: params.supplementation,
          medicalReferral: params.medicalReferral,
          medicalUrgency: params.medicalUrgency,
          model: params.model,
          expiresAt: params.expiresAt,
          generatedAt: sql`NOW()`,
        },
      })
      .returning();
    return insights;
  }

  async createLabUploadJob(job: InsertLabUploadJob): Promise<LabUploadJob> {
    const [created] = await db.insert(labUploadJobs).values(job).returning();
    return created;
  }

  async getLabUploadJob(id: string): Promise<LabUploadJob | undefined> {
    const [job] = await db.select().from(labUploadJobs).where(eq(labUploadJobs.id, id));
    return job;
  }

  async updateLabUploadJob(id: string, updates: Partial<LabUploadJob>): Promise<LabUploadJob> {
    const [updated] = await db
      .update(labUploadJobs)
      .set({ ...updates, updatedAt: sql`NOW()` })
      .where(eq(labUploadJobs.id, id))
      .returning();
    return updated;
  }

  async getLabUploadJobsByUser(userId: string, limit: number = 20): Promise<LabUploadJob[]> {
    return db
      .select()
      .from(labUploadJobs)
      .where(eq(labUploadJobs.userId, userId))
      .orderBy(desc(labUploadJobs.createdAt))
      .limit(limit);
  }

  async saveHealthInsights(params: {
    userId: string;
    analysisData: any;
    dataWindowDays: number | null;
    model: string;
    expiresAt: Date | null;
  }) {
    const [insights] = await db
      .insert(healthInsights)
      .values(params)
      .returning();
    return insights;
  }

  async getLatestHealthInsights(userId: string) {
    const [insights] = await db
      .select()
      .from(healthInsights)
      .where(eq(healthInsights.userId, userId))
      .orderBy(desc(healthInsights.generatedAt))
      .limit(1);
    return insights || null;
  }

  // Diagnostic studies operations
  async createDiagnosticStudy(study: InsertDiagnosticsStudy): Promise<DiagnosticsStudy> {
    const [created] = await db
      .insert(diagnosticsStudies)
      .values(study)
      .returning();
    return created;
  }

  async createDiagnosticMetrics(metrics: InsertDiagnosticMetric[]): Promise<void> {
    if (metrics.length === 0) return;
    await db.insert(diagnosticMetrics).values(metrics);
  }

  async getLatestDiagnosticStudy(userId: string, type: string): Promise<DiagnosticsStudy | null> {
    const [study] = await db
      .select()
      .from(diagnosticsStudies)
      .where(and(
        eq(diagnosticsStudies.userId, userId),
        sql`${diagnosticsStudies.type} = ${type}`
      ))
      .orderBy(desc(diagnosticsStudies.studyDate))
      .limit(1);
    return study || null;
  }
}

export const storage = new DatabaseStorage();
