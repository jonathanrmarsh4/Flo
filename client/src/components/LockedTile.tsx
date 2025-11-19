import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Sparkles } from "lucide-react";
import { LucideIcon } from "lucide-react";

interface LockedTileProps {
  title: string;
  description: string;
  icon: LucideIcon;
  onUpgrade: () => void;
  className?: string;
}

export function LockedTile({ title, description, icon: Icon, onUpgrade, className }: LockedTileProps) {
  return (
    <Card className={`relative overflow-hidden ${className || ""}`} data-testid={`card-locked-tile-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-muted/50 to-muted/30 backdrop-blur-sm" />
      
      <div className="relative">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2 opacity-60">
            <Icon className="w-4 h-4" />
            {title}
          </CardTitle>
          <Badge variant="secondary" className="gap-1 text-xs" data-testid="badge-locked">
            <Lock className="w-3 h-3" />
            Locked
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground" data-testid="text-locked-description">
            {description}
          </p>
          <Button
            size="sm"
            onClick={onUpgrade}
            className="w-full gap-2"
            data-testid="button-unlock-feature"
          >
            <Sparkles className="w-3 h-3" />
            Unlock with Premium
          </Button>
        </CardContent>
      </div>
    </Card>
  );
}
