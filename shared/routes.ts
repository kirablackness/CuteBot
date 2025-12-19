import { z } from 'zod';
import { insertDownloadSchema, downloads } from './schema';

export const api = {
  stats: {
    get: {
      method: 'GET' as const,
      path: '/api/stats',
      responses: {
        200: z.object({
          totalDownloads: z.number(),
          platformStats: z.array(z.object({ platform: z.string(), count: z.number() })),
          recentDownloads: z.array(z.custom<typeof downloads.$inferSelect>())
        })
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
