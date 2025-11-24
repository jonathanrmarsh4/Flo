import { ChevronDown, ChevronUp, AlertTriangle, Upload, Calendar, Clock } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';

interface OverdueLabWork {
  id: string;
  name: string;
  lastTested: string;
  dueDate: string;
  daysOverdue: number;
  priority: 'high' | 'urgent';
}

interface UpcomingLabWork {
  id: string;
  name: string;
  lastTested: string;
  dueDate: string;
  daysUntilDue: number;
}

interface LabWorkOverdueResponse {
  overdue: OverdueLabWork[];
  upcoming: UpcomingLabWork[];
  hasLabData: boolean;
}

export function OverdueLabWorkTile() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [, setLocation] = useLocation();

  const { data, isLoading, error } = useQuery<LabWorkOverdueResponse>({
    queryKey: ['/api/lab-work-overdue'],
  });

  const handleUploadResults = () => {
    setLocation('/labs');
  };

  if (isLoading) {
    return (
      <div className="backdrop-blur-xl rounded-2xl border-2 bg-gradient-to-br from-orange-500/15 via-red-500/15 to-rose-500/15 border-orange-500/40 shadow-lg shadow-orange-500/20 p-4 animate-pulse">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-orange-500/30 w-12 h-12"></div>
          <div className="flex-1">
            <div className="h-5 bg-orange-300/20 rounded w-32 mb-2"></div>
            <div className="h-4 bg-orange-300/10 rounded w-48"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const overdueLabWork = data.overdue;
  const upcomingLabWork = data.upcoming;

  if (!data.hasLabData || (overdueLabWork.length === 0 && upcomingLabWork.length === 0)) {
    return null;
  }

  const urgentCount = overdueLabWork.filter(lab => lab.priority === 'urgent').length;
  const totalOverdue = overdueLabWork.length;
  const totalUpcoming = upcomingLabWork.length;

  return (
    <div 
      className="backdrop-blur-xl rounded-2xl border-2 transition-all bg-gradient-to-br from-orange-500/15 via-red-500/15 to-rose-500/15 border-orange-500/40 shadow-lg shadow-orange-500/20"
      data-testid="tile-overdue-lab-work"
    >
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-4 cursor-pointer"
      >
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl border-2 transition-all bg-gradient-to-br from-orange-500/30 to-red-500/30 border-orange-500/50">
            <AlertTriangle className="w-6 h-6 text-orange-300" />
          </div>
          
          <div className="flex-1">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="font-semibold text-orange-200">
                  Lab Work Overdue
                </h3>
                <p className="text-sm mt-0.5 text-orange-300/80">
                  {totalOverdue} test{totalOverdue !== 1 ? 's' : ''} need{totalOverdue === 1 ? 's' : ''} to be updated
                  {urgentCount > 0 && ` • ${urgentCount} urgent`}
                </p>
              </div>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
                data-testid="button-toggle-lab-overdue"
              >
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-orange-300" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-orange-300" />
                )}
              </button>
            </div>
            
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <div className="px-2.5 py-1 rounded-lg border bg-red-500/20 border-red-500/40">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-red-300" />
                  <span className="text-xs font-medium text-red-300">
                    Action Required
                  </span>
                </div>
              </div>
              {totalUpcoming > 0 && (
                <div className="px-2.5 py-1 rounded-lg border bg-yellow-500/20 border-yellow-500/40">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-yellow-300">
                      {totalUpcoming} upcoming
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          <div className="h-px bg-orange-500/20" />
          
          {totalOverdue > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 text-red-300">
                Overdue ({totalOverdue})
              </h4>
              <div className="space-y-2">
                {overdueLabWork.map((lab) => (
                  <div 
                    key={lab.id}
                    className="p-3 rounded-xl border transition-colors bg-white/5 border-white/10 hover:bg-white/10"
                    data-testid={`card-overdue-${lab.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-medium text-white">
                            {lab.name}
                          </h4>
                          {lab.priority === 'urgent' && (
                            <span className="px-1.5 py-0.5 text-xs rounded border bg-red-500/20 border-red-500/40 text-red-300">
                              Urgent
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-white/60">
                          <div className="flex items-center gap-1 mb-0.5">
                            <Calendar className="w-3 h-3" />
                            <span>Last tested: {new Date(lab.lastTested).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span className="text-orange-300">
                              {lab.daysOverdue} day{lab.daysOverdue !== 1 ? 's' : ''} overdue
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {totalUpcoming > 0 && (
            <div className="pt-2">
              <h4 className="text-sm font-semibold mb-2 text-yellow-300">
                Coming Up Soon ({totalUpcoming})
              </h4>
              <p className="text-xs mb-3 text-yellow-300/70">
                Consider getting these done at the same time
              </p>
              <div className="space-y-2">
                {upcomingLabWork.map((lab) => (
                  <div 
                    key={lab.id}
                    className="p-3 rounded-xl border transition-colors bg-yellow-500/5 border-yellow-500/20 hover:bg-yellow-500/10"
                    data-testid={`card-upcoming-${lab.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h4 className="text-sm font-medium mb-1 text-white">
                          {lab.name}
                        </h4>
                        <div className="text-xs text-white/60">
                          <div className="flex items-center gap-1 mb-0.5">
                            <Calendar className="w-3 h-3" />
                            <span>Last tested: {new Date(lab.lastTested).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span className="text-yellow-300">
                              Due in {lab.daysUntilDue} day{lab.daysUntilDue !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleUploadResults();
            }}
            className="w-full py-3 px-4 rounded-xl font-medium transition-all bg-gradient-to-r from-orange-500 via-red-500 to-rose-500 text-white shadow-lg shadow-orange-500/30 hover:shadow-xl hover:shadow-orange-500/40"
            data-testid="button-upload-lab-results"
          >
            <div className="flex items-center justify-center gap-2">
              <Upload className="w-4 h-4" />
              <span className="text-sm">Upload New Lab Results</span>
            </div>
          </button>
          
          <p className="text-xs text-center text-orange-300/60">
            This reminder will disappear once you upload your latest results
          </p>
        </div>
      )}
    </div>
  );
}
