import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { setupBot } from "./bot";
import { api } from "@shared/routes";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Start the bot
  setupBot();

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
