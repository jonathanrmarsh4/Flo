import { Download, CheckCircle, FileText, Activity, User, Database, ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { getApiBaseUrl, getAuthHeaders } from '@/lib/queryClient';

interface ExportDataScreenProps {
  isDark: boolean;
  onClose: () => void;
}

interface ExportStats {
  biomarkerReadings: number;
  aiInsights: number;
  actionPlans: number;
}

export function ExportDataScreen({ isDark, onClose }: ExportDataScreenProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data: stats } = useQuery<ExportStats>({
    queryKey: ['/api/user/export-stats'],
  });

  const handleExportCSV = async () => {
    setIsExporting(true);
    setExportComplete(false);
    setExportError(null);

    try {
      // Use getApiBaseUrl for iOS compatibility and getAuthHeaders for auth
      const baseUrl = getApiBaseUrl();
      const headers = await getAuthHeaders();
      
      console.log('Export request to:', baseUrl + '/api/user/export-csv');
      
      const response = await fetch(baseUrl + '/api/user/export-csv', {
        method: 'GET',
        credentials: 'include',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Export API error:', response.status, errorText);
        throw new Error(`Export failed: ${response.status}`);
      }

      const csvText = await response.text();
      const filename = `flo-health-data-${new Date().toISOString().split('T')[0]}.csv`;
      
      // Check if we're on a native platform (iOS/Android)
      if (Capacitor.isNativePlatform()) {
        try {
          // Write CSV to a temporary file using Capacitor Filesystem
          await Filesystem.writeFile({
            path: filename,
            data: csvText,
            directory: Directory.Cache,
            encoding: Encoding.UTF8,
          });
          
          // Get the proper file URI for sharing (required for iOS)
          const uriResult = await Filesystem.getUri({
            path: filename,
            directory: Directory.Cache,
          });
          const fileUri = uriResult.uri;
          
          console.log('Export file URI:', fileUri);
          
          // Use native share to let user save or share the file
          // Use 'files' array for better iOS compatibility
          await Share.share({
            title: 'Flō Health Data Export',
            dialogTitle: 'Save or Share Your Health Data',
            files: [fileUri],
          });
          
          setExportComplete(true);
          
          // Clean up the temp file after a delay
          setTimeout(async () => {
            try {
              await Filesystem.deleteFile({
                path: filename,
                directory: Directory.Cache,
              });
            } catch {
              // Ignore cleanup errors
            }
          }, 60000); // Keep file for 1 minute in case user needs it
          
        } catch (shareError: any) {
          // Log full error details for debugging
          console.error('Native share error details:', {
            message: shareError?.message,
            code: shareError?.code,
            name: shareError?.name,
            errorInfo: shareError?.errorInfo,
            stack: shareError?.stack,
            fullError: JSON.stringify(shareError, Object.getOwnPropertyNames(shareError || {})),
          });
          
          // User cancelled share - this is not an error
          if (shareError?.message?.includes('cancelled') || 
              shareError?.message?.includes('canceled') ||
              shareError?.code === 'CANCELED' ||
              shareError?.code === 'ERR_CANCELED') {
            console.log('Share cancelled by user');
            setExportComplete(true); // File was written successfully, user just cancelled share
          } else {
            throw shareError;
          }
        }
      } else {
        // Web browser: use traditional download approach
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        setExportComplete(true);
      }
      
      setTimeout(() => setExportComplete(false), 3000);
    } catch (error: any) {
      // Log full error details for debugging
      console.error('Export failed:', {
        message: error?.message,
        code: error?.code,
        name: error?.name,
        stack: error?.stack,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error || {})),
      });
      
      // Provide more helpful error message based on error type
      let errorMessage = 'Failed to export data. Please try again.';
      if (error?.message?.includes('network') || error?.message?.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (error?.message?.includes('permission')) {
        errorMessage = 'Permission denied. Please allow file access in Settings.';
      }
      
      setExportError(errorMessage);
      setTimeout(() => setExportError(null), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  const exportOptions = [
    {
      title: 'Biomarker Data',
      description: 'All your biomarker readings with dates, values, and categories',
      icon: Activity,
      records: stats?.biomarkerReadings ? `${stats.biomarkerReadings} readings` : 'Loading...',
      color: 'teal'
    },
    {
      title: 'Personal Information',
      description: 'Your profile details and account information',
      icon: User,
      records: 'Profile data',
      color: 'blue'
    },
    {
      title: 'Action Plans',
      description: 'Your active and completed health interventions',
      icon: CheckCircle,
      records: stats?.actionPlans ? `${stats.actionPlans} actions` : 'Loading...',
      color: 'purple'
    },
    {
      title: 'AI Insights History',
      description: 'All AI-generated insights and correlations',
      icon: Database,
      records: stats?.aiInsights ? `${stats.aiInsights} insights` : 'Loading...',
      color: 'cyan'
    }
  ];

  return (
    <div className={`fixed inset-0 z-50 overflow-hidden ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      {/* Header */}
      <div className={`sticky top-0 z-50 backdrop-blur-xl border-b pt-[env(safe-area-inset-top)] ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={onClose}
              className={`flex items-center gap-2 text-sm ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}
              data-testid="button-export-back"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-2">
              <Download className={`w-5 h-5 ${isDark ? 'text-teal-400' : 'text-teal-600'}`} />
              <h1 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>Export My Data</h1>
            </div>
            <div className="w-12" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="h-full overflow-y-auto pb-24">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Description */}
          <p className={`text-sm mb-8 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
            Download your complete Flo health data in CSV format for personal records or to share with healthcare providers.
          </p>

          {/* Main Export Card */}
          <div className={`rounded-2xl border p-8 mb-6 backdrop-blur-xl ${
            isDark 
              ? 'bg-white/5 border-white/10' 
              : 'bg-white/80 border-gray-200'
          }`}>
            <div className="text-center mb-6">
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 ${
                isDark 
                  ? 'bg-gradient-to-br from-teal-500/20 to-cyan-500/20 border border-teal-500/30' 
                  : 'bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200'
              }`}>
                <FileText className={`w-8 h-8 ${isDark ? 'text-teal-400' : 'text-teal-600'}`} />
              </div>
              <h3 className={`text-xl mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Complete Data Export
              </h3>
              <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                Export all your health data in a single CSV file
              </p>
            </div>

            {/* Export Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className={`p-4 rounded-xl text-center ${
                isDark ? 'bg-white/5' : 'bg-gray-50'
              }`}>
                <div className={`text-2xl mb-1 ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>
                  {stats?.biomarkerReadings ?? '-'}
                </div>
                <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  Biomarker Readings
                </div>
              </div>
              <div className={`p-4 rounded-xl text-center ${
                isDark ? 'bg-white/5' : 'bg-gray-50'
              }`}>
                <div className={`text-2xl mb-1 ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                  {stats?.aiInsights ?? '-'}
                </div>
                <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  AI Insights
                </div>
              </div>
              <div className={`p-4 rounded-xl text-center ${
                isDark ? 'bg-white/5' : 'bg-gray-50'
              }`}>
                <div className={`text-2xl mb-1 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                  {stats?.actionPlans ?? '-'}
                </div>
                <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  Action Plans
                </div>
              </div>
            </div>

            {/* Export Button */}
            <button
              onClick={handleExportCSV}
              disabled={isExporting}
              className={`w-full py-4 rounded-xl font-medium transition-all ${
                isExporting
                  ? isDark
                    ? 'bg-white/10 text-white/50 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : exportComplete
                    ? 'bg-gradient-to-r from-teal-500 to-green-500 text-white'
                    : 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 text-white hover:shadow-xl hover:scale-[1.02]'
              }`}
              data-testid="button-download-csv"
            >
              <div className="flex items-center justify-center gap-2">
                {isExporting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Preparing Export...
                  </>
                ) : exportComplete ? (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Export Complete!
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    Download CSV File
                  </>
                )}
              </div>
            </button>

            {exportComplete && (
              <div className={`mt-4 p-3 rounded-lg text-sm text-center ${
                isDark 
                  ? 'bg-teal-500/10 text-teal-300 border border-teal-500/30' 
                  : 'bg-teal-50 text-teal-700 border border-teal-200'
              }`}>
                Your data export is ready!
              </div>
            )}
            
            {exportError && (
              <div className={`mt-4 p-3 rounded-lg text-sm text-center ${
                isDark 
                  ? 'bg-red-500/10 text-red-300 border border-red-500/30' 
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {exportError}
              </div>
            )}
          </div>

          {/* What's Included Section */}
          <div className={`rounded-2xl border p-6 backdrop-blur-xl ${
            isDark 
              ? 'bg-white/5 border-white/10' 
              : 'bg-white/80 border-gray-200'
          }`}>
            <h4 className={`text-sm font-medium mb-4 ${isDark ? 'text-white/80' : 'text-gray-900'}`}>
              What's included in your export:
            </h4>
            <div className="space-y-3">
              {exportOptions.map((option, index) => {
                const Icon = option.icon;
                return (
                  <div 
                    key={index}
                    className={`flex items-start gap-3 p-3 rounded-lg ${
                      isDark ? 'bg-white/5' : 'bg-gray-50'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${
                      option.color === 'teal' ? (isDark ? 'bg-teal-500/20 text-teal-400' : 'bg-teal-100 text-teal-600') :
                      option.color === 'blue' ? (isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600') :
                      option.color === 'purple' ? (isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-600') :
                      (isDark ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-100 text-cyan-600')
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <div className={`text-sm font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {option.title}
                      </div>
                      <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                        {option.description}
                      </div>
                    </div>
                    <div className={`text-xs px-2 py-1 rounded ${
                      isDark ? 'bg-white/10 text-white/60' : 'bg-white text-gray-600'
                    }`}>
                      {option.records}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Privacy Notice */}
          <div className={`mt-6 p-4 rounded-xl border ${
            isDark 
              ? 'bg-blue-500/5 border-blue-500/20 text-blue-300' 
              : 'bg-blue-50 border-blue-200 text-blue-700'
          }`}>
            <div className="flex items-start gap-3">
              <Database className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <strong>Your data, your control.</strong> This export includes all personal health data stored in Flo. 
                Keep this file secure and only share with trusted healthcare providers.
              </div>
            </div>
          </div>

          {/* File Format Info */}
          <div className={`mt-4 text-xs text-center ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
            CSV files can be opened with Excel, Google Sheets, or any spreadsheet application
          </div>
        </div>
      </div>
    </div>
  );
}
