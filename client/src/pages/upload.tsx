import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { FloBottomNav } from "@/components/FloBottomNav";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function UploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      // Get upload URL and object path
      const uploadRes = await apiRequest("POST", "/api/objects/upload", {});
      const { uploadURL, objectPath } = await uploadRes.json();

      // Upload file
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

      // Analyze the file using the object path
      const analyzeRes = await apiRequest("POST", "/api/blood-work/analyze", {
        fileUrl: objectPath,
        fileName: file.name,
      });
      return await analyzeRes.json();
    },
    onSuccess: () => {
      setUploadProgress(null);
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/blood-work"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lab-work-overdue"] });
      toast({
        title: "Analysis Complete",
        description: "Your blood work has been analyzed successfully!",
      });
      setLocation("/");
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (10MB max)
      if (file.size > 10485760) {
        toast({
          title: "File Too Large",
          description: "Please select a file smaller than 10MB",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  const isProcessing = uploadProgress !== null || uploadMutation.isPending;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="px-4 pt-6 pb-4">
        <div className="max-w-md mx-auto">
          <h1 className="text-title-1 font-bold">Upload Blood Work</h1>
          <p className="text-callout text-muted-foreground mt-1">
            Upload a PDF or image of your blood test results
          </p>
        </div>
      </header>

      <div className="px-4 space-y-6 max-w-md mx-auto">
        {/* Upload Card */}
        <Card className="p-8">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10">
              {isProcessing ? (
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
              ) : (
                <Upload className="w-10 h-10 text-primary" />
              )}
            </div>

            {isProcessing ? (
              <div className="space-y-4">
                <h3 className="text-title-2 font-semibold">
                  {uploadProgress !== null && uploadProgress < 100
                    ? "Uploading..."
                    : "Analyzing..."}
                </h3>
                <Progress 
                  value={uploadProgress !== null ? uploadProgress : undefined} 
                  className="h-2"
                />
                <p className="text-callout text-muted-foreground">
                  {uploadProgress !== null && uploadProgress < 100
                    ? "Uploading your blood work..."
                    : "Our AI is analyzing your results..."}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <h3 className="text-title-2 font-semibold mb-2">
                    Select Your File
                  </h3>
                  <p className="text-callout text-muted-foreground">
                    PDF or image files up to 10MB
                  </p>
                  {selectedFile && (
                    <p className="text-callout text-primary mt-2 font-medium">
                      Selected: {selectedFile.name}
                    </p>
                  )}
                </div>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-file"
                />
                
                <div className="space-y-3">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    className="w-full h-12 text-body font-semibold"
                    data-testid="button-select-file"
                  >
                    <FileText className="w-5 h-5 mr-2" />
                    {selectedFile ? "Change File" : "Choose File"}
                  </Button>
                  
                  {selectedFile && (
                    <Button
                      onClick={handleUpload}
                      className="w-full h-12 text-body font-semibold"
                      data-testid="button-upload"
                    >
                      <Upload className="w-5 h-5 mr-2" />
                      Upload & Analyze
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Info Card */}
        <Card className="p-6 bg-muted/30">
          <h4 className="text-callout font-semibold mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            What happens next?
          </h4>
          <ol className="space-y-2 text-subheadline text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="font-semibold text-foreground">1.</span>
              <span>Your blood work is securely uploaded</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-foreground">2.</span>
              <span>AI analyzes your results and extracts key metrics</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-foreground">3.</span>
              <span>You receive personalized insights and biological age</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-foreground">4.</span>
              <span>Track your progress over time</span>
            </li>
          </ol>
        </Card>
      </div>
      <FloBottomNav />
    </div>
  );
}
