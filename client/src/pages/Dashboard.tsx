import { useStats } from "@/hooks/use-stats";
import { StatCard } from "@/components/StatCard";
import { PlatformChart } from "@/components/PlatformChart";
import { RecentDownloadsTable } from "@/components/RecentDownloadsTable";
import { Download, Activity, Server, Clock, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { data: stats, isLoading, error, refetch, isRefetching } = useStats();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-primary font-display animate-pulse">CONNECTING TO MAINFRAME...</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-md border border-destructive/20 bg-destructive/5 p-8 rounded-2xl">
          <Server className="w-16 h-16 mx-auto text-destructive opacity-50" />
          <h2 className="text-2xl font-bold font-display text-destructive">System Error</h2>
          <p className="text-muted-foreground">Unable to establish connection with the stats API.</p>
          <button 
            onClick={() => refetch()}
            className="px-6 py-2 bg-destructive text-destructive-foreground rounded-lg font-medium hover:bg-destructive/90 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Calculate some derived stats for display
  const totalVolume = stats.recentDownloads.reduce((acc, curr) => {
    return acc + (parseFloat(curr.fileSizeMb || "0") || 0);
  }, 0);

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header Bar */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center">
              <Download className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold font-display tracking-tight">
              BOT<span className="text-primary">ADMIN</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-mono text-green-500 uppercase">System Online</span>
            </div>
            <button 
              onClick={() => refetch()}
              disabled={isRefetching}
              className={`p-2 rounded-lg hover:bg-white/5 transition-colors ${isRefetching ? 'animate-spin opacity-50' : ''}`}
            >
              <RefreshCw className="w-5 h-5 text-muted-foreground hover:text-primary transition-colors" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Hero Section */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative"
        >
          <h2 className="text-3xl font-display font-bold mb-2">Live Overview</h2>
          <p className="text-muted-foreground">Real-time metrics from media downloader bot instances.</p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard 
            title="Total Downloads" 
            value={stats.totalDownloads.toLocaleString()} 
            icon={Download} 
            color="primary"
            delay={1}
          />
          <StatCard 
            title="Active Platforms" 
            value={stats.platformStats.length} 
            icon={Activity} 
            color="secondary"
            delay={2}
          />
          <StatCard 
            title="Recent Volume" 
            value={`${totalVolume.toFixed(1)} MB`} 
            icon={Server} 
            color="accent"
            trend="Last 10 items"
            delay={3}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Chart Section - Spans 2 cols on large screens */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="lg:col-span-2 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold font-display flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Platform Distribution
              </h3>
            </div>
            <div className="glass-card rounded-xl border p-6 min-h-[400px]">
              <PlatformChart data={stats.platformStats} />
            </div>
          </motion.div>

          {/* Activity Feed Section - Spans 1 col */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold font-display flex items-center gap-2">
                <Clock className="w-5 h-5 text-secondary" />
                Latest Activity
              </h3>
            </div>
            <div className="glass-card rounded-xl border overflow-hidden min-h-[400px] flex flex-col">
              {stats.recentDownloads.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
                  <p>No recent activity</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {stats.recentDownloads.slice(0, 5).map((download) => (
                    <div key={download.id} className="p-4 hover:bg-white/5 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                          {download.platform}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {download.createdAt 
                            ? new Date(download.createdAt).toLocaleTimeString()
                            : 'Just now'}
                        </span>
                      </div>
                      <a href={download.url} target="_blank" className="text-sm block truncate hover:text-white transition-colors">
                        {download.url}
                      </a>
                    </div>
                  ))}
                </div>
              )}
              <div className="p-4 bg-white/5 border-t border-white/5 text-center">
                <button className="text-xs font-medium text-primary hover:text-primary/80 transition-colors uppercase tracking-wider">
                  View Full Logs
                </button>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Detailed Table Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="space-y-4"
        >
          <h3 className="text-lg font-bold font-display">Recent Transactions</h3>
          <div className="glass-card rounded-xl border overflow-hidden">
            <RecentDownloadsTable downloads={stats.recentDownloads} />
          </div>
        </motion.div>

      </main>
    </div>
  );
}
