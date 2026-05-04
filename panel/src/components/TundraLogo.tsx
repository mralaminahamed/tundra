interface TundraLogoProps {
  size?: number
  variant?: 'light' | 'dark'
}

export function TundraLogo({ size = 48, variant = 'dark' }: TundraLogoProps) {
  const peak = variant === 'dark' ? '#f5f2e9' : '#1c1f1a'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Tundra"
    >
      {/* Aurora arcs */}
      <path
        d="M4 18 Q12 12 20 16 Q28 20 36 14 Q42 10 46 12"
        stroke="#7a8a5c"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      <path
        d="M2 22 Q10 17 18 21 Q26 25 34 19 Q40 15 46 17"
        stroke="#5b7a8c"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      <path
        d="M4 26 Q11 22 19 25 Q27 28 35 23 Q41 19 46 21"
        stroke="#b5613a"
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
      {/* Mountain range */}
      <path
        d="M0 44 L10 28 L17 36 L26 20 L35 33 L40 26 L48 44 Z"
        fill={peak}
      />
      {/* Snow cap on main peak */}
      <path
        d="M26 20 L22 28 L30 28 Z"
        fill={variant === 'dark' ? 'rgba(245,242,233,0.4)' : 'rgba(28,31,26,0.15)'}
      />
    </svg>
  )
}
