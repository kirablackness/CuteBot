import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { setupBot } from "./bot";
import { startCleanupTask } from "./cleanup";
import { api } from "@shared/routes";
import { seedDatabase } from "./seed";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Start the bot and cleanup task
  setupBot();
  startCleanupTask();
  
  // Seed DB if empty
  seedDatabase();

  // API Routes
  app.get(api.stats.get.path, async (req, res) => {
    const stats = await storage.getStats();
    const recent = await storage.getDownloads(10);
    
    res.json({
      totalDownloads: stats.total,
      platformStats: stats.byPlatform,
      recentDownloads: recent
    });
  });

  return httpServer;
}
