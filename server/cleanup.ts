import fs from 'fs';
import path from 'path';
import os from 'os';
import { storage } from './storage';

const TEMP_DIR = os.tmpdir();
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function startCleanupTask() {
  console.log('🧹 Cleanup task started');
  
  // Run every 6 hours
  setInterval(async () => {
    try {
      console.log('🧹 Running cleanup...');
      
      // 1. Clean /tmp directory from bot files
      const files = fs.readdirSync(TEMP_DIR);
      const now = Date.now();
      
      files.forEach(file => {
        if (file.startsWith('yandexmusic_') || file.startsWith('youtube_') || 
            file.startsWith('tiktok_') || file.startsWith('instagram_')) {
          const filePath = path.join(TEMP_DIR, file);
          const stats = fs.statSync(filePath);
          
          if (now - stats.mtimeMs > MAX_AGE_MS) {
            fs.unlinkSync(filePath);
            console.log(\`🗑 Deleted old temp file: \${file}\`);
          }
        }
      });
      
      // 2. Database stays small as it only stores logs, no need to purge for now
      // but we could delete failed logs older than 30 days if needed.
      
    } catch (error) {
      console.error('❌ Cleanup error:', error);
    }
  }, 6 * 60 * 60 * 1000);
}
