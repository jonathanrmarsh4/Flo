import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Lock } from "lucide-react";
import { PaywallModal as PaywallModalType } from "@/hooks/usePlan";

interface PaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modal: PaywallModalType;
  onUpgrade: () => void;
}

export function PaywallModal({ open, onOpenChange, modal, onUpgrade }: PaywallModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-paywall-modal">
        <DialogHeader>
          <div className="flex items-center justify-between mb-2">
            <Badge variant="secondary" className="gap-1" data-testid="badge-premium-required">
              <Lock className="w-3 h-3" />
              Premium Required
            </Badge>
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <DialogTitle className="text-xl" data-testid="text-paywall-title">{modal.title}</DialogTitle>
          <DialogDescription className="text-base" data-testid="text-paywall-description">
            {modal.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <p className="text-sm font-medium">Unlock with Premium:</p>
          <div className="space-y-2">
            {modal.benefits.map((benefit, index) => (
              <div
                key={index}
                className="flex items-start gap-2"
                data-testid={`benefit-item-${index}`}
              >
                <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-sm">{benefit}</span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel"
          >
            Maybe Later
          </Button>
          <Button
            onClick={() => {
              onUpgrade();
              onOpenChange(false);
            }}
            data-testid="button-upgrade"
            className="gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {modal.ctaText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
