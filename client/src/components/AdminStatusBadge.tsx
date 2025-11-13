import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusVariant = "success" | "warning" | "error" | "info" | "neutral";

interface AdminStatusBadgeProps {
  status: StatusVariant;
  children: React.ReactNode;
  className?: string;
}

const statusStyles: Record<StatusVariant, string> = {
  success: "bg-success/10 text-success border-success/20 dark:bg-success/20 dark:text-success-foreground",
  warning: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:bg-yellow-500/20 dark:text-yellow-400",
  error: "bg-destructive/10 text-destructive border-destructive/20 dark:bg-destructive/20 dark:text-destructive-foreground",
  info: "bg-primary/10 text-primary border-primary/20 dark:bg-primary/20 dark:text-primary-foreground",
  neutral: "bg-secondary/10 text-secondary-foreground border-secondary/20 dark:bg-secondary/20",
};

export function AdminStatusBadge({ status, children, className }: AdminStatusBadgeProps) {
  return (
    <Badge 
      variant="outline" 
      className={cn(statusStyles[status], className)}
      data-testid={`status-badge-${status}`}
    >
      {children}
    </Badge>
  );
}
