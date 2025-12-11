import { Heart, Circle, Activity, PenLine } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { DataSource } from '@shared/dataSource';

interface DataSourceBadgeProps {
  source: DataSource;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const SOURCE_CONFIG: Record<DataSource, {
  icon: typeof Heart;
  label: string;
  color: string;
  bg: string;
  border: string;
}> = {
  healthkit: {
    icon: Heart,
    label: 'Apple Health',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
  },
  oura: {
    icon: Circle,
    label: 'Oura Ring',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
  },
  dexcom: {
    icon: Activity,
    label: 'Dexcom CGM',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
  },
  manual: {
    icon: PenLine,
    label: 'Manual Entry',
    color: 'text-gray-400',
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/30',
  },
};

export function DataSourceBadge({ 
  source, 
  showLabel = false, 
  size = 'sm',
  className = '' 
}: DataSourceBadgeProps) {
  const config = SOURCE_CONFIG[source];
  
  if (!config) {
    return null;
  }
  
  const Icon = config.icon;
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const padding = showLabel ? 'px-1.5 py-0.5' : 'p-1';
  
  const badge = (
    <Badge
      variant="outline"
      className={`${config.bg} ${config.border} ${config.color} ${padding} gap-1 font-normal ${className}`}
      data-testid={`badge-source-${source}`}
    >
      <Icon className={iconSize} />
      {showLabel && (
        <span className={textSize}>{config.label}</span>
      )}
    </Badge>
  );
  
  if (!showLabel) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {config.label}
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return badge;
}

interface DataSourceIndicatorProps {
  source: DataSource;
  className?: string;
}

export function DataSourceIndicator({ source, className = '' }: DataSourceIndicatorProps) {
  const config = SOURCE_CONFIG[source];
  
  if (!config) {
    return null;
  }
  
  const Icon = config.icon;
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div 
          className={`inline-flex items-center ${config.color} ${className}`}
          data-testid={`indicator-source-${source}`}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        Data from {config.label}
      </TooltipContent>
    </Tooltip>
  );
}
