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
  warning: "bg-warning/10 text-warning border-warning/20 dark:bg-warning/20 dark:text-warning-foreground",
  error: "bg-error/10 text-error border-error/20 dark:bg-error/20 dark:text-error-foreground",
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
