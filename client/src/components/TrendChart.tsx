import { useState } from 'react';
import { format } from 'date-fns';

interface DataPoint {
  value: number;
  date: string;
}

interface TrendChartProps {
  history: DataPoint[];
  min: number;
  max: number;
  biomarker: string;
  isDark: boolean;
}

export function TrendChart({ history, min, max, biomarker, isDark }: TrendChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  if (history.length < 2) return null;

  const width = 400;
  const height = 100;
  const padding = 20;
  
  const chartWidth = width - 2 * padding;
  const chartHeight = height - 2 * padding;
  
  const values = history.map(h => h.value);
  const minValue = Math.min(...values, min);
  const maxValue = Math.max(...values, max);
  const valueRange = maxValue - minValue || 1;
  
  const points = history.map((point, index) => {
    const x = padding + (index / (history.length - 1)) * chartWidth;
    const y = height - padding - ((point.value - minValue) / valueRange) * chartHeight;
    const inRange = point.value >= min && point.value <= max;
    return { x, y, inRange, value: point.value, date: point.date };
  });
  
  const minY = height - padding - ((min - minValue) / valueRange) * chartHeight;
  const maxY = height - padding - ((max - minValue) / valueRange) * chartHeight;
  
  return (
    <div className="mt-4" data-testid={`trend-chart-${biomarker.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className={`text-xs mb-2 ${isDark ? 'text-white/50' : 'text-gray-500'}`} data-testid="text-trend-label">
        Trend Over Time
      </div>
      
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
        data-testid="svg-trend-chart"
      >
        {/* Reference range background */}
        <rect
          x={padding}
          y={maxY}
          width={chartWidth}
          height={minY - maxY}
          fill={isDark ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.15)'}
          rx={4}
        />
        
        {/* Reference lines */}
        <line
          x1={padding}
          y1={minY}
          x2={width - padding}
          y2={minY}
          stroke={isDark ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.4)'}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <line
          x1={padding}
          y1={maxY}
          x2={width - padding}
          y2={maxY}
          stroke={isDark ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.4)'}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        
        {/* Line segments */}
        {points.slice(0, -1).map((point, index) => {
          const nextPoint = points[index + 1];
          const color = point.inRange && nextPoint.inRange 
            ? (isDark ? '#22c55e' : '#16a34a')
            : (isDark ? '#ef4444' : '#dc2626');
          
          return (
            <line
              key={`line-${index}`}
              x1={point.x}
              y1={point.y}
              x2={nextPoint.x}
              y2={nextPoint.y}
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          );
        })}
        
        {/* Data points */}
        {points.map((point, index) => {
          const tooltipWidth = 50;
          const tooltipHeight = 22;
          const tooltipPadding = 5;
          
          // Calculate tooltip position and clamp to SVG boundaries
          let tooltipX = point.x - tooltipWidth / 2;
          let tooltipY = point.y - tooltipHeight - 15;
          
          // Clamp horizontal position
          tooltipX = Math.max(padding, Math.min(tooltipX, width - padding - tooltipWidth));
          
          // If tooltip would go above SVG, show below point instead
          if (tooltipY < 0) {
            tooltipY = point.y + 15;
          }
          
          return (
            <g key={`point-${index}`}>
              <circle
                cx={point.x}
                cy={point.y}
                r={hoveredPoint === index ? 6 : 4}
                fill={point.inRange 
                  ? (isDark ? '#22c55e' : '#16a34a')
                  : (isDark ? '#ef4444' : '#dc2626')}
                stroke={isDark ? '#1e293b' : '#ffffff'}
                strokeWidth={2}
                style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                onMouseEnter={() => setHoveredPoint(index)}
                onMouseLeave={() => setHoveredPoint(null)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  setHoveredPoint(index);
                }}
                onTouchEnd={() => setHoveredPoint(null)}
                onFocus={() => setHoveredPoint(index)}
                onBlur={() => setHoveredPoint(null)}
                tabIndex={0}
                role="button"
                aria-label={`Data point for ${format(new Date(point.date), 'MM/yy')}: ${point.value}`}
                data-testid={`point-${biomarker.toLowerCase().replace(/\s+/g, '-')}-${index}`}
              />
              {hoveredPoint === index && (
                <g>
                  <rect
                    x={tooltipX}
                    y={tooltipY}
                    width={tooltipWidth}
                    height={tooltipHeight}
                    rx={4}
                    fill={isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)'}
                    stroke={isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'}
                    strokeWidth={1}
                  />
                  <text
                    x={tooltipX + tooltipWidth / 2}
                    y={tooltipY + tooltipHeight / 2 + 4}
                    textAnchor="middle"
                    className={`text-[11px] font-medium ${isDark ? 'fill-white' : 'fill-gray-900'}`}
                    data-testid={`tooltip-${biomarker.toLowerCase().replace(/\s+/g, '-')}-${index}`}
                  >
                    {format(new Date(point.date), 'MM/yy')}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      
      {/* Legend */}
      <div className="flex items-center gap-4 mt-2" data-testid="legend-trend-chart">
        <div className="flex items-center gap-1.5" data-testid="legend-item-in-range">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" data-testid="indicator-in-range" />
          <span className={`text-[10px] ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            In Range
          </span>
        </div>
        <div className="flex items-center gap-1.5" data-testid="legend-item-out-of-range">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" data-testid="indicator-out-of-range" />
          <span className={`text-[10px] ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            Out of Range
          </span>
        </div>
      </div>
    </div>
  );
}
