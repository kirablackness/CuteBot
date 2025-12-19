import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  color?: "primary" | "secondary" | "accent";
  delay?: number;
}

export function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  color = "primary",
  delay = 0 
}: StatCardProps) {
  
  const colorStyles = {
    primary: "from-primary/20 to-primary/5 text-primary border-primary/20",
    secondary: "from-secondary/20 to-secondary/5 text-secondary border-secondary/20",
    accent: "from-accent/20 to-accent/5 text-accent border-accent/20",
  };

  const iconStyles = {
    primary: "bg-primary/20 text-primary",
    secondary: "bg-secondary/20 text-secondary",
    accent: "bg-accent/20 text-accent",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: delay * 0.1 }}
      className={cn(
        "relative overflow-hidden rounded-xl border p-6 glass-card",
        "hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30 transition-all duration-300 group",
        colorStyles[color].split(" ")[2] // grab border color
      )}
    >
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500",
        colorStyles[color].split(" ").slice(0, 2).join(" ") // grab gradient
      )} />
      
      <div className="relative z-10 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground font-display uppercase tracking-wider">{title}</p>
          <h3 className="text-4xl font-bold mt-2 font-display tracking-tight text-foreground group-hover:text-glow transition-all">
            {value}
          </h3>
          {trend && (
            <p className="text-xs text-primary mt-1 font-mono">
              {trend}
            </p>
          )}
        </div>
        <div className={cn("p-3 rounded-xl", iconStyles[color])}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </motion.div>
  );
}
