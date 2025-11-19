import { motion } from 'framer-motion';
import { ChevronRight, BarChart3, LucideIcon } from 'lucide-react';

interface InsightCardProps {
  IconComponent: LucideIcon;
  category: string;
  pattern: string;
  confidence: number;
  supportingData: string;
  details?: {
    daysAnalyzed?: number;
    additionalInfo?: string[];
    dateRange?: string;
  };
  isNew?: boolean;
  onViewDetails?: () => void;
  delay?: number;
}

export function InsightCard({
  IconComponent,
  category,
  pattern,
  confidence,
  supportingData,
  details,
  isNew = false,
  onViewDetails,
  delay = 0,
}: InsightCardProps) {
  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.8) return 'bg-teal-400';
    if (conf >= 0.6) return 'bg-blue-400';
    return 'bg-amber-400';
  };

  const getConfidenceLabel = (conf: number) => {
    if (conf >= 0.8) return 'High confidence';
    if (conf >= 0.6) return 'Medium confidence';
    return 'Low confidence';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
      className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-3 backdrop-blur-xl"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-teal-500/20 flex items-center justify-center">
          <IconComponent className="w-4 h-4 text-teal-400" />
        </div>
        <div className="flex-1">
          <span className="text-xs tracking-wide text-white/60">{category}</span>
        </div>
        {isNew && (
          <span className="text-[10px] bg-teal-500/30 text-teal-400 px-2 py-0.5 rounded-full">
            New
          </span>
        )}
      </div>

      {/* Pattern Text */}
      <p className="text-base font-medium text-white/95 mb-3 leading-relaxed line-clamp-3">
        {pattern}
      </p>

      {/* Confidence Bar */}
      <div className="mb-3">
        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${confidence * 100}%` }}
            transition={{ duration: 0.3, delay: delay + 0.2, ease: 'easeOut' }}
            className={`h-full ${getConfidenceColor(confidence)}`}
          />
        </div>
        <p className="text-xs text-white/60 mt-1">
          {Math.round(confidence * 100)}% {getConfidenceLabel(confidence).toLowerCase()}
        </p>
      </div>

      {/* Supporting Data */}
      {details && (
        <div className="mb-3">
          <div className="flex items-center gap-1 mb-2">
            <BarChart3 className="w-3 h-3 text-white/50" />
            <p className="text-xs text-white/50">Supporting data:</p>
          </div>
          <div className="space-y-1">
            {details.daysAnalyzed && (
              <p className="text-xs text-white/70">• {details.daysAnalyzed} days analyzed</p>
            )}
            {details.additionalInfo?.map((info, index) => (
              <p key={index} className="text-xs text-white/70">• {info}</p>
            ))}
            {details.dateRange && (
              <p className="text-xs text-white/70">• Active on: {details.dateRange}</p>
            )}
          </div>
        </div>
      )}

      {/* Simple supporting text for compact cards */}
      {!details && supportingData && (
        <p className="text-xs text-white/50">{supportingData}</p>
      )}

      {/* View Details Button */}
      {onViewDetails && (
        <button
          onClick={onViewDetails}
          className="flex items-center gap-1 text-xs text-teal-400 mt-3 hover:text-teal-300 transition-colors"
        >
          View details
          <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </motion.div>
  );
}

export function MiniInsightCard({
  IconComponent,
  pattern,
  supportingData,
  isNew = false,
}: {
  IconComponent: LucideIcon;
  pattern: string;
  supportingData: string;
  isNew?: boolean;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3">
      <div className="flex items-start gap-2 mb-2">
        <div className="w-6 h-6 rounded-lg bg-teal-500/20 flex items-center justify-center flex-shrink-0">
          <IconComponent className="w-3 h-3 text-teal-400" />
        </div>
        <p className="text-sm text-white/90 font-medium leading-snug line-clamp-2 flex-1">
          {pattern}
        </p>
        {isNew && (
          <span className="text-[9px] bg-teal-500/30 text-teal-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
            New
          </span>
        )}
      </div>
      <div className="border-t border-white/10 my-2" />
      <p className="text-xs text-white/50">{supportingData}</p>
    </div>
  );
}
