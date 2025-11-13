import { useState, useMemo, useEffect } from 'react';
import { Edit, Upload as UploadIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

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
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [testDate, setTestDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

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
              {/* Biomarker Select */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">
                  Biomarker
                </label>
                <Select value={selectedBiomarker} onValueChange={handleBiomarkerChange}>
                  <SelectTrigger
                    className="w-full bg-white/5 border-white/10 text-white rounded-xl h-12"
                    data-testid="select-biomarker"
                  >
                    <SelectValue placeholder={biomarkersLoading ? "Loading..." : "Select biomarker..."} />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1f3a] border-white/10 text-white max-h-[300px]">
                    {biomarkers.map((biomarker) => (
                      <SelectItem
                        key={biomarker.id}
                        value={biomarker.id}
                        className="text-white hover:bg-white/10"
                        data-testid={`option-biomarker-${biomarker.id}`}
                      >
                        {biomarker.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <div className="py-12 text-center">
              <UploadIcon className="w-12 h-12 mx-auto mb-4 text-white/40" />
              <p className="text-white/60 text-sm">
                Upload functionality coming soon
              </p>
            </div>
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
