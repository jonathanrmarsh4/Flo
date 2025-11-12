// Reference: javascript_database and javascript_log_in_with_replit blueprints
import {
  users,
  bloodWorkRecords,
  analysisResults,
  type User,
  type UpsertUser,
  type BloodWorkRecord,
  type InsertBloodWorkRecord,
  type AnalysisResult,
  type InsertAnalysisResult,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Blood work operations
  createBloodWorkRecord(record: InsertBloodWorkRecord): Promise<BloodWorkRecord>;
  getBloodWorkRecord(id: string): Promise<BloodWorkRecord | undefined>;
  getBloodWorkRecordsByUser(userId: string): Promise<BloodWorkRecord[]>;
  getLatestBloodWorkRecord(userId: string): Promise<BloodWorkRecord | undefined>;
  updateBloodWorkRecordStatus(id: string, status: string): Promise<void>;
  
  // Analysis operations
  createAnalysisResult(analysis: InsertAnalysisResult): Promise<AnalysisResult>;
  getAnalysisResultByRecordId(recordId: string): Promise<AnalysisResult | undefined>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
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
}

export const storage = new DatabaseStorage();
