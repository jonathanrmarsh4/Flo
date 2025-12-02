import { FileText, Brain, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface MedicalDocument {
  id: string;
  documentType: string;
  title: string;
  status: string;
  createdAt: string;
  metadata?: {
    providerName?: string;
    facilityName?: string;
  };
}

interface SpecialistReportsTileProps {
  isDark: boolean;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  'cardiology_report': 'Cardiology',
  'radiology_report': 'Radiology',
  'pathology_report': 'Pathology',
  'neurology_report': 'Neurology',
  'endocrinology_report': 'Endocrinology',
  'gastroenterology_report': 'Gastroenterology',
  'pulmonology_report': 'Pulmonology',
  'nephrology_report': 'Nephrology',
  'rheumatology_report': 'Rheumatology',
  'dermatology_report': 'Dermatology',
  'ophthalmology_report': 'Ophthalmology',
  'oncology_report': 'Oncology',
  'hematology_report': 'Hematology',
  'immunology_report': 'Immunology',
  'genetic_test': 'Genetic Test',
  'sleep_study': 'Sleep Study',
  'stress_test': 'Stress Test',
  'echocardiogram': 'Echocardiogram',
  'colonoscopy': 'Colonoscopy',
  'endoscopy': 'Endoscopy',
  'biopsy_report': 'Biopsy',
  'surgical_report': 'Surgical',
  'discharge_summary': 'Discharge Summary',
  'consultation_note': 'Consultation',
  'other': 'Other',
};

export function SpecialistReportsTile({ isDark }: SpecialistReportsTileProps) {
  const { data, isLoading } = useQuery<{ documents: MedicalDocument[] }>({
    queryKey: ['/api/medical-documents'],
  });

  const documents = data?.documents?.filter(d => d.status === 'processed') || [];

  if (isLoading) {
    return (
      <div className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
        isDark 
          ? 'bg-gradient-to-br from-slate-800/80 via-slate-900/80 to-slate-800/80 border-white/10' 
          : 'bg-gradient-to-br from-white/80 to-gray-50/80 border-black/10'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${isDark ? 'bg-white/10' : 'bg-black/5'}`}>
            <FileText className={`w-5 h-5 ${isDark ? 'text-white/60' : 'text-gray-500'}`} />
          </div>
          <div className="animate-pulse">
            <div className={`h-4 w-32 rounded ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
          </div>
        </div>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className={`backdrop-blur-xl rounded-3xl border p-5 transition-all opacity-60 ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isDark ? 'bg-white/10' : 'bg-black/5'}`}>
              <FileText className={`w-5 h-5 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
            </div>
            <div>
              <h3 className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                Specialist Reports
              </h3>
              <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                No reports uploaded yet
              </p>
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs ${
            isDark ? 'bg-white/10 text-white/60' : 'bg-gray-200 text-gray-600'
          }`}>
            Upload via +
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
      isDark 
        ? 'bg-gradient-to-br from-slate-800/80 via-slate-900/80 to-slate-800/80 border-white/10' 
        : 'bg-gradient-to-br from-white/80 to-gray-50/80 border-black/10'
    }`}
    data-testid="tile-specialist-reports"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${
            isDark ? 'bg-emerald-500/20' : 'bg-emerald-100'
          }`}>
            <FileText className={`w-5 h-5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
          </div>
          <div>
            <h3 className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Specialist Reports
            </h3>
            <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              {documents.length} report{documents.length !== 1 ? 's' : ''} in AI memory
            </p>
          </div>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
          isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
        }`}>
          <Brain className="w-3 h-3" />
          <span>AI Ready</span>
        </div>
      </div>

      <div className="space-y-2">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
              isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'
            }`}
            data-testid={`report-item-${doc.id}`}
          >
            <div className="flex-1 min-w-0">
              <p className={`text-sm truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {doc.title || 'Untitled Report'}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  {DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}
                </span>
                <span className={`text-xs ${isDark ? 'text-white/30' : 'text-gray-400'}`}>•</span>
                <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                  {new Date(doc.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </span>
              </div>
            </div>
            <ChevronRight className={`w-4 h-4 flex-shrink-0 ${
              isDark ? 'text-white/30' : 'text-gray-400'
            }`} />
          </div>
        ))}
      </div>

      <p className={`text-xs mt-4 text-center ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
        Ask Flō Oracle about any of these reports
      </p>
    </div>
  );
}
