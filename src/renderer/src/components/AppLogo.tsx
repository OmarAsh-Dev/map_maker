interface AppLogoProps {
  className?: string
}

export default function AppLogo({ className = 'h-8 w-8' }: AppLogoProps) {
  return (
    <svg
      data-testid="app-logo"
      aria-hidden="true"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="mm-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
        <linearGradient id="mm-water" x1="12" y1="36" x2="52" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id="mm-land" x1="12" y1="26" x2="52" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
        <linearGradient id="mm-pin" x1="22" y1="8" x2="42" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#e11d48" />
        </linearGradient>
      </defs>

      {/* App icon squircle background */}
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#mm-bg)" />
      <rect
        x="2.75"
        y="2.75"
        width="58.5"
        height="58.5"
        rx="13.25"
        stroke="#38bdf8"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />

      {/* Bottom isometric map layer (Water / Base) */}
      <path
        d="M32 35L52 44.5L32 54L12 44.5L32 35Z"
        fill="url(#mm-water)"
        stroke="#bae6fd"
        strokeOpacity="0.4"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Middle isometric map layer (Terrain & Vector Roads) */}
      <path
        d="M32 25L52 34.5L32 44L12 34.5L32 25Z"
        fill="url(#mm-land)"
        stroke="#a7f3d0"
        strokeOpacity="0.5"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Stylized vector road network on middle layer */}
      <path
        d="M21 34.5L32 39.5L43 34.5M26.5 31.5L37.5 37"
        stroke="#ffffff"
        strokeOpacity="0.75"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Map Pin */}
      <path
        d="M32 9C25.9249 9 21 13.9249 21 20C21 27.75 32 36.5 32 36.5C32 36.5 43 27.75 43 20C43 13.9249 38.0751 9 32 9Z"
        fill="url(#mm-pin)"
        stroke="#ffffff"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="19.5" r="4" fill="#ffffff" />
    </svg>
  )
}
