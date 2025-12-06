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

  return (
    <>
      <ActivityScreen 
        isDark={isDark}
        onClose={handleClose}
        onAddClick={() => setIsAddModalOpen(true)}
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
