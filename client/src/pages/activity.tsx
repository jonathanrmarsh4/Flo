import { useState } from "react";
import { useLocation } from "wouter";
import { ActivityScreen } from "@/components/ActivityScreen";
import { UnifiedUploadModal } from "@/components/UnifiedUploadModal";

export default function ActivityPage() {
  const [, setLocation] = useLocation();
  const [isDark] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const handleClose = () => {
    setLocation('/dashboard');
  };

  const handleNavigateToDashboard = () => {
    setLocation('/dashboard');
  };

  const handleNavigateToLabs = () => {
    setLocation('/labs');
  };

  const handleNavigateToActions = () => {
    setLocation('/actions');
  };

  return (
    <>
      <ActivityScreen 
        isDark={isDark}
        onClose={handleClose}
        onNavigateToDashboard={handleNavigateToDashboard}
        onNavigateToLabs={handleNavigateToLabs}
        onNavigateToActions={handleNavigateToActions}
        onOpenAddModal={() => setIsAddModalOpen(true)}
      />

      {isAddModalOpen && (
        <UnifiedUploadModal 
          isDark={isDark}
          onClose={() => setIsAddModalOpen(false)}
        />
      )}
    </>
  );
}
