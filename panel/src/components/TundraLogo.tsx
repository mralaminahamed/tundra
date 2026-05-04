interface TundraMarkProps {
  size?: number
  color?: string
  className?: string
}

/** The official Tundra north-star mark. Single solid path, no gradients, no strokes. */
export function TundraMark({ size = 24, color = 'currentColor', className }: TundraMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M 120 12 L 137 102 L 172 120 L 137 138 L 120 228 L 103 138 L 68 120 L 103 102 Z"
        fill={color}
      />
    </svg>
  )
}

interface TundraLogoProps {
  size?: number
  variant?: 'light' | 'dark'
  className?: string
}

/** Mark + "tundra" wordmark lockup, horizontal. */
export function TundraLogo({ size = 32, variant = 'light', className }: TundraLogoProps) {
  const ink = variant === 'dark' ? '#F5F2E9' : '#1C1F1A'
  return (
    <svg
      width={size * 3.75}
      height={size}
      viewBox="0 0 600 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Tundra"
      className={className}
    >
      <g transform="translate(20, 20)">
        <path
          d="M 60 6 L 68.5 51 L 86 60 L 68.5 69 L 60 114 L 51.5 69 L 34 60 L 51.5 51 Z"
          fill={ink}
        />
      </g>
      <text
        x="170"
        y="106"
        fontFamily="'Inter Display', 'Inter', -apple-system, sans-serif"
        fontWeight="900"
        fontSize="96"
        letterSpacing="-3"
        fill={ink}
      >
        tundra
      </text>
    </svg>
  )
}
