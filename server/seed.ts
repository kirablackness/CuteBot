import { storage } from './storage';

export async function seedDatabase() {
  try {
    const stats = await storage.getStats();
    if (stats.total === 0) {
      console.log('Seeding database with sample data...');
      
      const platforms = ['youtube', 'tiktok', 'instagram', 'yandexmusic'];
      const statuses = ['completed', 'completed', 'completed', 'failed'];
      
      for (let i = 0; i < 20; i++) {
        const platform = platforms[Math.floor(Math.random() * platforms.length)];
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const fileSize = (Math.random() * 50 + 2).toFixed(1);
        
        await storage.createDownload({
          platform,
          url: `https://${platform}.com/example/${i}`,
          fileSizeMb: fileSize,
          status
        });
      }
      console.log('Database seeded!');
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}
