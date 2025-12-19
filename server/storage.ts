import { db } from "./db";
import { downloads, type InsertDownload, type Download } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";

export interface IStorage {
  createDownload(download: InsertDownload): Promise<Download>;
  getDownloads(limit?: number): Promise<Download[]>;
  getStats(): Promise<{
    total: number;
    byPlatform: { platform: string; count: number }[];
  }>;
}

export class DatabaseStorage implements IStorage {
  async createDownload(download: InsertDownload): Promise<Download> {
    const [newDownload] = await db.insert(downloads).values(download).returning();
    return newDownload;
  }

  async getDownloads(limit = 10): Promise<Download[]> {
    return await db.select().from(downloads).orderBy(desc(downloads.createdAt)).limit(limit);
  }

  async getStats() {
    const totalResult = await db.select({ count: sql<number>`count(*)` }).from(downloads);
    const total = Number(totalResult[0]?.count || 0);

    const byPlatform = await db
      .select({
        platform: downloads.platform,
        count: sql<number>`count(*)::int`,
      })
      .from(downloads)
      .groupBy(downloads.platform);

    return { total, byPlatform };
  }
}

export const storage = new DatabaseStorage();
