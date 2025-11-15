import { useState } from 'react';
import { X, Upload, AlertCircle, CheckCircle, FileText } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { getAuthHeaders, getApiBaseUrl, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface UnifiedUploadModalProps {
  isDark: boolean;
  onClose: () => void;
  initialMode?: 'lab-results' | 'diagnostics';
}

type UploadMode = 'lab-results' | 'diagnostics';

export function UnifiedUploadModal({ isDark, onClose, initialMode = 'lab-results' }: UnifiedUploadModalProps) {
  const [mode, setMode] = useState<UploadMode>(initialMode);
  const [file, setFile] = useState<File | null>(null);
  const [useExperimental, setUseExperimental] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const bloodWorkUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const uploadRes = await apiRequest("POST", "/api/objects/upload", {});
      const { uploadURL, objectPath } = await uploadRes.json();

      setUploadProgress(0);
      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file");
      }

      setUploadProgress(100);

      const analyzeRes = await apiRequest("POST", "/api/blood-work/analyze", {
        fileUrl: objectPath,
        fileName: file.name,
      });
      return await analyzeRes.json();
    },
    onSuccess: () => {
      setUploadProgress(null);
      queryClient.invalidateQueries({ queryKey: ["/api/blood-work"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blood-work/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/biomarker-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/biomarkers"] });
      toast({
        title: "Analysis Complete",
        description: "Your blood work has been analyzed successfully!",
      });
      setTimeout(() => onClose(), 2000);
    },
    onError: (error) => {
      setUploadProgress(null);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload and analyze blood work",
        variant: "destructive",
      });
    },
  });

  const calciumScoreUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const endpoint = useExperimental 
        ? '/api/diagnostics/calcium-score/upload-experimental'
        : '/api/diagnostics/calcium-score/upload';
      
      const baseUrl = getApiBaseUrl();
      const fullUrl = baseUrl + endpoint;
      const headers = await getAuthHeaders();
      
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers,
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/diagnostics/summary'] });
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          query.queryKey[0] === '/api/diagnostics/calcium-score' ||
          (typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/diagnostics'))
      });
      toast({
        title: "Upload Complete",
        description: "Your calcium score has been processed successfully!",
      });
      setTimeout(() => onClose(), 2000);
    },
    onError: (error) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload calcium score",
        variant: "destructive",
      });
    },
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf' || droppedFile.type.startsWith('image/')) {
        setFile(droppedFile);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (file) {
      if (mode === 'lab-results') {
        bloodWorkUploadMutation.mutate(file);
      } else {
        calciumScoreUploadMutation.mutate(file);
      }
    }
  };

  const isUploading = bloodWorkUploadMutation.isPending || calciumScoreUploadMutation.isPending;
  const uploadSuccess = bloodWorkUploadMutation.isSuccess || calciumScoreUploadMutation.isSuccess;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div 
        className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border overflow-hidden ${
          isDark ? 'bg-slate-900/95 border-white/10' : 'bg-white border-black/10'
        }`}
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${
          isDark ? 'border-white/10' : 'border-black/10'
        }`}>
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Upload Health Data
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
            }`}
            data-testid="button-close-upload"
          >
            <X className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-700'}`} />
          </button>
        </div>

        {/* Mode Selector - Segmented Control */}
        <div className="p-6 pb-4">
          <div className={`inline-flex w-full rounded-2xl p-1 ${
            isDark ? 'bg-white/5' : 'bg-gray-100'
          }`}>
            <button
              onClick={() => setMode('lab-results')}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all min-h-[44px] ${
                mode === 'lab-results'
                  ? isDark
                    ? 'bg-white/10 text-white shadow-lg'
                    : 'bg-white text-gray-900 shadow-lg'
                  : isDark
                    ? 'text-white/50 hover:text-white/70'
                    : 'text-gray-500 hover:text-gray-700'
              }`}
              data-testid="tab-lab-results"
            >
              Lab Results
            </button>
            <button
              onClick={() => setMode('diagnostics')}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all min-h-[44px] ${
                mode === 'diagnostics'
                  ? isDark
                    ? 'bg-white/10 text-white shadow-lg'
                    : 'bg-white text-gray-900 shadow-lg'
                  : isDark
                    ? 'text-white/50 hover:text-white/70'
                    : 'text-gray-500 hover:text-gray-700'
              }`}
              data-testid="tab-diagnostics"
            >
              Diagnostics
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-6 pb-6" style={{ maxHeight: 'calc(90vh - 180px)' }}>
          {/* Experimental Toggle - Only for Diagnostics */}
          {mode === 'diagnostics' && (
            <div className={`mb-4 p-4 rounded-2xl border ${
              isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
            }`}>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Experimental Mode
                  </div>
                  <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Uses OCR + GPT-5 for scanned PDFs
                  </div>
                </div>
                <Switch
                  checked={useExperimental}
                  onCheckedChange={setUseExperimental}
                  data-testid="switch-experimental"
                />
              </label>
            </div>
          )}

          {/* Upload Area */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
              dragActive
                ? isDark
                  ? 'border-cyan-400 bg-cyan-500/10'
                  : 'border-cyan-600 bg-cyan-50'
                : isDark
                  ? 'border-white/20 hover:border-white/30'
                  : 'border-gray-300 hover:border-gray-400'
            }`}
            data-testid="dropzone-upload"
          >
            <input
              type="file"
              onChange={handleFileChange}
              accept={mode === 'diagnostics' ? '.pdf' : '.pdf,image/*'}
              className="hidden"
              id="file-upload"
              data-testid="input-file"
            />

            {uploadSuccess ? (
              <div className="space-y-4">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${
                  isDark ? 'bg-green-500/20' : 'bg-green-100'
                }`}>
                  <CheckCircle className={`w-8 h-8 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                </div>
                <div>
                  <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Upload Successful!
                  </p>
                  <p className={`text-xs mt-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    {mode === 'lab-results' ? 'Analysis complete' : 'Processing complete'}
                  </p>
                </div>
              </div>
            ) : isUploading ? (
              <div className="space-y-4">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${
                  isDark ? 'bg-cyan-500/20' : 'bg-cyan-100'
                }`}>
                  <Upload className={`w-8 h-8 ${isDark ? 'text-cyan-400' : 'text-cyan-600'} animate-pulse`} />
                </div>
                <div>
                  <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {uploadProgress !== null && uploadProgress < 100 ? 'Uploading...' : 'Analyzing...'}
                  </p>
                  <p className={`text-xs mt-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Please wait...
                  </p>
                </div>
              </div>
            ) : file ? (
              <div className="space-y-4">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${
                  isDark ? 'bg-cyan-500/20' : 'bg-cyan-100'
                }`}>
                  <FileText className={`w-8 h-8 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                </div>
                <div>
                  <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {file.name}
                  </p>
                  <p className={`text-xs mt-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className={`text-xs ${isDark ? 'text-cyan-400' : 'text-cyan-600'} hover:underline`}
                  data-testid="button-clear-file"
                >
                  Choose different file
                </button>
              </div>
            ) : (
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
                  isDark ? 'bg-cyan-500/20' : 'bg-cyan-100'
                }`}>
                  <Upload className={`w-8 h-8 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                </div>
                <p className={`text-sm font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Click to upload or drag and drop
                </p>
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  {mode === 'diagnostics' ? 'PDF files only' : 'PDF or image files up to 10MB'}
                </p>
              </label>
            )}
          </div>

          {/* Description */}
          <div className={`mt-4 p-4 rounded-2xl ${
            isDark ? 'bg-white/5' : 'bg-gray-50'
          }`}>
            <p className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
              {mode === 'lab-results' 
                ? 'Upload your blood work PDF and our AI will automatically extract and analyze your biomarkers, calculate your biological age, and provide personalized health insights.'
                : 'Upload your coronary calcium score (CAC) report PDF. Our AI will extract your Agatston score, risk category, and vessel-specific measurements.'}
            </p>
          </div>

          {/* Upload Button */}
          {file && !isUploading && !uploadSuccess && (
            <button
              onClick={handleUpload}
              className={`w-full mt-4 py-4 rounded-2xl font-medium transition-all min-h-[44px] ${
                isDark
                  ? 'bg-cyan-500 hover:bg-cyan-600 text-white'
                  : 'bg-cyan-600 hover:bg-cyan-700 text-white'
              }`}
              data-testid="button-upload"
            >
              Upload & Analyze
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
