import { Link } from "wouter";
import { AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="glass-card rounded-2xl border p-12 text-center max-w-md w-full mx-4">
        <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-destructive" />
        </div>
        
        <h1 className="text-4xl font-bold font-display mb-2 text-foreground">404</h1>
        <p className="text-xl text-muted-foreground mb-8">Page Not Found</p>
        
        <Link href="/" className="inline-flex items-center justify-center px-6 py-3 rounded-lg font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors w-full">
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
