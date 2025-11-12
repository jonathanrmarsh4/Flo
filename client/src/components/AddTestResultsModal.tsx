import { useState } from 'react';
import { X, Edit, Upload as UploadIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALL_BIOMARKERS, type BiomarkerOption } from '@/lib/biomarker-config';

interface AddTestResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddTestResultsModal({ isOpen, onClose }: AddTestResultsModalProps) {
  const [activeTab, setActiveTab] = useState<'manual' | 'upload'>('manual');
  const [selectedBiomarker, setSelectedBiomarker] = useState('');
  const [value, setValue] = useState('');
  const [testDate, setTestDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const handleSubmit = () => {
    // TODO: Implement submission logic
    console.log({
      biomarker: selectedBiomarker,
      value,
      testDate,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#0a0e1f] border border-white/10 text-white max-w-md mx-auto p-0 gap-0 rounded-3xl overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-medium text-white">
              Add Test Results
            </DialogTitle>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors"
              data-testid="button-close-modal"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
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
                <Select value={selectedBiomarker} onValueChange={setSelectedBiomarker}>
                  <SelectTrigger
                    className="w-full bg-white/5 border-white/10 text-white rounded-xl h-12"
                    data-testid="select-biomarker"
                  >
                    <SelectValue placeholder="Select biomarker..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1f3a] border-white/10 text-white max-h-[300px]">
                    {ALL_BIOMARKERS.map((biomarker: BiomarkerOption) => (
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
              </div>

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
