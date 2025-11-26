import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

type VerificationState = "loading" | "success" | "error";

export default function VerifyEmail() {
  const [state, setState] = useState<VerificationState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();

  useEffect(() => {
    const verifyEmail = async () => {
      const params = new URLSearchParams(search);
      const token = params.get("token");

      if (!token) {
        setState("error");
        setErrorMessage("Invalid verification link - no token found.");
        return;
      }

      try {
        const response = await fetch("/api/mobile/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (!response.ok) {
          setState("error");
          setErrorMessage(data.error || "Verification failed. Please try again.");
          return;
        }

        // Store the JWT token for authentication
        if (data.token) {
          localStorage.setItem("mobile_auth_token", data.token);
        }

        // Store user info
        if (data.user) {
          localStorage.setItem("mobile_user", JSON.stringify(data.user));
        }

        // Clear any existing query cache and refetch user data
        queryClient.clear();

        setState("success");
        toast({
          title: "Email verified!",
          description: "Welcome to Flō. Your account is now active.",
        });

        // Wait a moment then redirect to dashboard
        setTimeout(() => {
          setLocation("/");
        }, 2000);
      } catch (error) {
        console.error("Verification error:", error);
        setState("error");
        setErrorMessage("Something went wrong. Please try again.");
      }
    };

    verifyEmail();
  }, [search, setLocation, toast]);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
      }}
      data-testid="verify-email-page"
    >
      <Card className="w-full max-w-md bg-slate-900/50 border-slate-800 backdrop-blur-sm">
        <CardHeader className="text-center">
          {state === "loading" && (
            <>
              <div className="flex justify-center mb-4">
                <Loader2 className="h-12 w-12 text-teal-500 animate-spin" />
              </div>
              <CardTitle className="text-2xl text-white">Verifying your email</CardTitle>
              <CardDescription className="text-slate-400">
                Please wait while we verify your account...
              </CardDescription>
            </>
          )}

          {state === "success" && (
            <>
              <div className="flex justify-center mb-4">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
              <CardTitle className="text-2xl text-white">Email Verified!</CardTitle>
              <CardDescription className="text-slate-400">
                Your account is now active. Redirecting you to the app...
              </CardDescription>
            </>
          )}

          {state === "error" && (
            <>
              <div className="flex justify-center mb-4">
                <XCircle className="h-12 w-12 text-red-500" />
              </div>
              <CardTitle className="text-2xl text-white">Verification Failed</CardTitle>
              <CardDescription className="text-slate-400">
                {errorMessage}
              </CardDescription>
            </>
          )}
        </CardHeader>

        {state === "error" && (
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation("/mobile-auth")}
              data-testid="button-back-to-login"
            >
              Back to Login
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
