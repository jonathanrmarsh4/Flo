import { useState } from 'react';
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FloBottomNav } from "@/components/FloBottomNav";
import { FloLogo } from "@/components/FloLogo";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Edit2, Trash2, Check, X, Sparkles, Moon, Sun } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { BiomarkerMeasurement } from "@shared/schema";

export default function MeasurementHistory() {
  const { toast } = useToast();
  const [selectedBiomarkerId, setSelectedBiomarkerId] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(true);

  // Fetch all biomarkers
  const { data: biomarkersData } = useQuery<any>({
    queryKey: ['/api/biomarkers'],
  });

  const biomarkers = biomarkersData?.biomarkers || [];

  // Fetch measurement history for selected biomarker
  const { data: measurementsData, isLoading: measurementsLoading } = useQuery<any>({
    queryKey: ['/api/measurements', { biomarkerId: selectedBiomarkerId }],
    queryFn: async () => {
      // Use apiRequest helper which handles iOS URLs and auth automatically
      const response = await apiRequest('GET', `/api/measurements?biomarkerId=${selectedBiomarkerId}`);
      return response.json();
    },
    enabled: !!selectedBiomarkerId,
  });

  const measurements: BiomarkerMeasurement[] = measurementsData?.measurements || [];

  // Update measurement mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, valueRaw, unitRaw }: { id: string; valueRaw: number; unitRaw: string }) => {
      const response = await apiRequest('PATCH', `/api/measurements/${id}`, { valueRaw, unitRaw });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/measurements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/biomarker-sessions'] });
      toast({
        title: "Measurement updated",
        description: "The measurement has been successfully updated.",
      });
      setEditingId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update measurement",
        variant: "destructive",
      });
    },
  });

  // Delete measurement mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/measurements/${id}`);
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/measurements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/biomarker-sessions'] });
      toast({
        title: "Measurement deleted",
        description: "The measurement has been successfully deleted.",
      });
      setDeleteId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete measurement",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (measurement: BiomarkerMeasurement) => {
    setEditingId(measurement.id);
    setEditValue(String(measurement.valueRaw));
    setEditUnit(measurement.unitRaw);
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    const value = parseFloat(editValue);
    if (isNaN(value)) {
      toast({
        title: "Invalid value",
        description: "Please enter a valid number",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate({
      id: editingId,
      valueRaw: value,
      unitRaw: editUnit,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue("");
    setEditUnit("");
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId);
    }
  };

  const selectedBiomarker = biomarkers.find((b: any) => b.id === selectedBiomarkerId);

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'ai_extracted':
        return <Badge variant="secondary" className="gap-1"><Sparkles className="w-3 h-3" />AI Extracted</Badge>;
      case 'manual':
        return <Badge variant="outline">Manual</Badge>;
      case 'corrected':
        return <Badge variant="default">Corrected</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className={`min-h-screen pb-20 transition-colors ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      {/* Header */}
      <header className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-colors ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/">
                <button 
                  className={`p-2 rounded-lg transition-colors ${
                    isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                  }`}
                  data-testid="button-back"
                >
                  <ArrowLeft className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
                </button>
              </Link>
              <FloLogo size={28} showText={true} className={isDark ? 'text-white' : 'text-gray-900'} />
            </div>
            <button 
              onClick={() => setIsDark(!isDark)}
              className={`p-2 rounded-lg transition-colors ${
                isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
              }`}
              data-testid="button-theme-toggle"
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-white/70" />
              ) : (
                <Moon className="w-4 h-4 text-gray-600" />
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="px-3 py-4 max-w-2xl mx-auto space-y-4">
        {/* Page Title Section */}
        <div className={`backdrop-blur-xl rounded-2xl border px-6 py-4 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`}>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Measurement History
          </h1>
          <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
            View and edit your biomarker measurements
          </p>
        </div>
        {/* Biomarker Selector */}
        <div className={`backdrop-blur-xl rounded-2xl border p-4 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`}>
          <label className={`text-sm font-medium mb-2 block ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Select Biomarker
          </label>
          <Select value={selectedBiomarkerId} onValueChange={setSelectedBiomarkerId}>
            <SelectTrigger data-testid="select-biomarker" className={isDark ? 'bg-white/10 border-white/20 text-white' : ''}>
              <SelectValue placeholder="Choose a biomarker..." />
            </SelectTrigger>
            <SelectContent>
              {biomarkers.map((biomarker: any) => (
                <SelectItem key={biomarker.id} value={biomarker.id} data-testid={`option-biomarker-${biomarker.id}`}>
                  {biomarker.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Measurements List */}
        {selectedBiomarkerId && (
          <div className="space-y-4">
            {measurementsLoading ? (
              <>
                <div className={`backdrop-blur-xl rounded-2xl border h-28 ${isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'} animate-pulse`} />
                <div className={`backdrop-blur-xl rounded-2xl border h-28 ${isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'} animate-pulse`} />
                <div className={`backdrop-blur-xl rounded-2xl border h-28 ${isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'} animate-pulse`} />
              </>
            ) : measurements.length > 0 ? (
              measurements.map((measurement) => (
                <div
                  key={measurement.id}
                  className={`backdrop-blur-xl rounded-2xl border p-5 transition-all ${
                    isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
                  }`}
                  data-testid={`measurement-${measurement.id}`}
                >
                  {editingId === measurement.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>Value</label>
                          <Input
                            type="number"
                            step="any"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            data-testid="input-edit-value"
                            className={isDark ? 'bg-white/10 border-white/20 text-white' : ''}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>Unit</label>
                          <Input
                            value={editUnit}
                            onChange={(e) => setEditUnit(e.target.value)}
                            data-testid="input-edit-unit"
                            className={isDark ? 'bg-white/10 border-white/20 text-white' : ''}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEdit}
                          disabled={updateMutation.isPending}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 text-white text-sm font-medium hover:scale-105 transition-transform disabled:opacity-50"
                          data-testid="button-save-edit"
                        >
                          <Check className="w-4 h-4 inline mr-1" />
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          disabled={updateMutation.isPending}
                          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                            isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-black/5 text-gray-900 hover:bg-black/10'
                          } disabled:opacity-50`}
                          data-testid="button-cancel-edit"
                        >
                          <X className="w-4 h-4 inline mr-1" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {measurement.valueDisplay}
                            </span>
                            {getSourceBadge(measurement.source)}
                          </div>
                          <p className={`text-sm font-medium ${isDark ? 'text-white/90' : 'text-gray-800'}`}>
                            {selectedBiomarker?.name}
                          </p>
                          <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                            {measurement.createdAt ? format(new Date(measurement.createdAt), "MMM d, yyyy 'at' h:mm a") : 'Unknown date'}
                          </p>
                          {measurement.updatedAt && measurement.updatedAt !== measurement.createdAt && (
                            <p className={`text-xs italic ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                              Last updated: {format(new Date(measurement.updatedAt), "MMM d, yyyy 'at' h:mm a")}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEdit(measurement)}
                            className={`p-2 rounded-lg transition-colors ${
                              isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                            }`}
                            data-testid={`button-edit-${measurement.id}`}
                          >
                            <Edit2 className={`w-4 h-4 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
                          </button>
                          <button
                            onClick={() => handleDelete(measurement.id)}
                            className={`p-2 rounded-lg transition-colors ${
                              isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                            }`}
                            data-testid={`button-delete-${measurement.id}`}
                          >
                            <Trash2 className={`w-4 h-4 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
                          </button>
                        </div>
                      </div>
                      {measurement.referenceLow !== null && measurement.referenceHigh !== null && (
                        <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          Reference Range: {measurement.referenceLow} - {measurement.referenceHigh} {measurement.unitCanonical}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className={`backdrop-blur-xl rounded-2xl border p-12 text-center ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
              }`}>
                <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  No measurements found
                </h3>
                <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  No measurement history for this biomarker yet
                </p>
              </div>
            )}
          </div>
        )}

        {!selectedBiomarkerId && biomarkers.length > 0 && (
          <div className={`backdrop-blur-xl rounded-2xl border p-12 text-center ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
          }`}>
            <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Select a biomarker
            </h3>
            <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
              Choose a biomarker above to view its measurement history
            </p>
          </div>
        )}

        {biomarkers.length === 0 && (
          <div className={`backdrop-blur-xl rounded-2xl border p-12 text-center ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
          }`}>
            <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              No biomarkers available
            </h3>
            <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'} mb-4`}>
              Upload your first blood work to start tracking measurements
            </p>
            <Link href="/">
              <button className="px-6 py-3 rounded-xl bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 text-white hover:scale-105 transition-transform">
                Go to Dashboard
              </button>
            </Link>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Measurement?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this measurement from your history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FloBottomNav />
    </div>
  );
}
