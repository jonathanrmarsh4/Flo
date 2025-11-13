import { useState, useMemo, useEffect, useRef } from 'react';
import { Edit, Upload as UploadIcon, FileText, CheckCircle2, XCircle, Loader2, AlertCircle, Check, ChevronsUpDown, ChevronDown, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface Biomarker {
  id: string;
  name: string;
  canonicalUnit: string;
  category: string;
  description?: string;
}

interface BiomarkerUnit {
  unit: string;
  isCanonical: boolean;
}

interface ReferenceRange {
  low: number;
  high: number;
  unit: string;
  criticalLow?: number;
  criticalHigh?: number;
}

interface AddTestResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddTestResultsModal({ isOpen, onClose }: AddTestResultsModalProps) {
  const [activeTab, setActiveTab] = useState<'manual' | 'upload'>('manual');
  const [selectedBiomarker, setSelectedBiomarker] = useState('');
  const [biomarkerComboboxOpen, setBiomarkerComboboxOpen] = useState(false);
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [testDate, setTestDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // Upload tab state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<any>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [showFailedBiomarkers, setShowFailedBiomarkers] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch all biomarkers
  const { data: biomarkers = [], isLoading: biomarkersLoading } = useQuery<Biomarker[]>({
    queryKey: ['/api/biomarkers'],
    enabled: isOpen,
    select: (data: any) => data.biomarkers || [],
  });

  // Fetch units for selected biomarker
  const { data: availableUnits = [], isLoading: unitsLoading } = useQuery<BiomarkerUnit[]>({
    queryKey: ['/api/biomarkers', selectedBiomarker, 'units'],
    enabled: !!selectedBiomarker,
    select: (data: any) => data.units || [],
  });

  // Fetch reference range for selected biomarker with user context
  const { data: referenceRange } = useQuery<ReferenceRange>({
    queryKey: ['/api/biomarkers', selectedBiomarker, 'reference-range'],
    enabled: !!selectedBiomarker && !!unit,
  });

  // Get selected biomarker details
  const selectedBiomarkerData = useMemo(() => {
    if (!selectedBiomarker) return null;
    const biomarker = biomarkers.find(b => b.id === selectedBiomarker);
    return biomarker || null;
  }, [selectedBiomarker, biomarkers]);

  // Update unit when biomarker is selected
  const handleBiomarkerChange = (biomarkerId: string) => {
    setSelectedBiomarker(biomarkerId);
    setValue('');
    setUnit('');
  };

  // Set canonical unit when units are loaded
  useEffect(() => {
    if (availableUnits.length > 0 && !unit) {
      const canonicalUnit = availableUnits.find(u => u.isCanonical);
      if (canonicalUnit) {
        setUnit(canonicalUnit.unit);
      }
    }
  }, [availableUnits, unit]);

  const handleSubmit = async () => {
    if (!selectedBiomarkerData || !value || !unit) return;

    try {
      const numericValue = parseFloat(value);
      if (isNaN(numericValue)) {
        console.error("Invalid numeric value");
        return;
      }

      const response = await apiRequest("POST", "/api/measurements", {
        biomarkerId: selectedBiomarker,
        value: numericValue,
        unit: unit,
        testDate: new Date(testDate).toISOString(),
      });

      if (!response.ok) {
        console.error("Failed to save measurement");
        return;
      }

      const result = await response.json();
      
      console.log({
        session: result.session,
        measurement: result.measurement,
        normalized: result.normalized,
      });

      queryClient.invalidateQueries({ queryKey: ['/api/measurements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/blood-work'] });
      queryClient.invalidateQueries({ queryKey: ['/api/biomarker-sessions'] });

      onClose();
    } catch (error) {
      console.error("Error submitting test result:", error);
    }
  };

  // File upload handlers
  const handleFileSelect = (file: File) => {
    if (file.type === 'application/pdf') {
      setSelectedFile(file);
      setJobError(null);
    } else {
      setJobError('Please select a PDF file');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(10);
    setJobError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/labs/upload', {
        method: 'POST',
        body: formData,
      });

      setUploadProgress(30);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();
      setJobId(result.jobId);
      setJobStatus('pending');
      setUploadProgress(50);

      // Start polling for status
      startPolling(result.jobId);
    } catch (error: any) {
      console.error('Upload error:', error);
      setJobError(error.message || 'Failed to upload file');
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const startPolling = (id: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/labs/status/${id}`);
        if (!response.ok) {
          throw new Error('Failed to get job status');
        }

        const data = await response.json();
        setJobStatus(data.status);

        if (data.status === 'processing') {
          setUploadProgress(70);
        }

        if (data.status === 'completed' || data.status === 'needs_review') {
          setUploadProgress(100);
          setJobResult(data.result);
          setUploading(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }
          
          // Invalidate queries to refresh data
          queryClient.invalidateQueries({ queryKey: ['/api/measurements'] });
          queryClient.invalidateQueries({ queryKey: ['/api/blood-work'] });
          queryClient.invalidateQueries({ queryKey: ['/api/biomarker-sessions'] });
        } else if (data.status === 'failed') {
          setJobError(data.error?.error || 'Processing failed');
          setUploading(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }
        }
      } catch (error: any) {
        console.error('Polling error:', error);
        setJobError(error.message || 'Failed to check status');
        setUploading(false);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      }
    };

    // Poll immediately, then every 2 seconds
    poll();
    pollingIntervalRef.current = setInterval(poll, 2000);
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setUploading(false);
    setUploadProgress(0);
    setJobId(null);
    setJobStatus(null);
    setJobResult(null);
    setJobError(null);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Reset upload state when modal closes
  useEffect(() => {
    if (!isOpen) {
      resetUpload();
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#0a0e1f] border border-white/10 text-white max-w-md mx-auto p-0 gap-0 rounded-3xl overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-5 border-b border-white/10">
          <DialogTitle className="text-2xl font-medium text-white">
            Add Test Results
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-2 px-6 pt-6">
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'manual'
                ? 'bg-gradient-to-r from-[#00d4aa] via-[#00a8ff] to-[#0066ff] text-white'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
            data-testid="tab-manual-entry"
          >
            <Edit className="w-4 h-4" />
            Manual Entry
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'upload'
                ? 'bg-gradient-to-r from-[#00d4aa] via-[#00a8ff] to-[#0066ff] text-white'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
            data-testid="tab-upload"
          >
            <UploadIcon className="w-4 h-4" />
            Upload
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {activeTab === 'manual' ? (
            <>
              {/* Biomarker Combobox with Search */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">
                  Biomarker
                </label>
                <Popover open={biomarkerComboboxOpen} onOpenChange={setBiomarkerComboboxOpen}>
                  <PopoverTrigger asChild>
                    <div
                      role="combobox"
                      aria-expanded={biomarkerComboboxOpen}
                      className="w-full bg-white/5 border border-white/10 text-white rounded-xl h-12 px-3 flex items-center justify-between cursor-pointer hover-elevate active-elevate-2"
                      data-testid="select-biomarker"
                      onClick={() => setBiomarkerComboboxOpen(!biomarkerComboboxOpen)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setBiomarkerComboboxOpen(!biomarkerComboboxOpen);
                        }
                      }}
                      tabIndex={0}
                    >
                      <span className={selectedBiomarker ? "text-white" : "text-white/50"}>
                        {selectedBiomarker
                          ? biomarkers.find((b) => b.id === selectedBiomarker)?.name
                          : (biomarkersLoading ? "Loading..." : "Search biomarker...")}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-[#1a1f3a] border-white/10" align="start">
                    <Command className="bg-[#1a1f3a] text-white">
                      <CommandInput 
                        placeholder="Type to search biomarkers..." 
                        className="text-white placeholder:text-white/40"
                      />
                      <CommandList>
                        <CommandEmpty className="text-white/60">No biomarker found.</CommandEmpty>
                        <CommandGroup>
                          {biomarkers.map((biomarker) => (
                            <CommandItem
                              key={biomarker.id}
                              value={biomarker.name}
                              onSelect={() => {
                                handleBiomarkerChange(biomarker.id);
                                setBiomarkerComboboxOpen(false);
                              }}
                              className="text-white hover:bg-white/10"
                              data-testid={`option-biomarker-${biomarker.id}`}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedBiomarker === biomarker.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {biomarker.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Value Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">
                  Value
                </label>
                <Input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Enter value"
                  className="w-full bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl h-12"
                  data-testid="input-value"
                />
                {/* Optimal Range - shown when reference range is loaded */}
                {referenceRange && (
                  <p className="text-xs text-white/40 mt-1" data-testid="text-optimal-range">
                    Optimal range: {referenceRange.low} - {referenceRange.high} {referenceRange.unit}
                  </p>
                )}
              </div>

              {/* Unit of Measure - shown when units are loaded */}
              {availableUnits.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/70">
                    Unit of Measure
                  </label>
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger
                      className="w-full bg-white/5 border-cyan-500/50 text-white rounded-xl h-12"
                      data-testid="select-unit"
                    >
                      <SelectValue placeholder={unitsLoading ? "Loading..." : "Select unit..."} />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1f3a] border-white/10 text-white">
                      {availableUnits.map((unitOption) => (
                        <SelectItem
                          key={unitOption.unit}
                          value={unitOption.unit}
                          className="text-white hover:bg-white/10"
                          data-testid={`option-unit-${unitOption.unit}`}
                        >
                          {unitOption.unit}{unitOption.isCanonical ? ' (default)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Test Date */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">
                  Test Date
                </label>
                <div className="relative">
                  <Input
                    type="date"
                    value={testDate}
                    onChange={(e) => setTestDate(e.target.value)}
                    className="w-full bg-white/5 border-white/10 text-white rounded-xl h-12 [&::-webkit-calendar-picker-indicator]:invert"
                    data-testid="input-test-date"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {!jobResult ? (
                <>
                  {/* Upload Zone */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                      isDragging
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-white/20 bg-white/5 hover:border-white/30'
                    }`}
                    data-testid="dropzone-upload"
                  >
                    {!selectedFile ? (
                      <>
                        <FileText className="w-12 h-12 mx-auto mb-4 text-white/40" />
                        <p className="text-white/70 mb-2">
                          Drag and drop your lab report here
                        </p>
                        <p className="text-white/40 text-sm mb-4">or</p>
                        <Button
                          onClick={() => fileInputRef.current?.click()}
                          variant="outline"
                          className="bg-white/10 text-white border-white/20 hover:bg-white/20"
                          data-testid="button-choose-file"
                        >
                          Choose PDF File
                        </Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="application/pdf"
                          onChange={handleFileInputChange}
                          className="hidden"
                          data-testid="input-file"
                        />
                        <p className="text-white/30 text-xs mt-4">
                          PDF files only, max 10MB
                        </p>
                      </>
                    ) : (
                      <>
                        <FileText className="w-12 h-12 mx-auto mb-4 text-cyan-400" />
                        <p className="text-white font-medium mb-1">{selectedFile.name}</p>
                        <p className="text-white/40 text-sm mb-4">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </p>
                        <Button
                          onClick={resetUpload}
                          variant="ghost"
                          className="text-white/60 hover:text-white"
                          disabled={uploading}
                          data-testid="button-reset-file"
                        >
                          Choose different file
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Upload Progress */}
                  {uploading && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/70">
                          {jobStatus === 'pending' && 'Uploading...'}
                          {jobStatus === 'processing' && 'Processing with AI...'}
                        </span>
                        <span className="text-white/40">{uploadProgress}%</span>
                      </div>
                      <Progress value={uploadProgress} className="h-2" />
                      <div className="flex items-center gap-2 text-xs text-white/40">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>This may take 10-30 seconds</span>
                      </div>
                    </div>
                  )}

                  {/* Upload Error */}
                  {jobError && (
                    <div className="flex items-start gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                      <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-red-400 text-sm font-medium">Upload failed</p>
                        <p className="text-red-400/70 text-xs mt-1">{jobError}</p>
                      </div>
                    </div>
                  )}

                  {/* Upload Button */}
                  {selectedFile && !uploading && !jobResult && (
                    <Button
                      onClick={handleUpload}
                      disabled={!selectedFile || uploading}
                      className="w-full bg-gradient-to-r from-[#00d4aa] via-[#00a8ff] to-[#0066ff] text-white rounded-xl h-12 text-base font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                      data-testid="button-upload"
                    >
                      <UploadIcon className="w-4 h-4 mr-2" />
                      Upload & Process
                    </Button>
                  )}
                </>
              ) : (
                /* Success Results */
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                    <CheckCircle2 className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-green-400 font-medium mb-1">
                        {jobStatus === 'needs_review' ? 'Partial extraction complete' : 'Extraction complete'}
                      </p>
                      <p className="text-white/70 text-sm">
                        {jobResult.successfulBiomarkers?.length || 0} biomarkers extracted successfully
                      </p>
                      {jobStatus === 'needs_review' && jobResult.failedBiomarkers?.length > 0 && (
                        <p className="text-yellow-400/70 text-xs mt-2">
                          {jobResult.failedBiomarkers.length} biomarkers could not be processed
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Extracted Biomarkers List */}
                  {jobResult.successfulBiomarkers && jobResult.successfulBiomarkers.length > 0 && (
                    <div className="bg-white/5 rounded-xl p-4">
                      <p className="text-white/70 text-sm mb-3">Extracted biomarkers:</p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {jobResult.successfulBiomarkers.map((name: string, index: number) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 text-sm text-white/90 bg-white/5 rounded-lg px-3 py-2"
                            data-testid={`biomarker-item-${index}`}
                          >
                            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                            <span>{name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <Button
                      onClick={resetUpload}
                      variant="outline"
                      className="flex-1 bg-white/10 text-white border-white/20 hover:bg-white/20"
                      data-testid="button-upload-another"
                    >
                      Upload Another
                    </Button>
                    <Button
                      onClick={onClose}
                      className="flex-1 bg-gradient-to-r from-[#00d4aa] via-[#00a8ff] to-[#0066ff] text-white hover:opacity-90"
                      data-testid="button-done"
                    >
                      Done
                    </Button>
                  </div>

                  {/* Failed Biomarkers Details */}
                  {jobStatus === 'needs_review' && jobResult.failedBiomarkers?.length > 0 && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl overflow-hidden">
                      {/* Header - Clickable to expand/collapse */}
                      <button
                        onClick={() => setShowFailedBiomarkers(!showFailedBiomarkers)}
                        className="w-full flex items-center justify-between p-3 hover-elevate active-elevate-2"
                        data-testid="button-toggle-failed-biomarkers"
                      >
                        <div className="flex items-start gap-2 flex-1">
                          <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                          <div className="text-left">
                            <p className="text-yellow-400 text-sm font-medium">
                              {jobResult.failedBiomarkers.length} biomarker{jobResult.failedBiomarkers.length > 1 ? 's' : ''} couldn't be processed
                            </p>
                            <p className="text-yellow-400/70 text-xs mt-1">
                              Click to see details
                            </p>
                          </div>
                        </div>
                        {showFailedBiomarkers ? (
                          <ChevronDown className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                        )}
                      </button>

                      {/* Expanded Details */}
                      {showFailedBiomarkers && (
                        <div className="border-t border-yellow-500/20 p-3 bg-yellow-500/5">
                          <p className="text-yellow-400/70 text-xs mb-3">
                            The AI extracted these biomarkers but couldn't match them to our database. You can add them manually if needed.
                          </p>
                          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                            {jobResult.failedBiomarkers.map((failed: { name: string; error: string }, index: number) => (
                              <div
                                key={index}
                                className="bg-white/5 rounded-lg p-3 space-y-1"
                                data-testid={`failed-biomarker-${index}`}
                              >
                                <div className="flex items-start gap-2">
                                  <XCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                                  <div className="flex-1">
                                    <p className="text-white font-medium text-sm">{failed.name}</p>
                                    <p className="text-yellow-400/60 text-xs mt-1 leading-relaxed">
                                      {failed.error}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Add Result Button */}
        {activeTab === 'manual' && (
          <div className="px-6 pb-6">
            <Button
              onClick={handleSubmit}
              disabled={!selectedBiomarker || !value}
              className="w-full bg-gradient-to-r from-[#00d4aa] via-[#00a8ff] to-[#0066ff] text-white rounded-xl h-12 text-base font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              data-testid="button-add-result"
            >
              Add Result
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
