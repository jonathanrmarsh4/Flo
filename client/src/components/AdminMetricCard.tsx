import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface AdminMetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function AdminMetricCard({
  title,
  value,
  icon: Icon,
  subtitle,
  trend,
  className,
}: AdminMetricCardProps) {
  return (
    <Card className={cn("hover-elevate active-elevate-2 transition-all", className)} data-testid={`metric-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className={cn(
            "p-3 rounded-xl backdrop-blur-xl",
            "bg-primary/10 dark:bg-primary/20"
          )}>
            <Icon className="w-5 h-5 text-primary" />
          </div>
          {trend && (
            <div 
              className={cn(
                "text-xs font-medium px-2 py-1 rounded-full",
                trend.isPositive 
                  ? "bg-success/10 text-success dark:bg-success/20" 
                  : "bg-destructive/10 text-destructive dark:bg-destructive/20"
              )}
              data-testid={`status-trend-${title.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {trend.isPositive ? '+' : ''}{trend.value}%
            </div>
          )}
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-muted-foreground" data-testid={`text-title-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {title}
          </h3>
          <p className="text-2xl font-semibold text-foreground" data-testid={`value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground" data-testid={`text-subtitle-${title.toLowerCase().replace(/\s+/g, '-')}`}>
              {subtitle}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
