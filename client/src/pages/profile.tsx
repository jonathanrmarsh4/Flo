import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FloBottomNav } from "@/components/FloBottomNav";
import { User, Mail, LogOut, Shield } from "lucide-react";

export default function Profile() {
  const { user } = useAuth();

  const initials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.email?.[0].toUpperCase() || "U";

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="px-4 pt-6 pb-4">
        <div className="max-w-md mx-auto">
          <h1 className="text-title-1 font-bold">Profile</h1>
          <p className="text-callout text-muted-foreground mt-1">
            Manage your account settings
          </p>
        </div>
      </header>

      <div className="px-4 space-y-6 max-w-md mx-auto">
        {/* Profile Card */}
        <Card className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <Avatar className="w-20 h-20">
              <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
              <AvatarFallback className="text-title-2 font-semibold bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="text-title-2 font-bold" data-testid="user-name">
                {user?.firstName || user?.lastName
                  ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim()
                  : "User"}
              </h2>
              <p className="text-callout text-muted-foreground" data-testid="user-email">
                {user?.email || "No email"}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
              <User className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-footnote text-muted-foreground">User ID</p>
                <p className="text-callout font-mono truncate">{user?.id}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
              <Mail className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-footnote text-muted-foreground">Email</p>
                <p className="text-callout truncate">{user?.email || "Not provided"}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Security Card */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="text-title-3 font-semibold">Security</h3>
          </div>
          <p className="text-callout text-muted-foreground">
            Your account is secured with Replit Auth. Your data is encrypted and protected.
          </p>
        </Card>

        {/* Logout Button */}
        <a href="/api/logout">
          <Button
            variant="destructive"
            className="w-full h-12 text-body font-semibold"
            data-testid="button-logout"
          >
            <LogOut className="w-5 h-5 mr-2" />
            Log Out
          </Button>
        </a>

        <p className="text-center text-footnote text-muted-foreground">
          Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "N/A"}
        </p>
      </div>
      <FloBottomNav />
    </div>
  );
}
