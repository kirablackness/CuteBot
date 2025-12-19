import { Download } from "@shared/schema";
import { motion } from "framer-motion";
import { ExternalLink, Youtube, Instagram, Music, Video, FileQuestion, HardDrive } from "lucide-react";

interface RecentDownloadsTableProps {
  downloads: Download[];
}

const getPlatformIcon = (platform: string) => {
  const p = platform.toLowerCase();
  if (p.includes("youtube")) return <Youtube className="w-4 h-4 text-red-500" />;
  if (p.includes("instagram")) return <Instagram className="w-4 h-4 text-pink-500" />;
  if (p.includes("tiktok")) return <Video className="w-4 h-4 text-cyan-500" />; // Generic video for TikTok
  if (p.includes("yandex")) return <Music className="w-4 h-4 text-yellow-500" />;
  return <FileQuestion className="w-4 h-4 text-muted-foreground" />;
};

export function RecentDownloadsTable({ downloads }: RecentDownloadsTableProps) {
  if (downloads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <HardDrive className="w-12 h-12 mb-4 opacity-20" />
        <p>No recent downloads recorded</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-muted-foreground font-display uppercase text-xs tracking-wider">
            <th className="px-6 py-4 font-medium">Platform</th>
            <th className="px-6 py-4 font-medium">Details</th>
            <th className="px-6 py-4 font-medium">Size</th>
            <th className="px-6 py-4 font-medium text-right">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {downloads.map((download, i) => (
            <motion.tr 
              key={download.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 + 0.3 }}
              className="hover:bg-white/5 transition-colors group"
            >
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="bg-background/50 p-2 rounded-lg border border-white/10 group-hover:border-primary/30 transition-colors">
                    {getPlatformIcon(download.platform)}
                  </div>
                  <span className="font-medium text-foreground">{download.platform}</span>
                </div>
              </td>
              <td className="px-6 py-4">
                <a 
                  href={download.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors max-w-[200px] sm:max-w-md truncate"
                >
                  <span className="truncate">{download.url}</span>
                  <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-50" />
                </a>
              </td>
              <td className="px-6 py-4 font-mono text-xs">
                {download.fileSizeMb ? (
                  <span className="bg-secondary/10 text-secondary px-2 py-1 rounded">
                    {download.fileSizeMb} MB
                  </span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </td>
              <td className="px-6 py-4 text-right text-muted-foreground font-mono text-xs">
                {download.createdAt 
                  ? new Date(download.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'Just now'}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
