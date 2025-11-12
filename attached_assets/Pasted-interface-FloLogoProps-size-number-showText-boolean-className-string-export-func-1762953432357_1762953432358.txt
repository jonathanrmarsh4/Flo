interface FloLogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
}

export function FloIcon({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Main gradient for the ring */}
        <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EC4899" />
          <stop offset="15%" stopColor="#A855F7" />
          <stop offset="30%" stopColor="#3B82F6" />
          <stop offset="50%" stopColor="#06B6D4" />
          <stop offset="65%" stopColor="#10B981" />
          <stop offset="80%" stopColor="#EAB308" />
          <stop offset="100%" stopColor="#F97316" />
        </linearGradient>
        
        {/* Glossy shine effect */}
        <linearGradient id="shineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="white" stopOpacity="0.4" />
          <stop offset="50%" stopColor="white" stopOpacity="0.1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        
        {/* Shadow gradient */}
        <radialGradient id="shadowGradient">
          <stop offset="0%" stopColor="black" stopOpacity="0.3" />
          <stop offset="100%" stopColor="black" stopOpacity="0" />
        </radialGradient>
      </defs>
      
      {/* Soft shadow */}
      <circle cx="50" cy="52" r="40" fill="url(#shadowGradient)" opacity="0.3" />
      
      {/* Main ring with gradient */}
      <circle
        cx="50"
        cy="50"
        r="35"
        stroke="url(#ringGradient)"
        strokeWidth="14"
        fill="none"
        strokeLinecap="round"
      />
      
      {/* Glossy shine overlay on top half */}
      <path
        d="M 50 15 A 35 35 0 0 1 85 50 L 71 50 A 21 21 0 0 0 50 29 Z"
        fill="url(#shineGradient)"
        opacity="0.6"
      />
      
      {/* Inner glow */}
      <circle
        cx="50"
        cy="50"
        r="28"
        stroke="url(#ringGradient)"
        strokeWidth="2"
        fill="none"
        opacity="0.3"
      />
    </svg>
  );
}

export function FloLogo({ size = 40, showText = false, className = '' }: FloLogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <FloIcon size={size} />
      {showText && (
        <span className="text-2xl tracking-tight">Flō</span>
      )}
    </div>
  );
}