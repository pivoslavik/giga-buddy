import styles from "./DocumentsIllustration.module.css"

/**
 * Decorative "3D plastic" documents for the knowledge base, in the style of the rocket on the
 * main page: a lavender sheet with a folded corner in front of a green one, a blue ball and a spark.
 */
export function DocumentsIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={className ? `${styles.scene} ${className}` : styles.scene}
      viewBox="0 0 260 220"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="kb-art-purple" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3edff" />
          <stop offset="0.55" stopColor="#cdb8fb" />
          <stop offset="1" stopColor="#a17def" />
        </linearGradient>
        <linearGradient id="kb-art-green" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8af7b8" />
          <stop offset="0.5" stopColor="#00e05a" />
          <stop offset="1" stopColor="#00b84c" />
        </linearGradient>
        <linearGradient id="kb-art-fold" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d8c8fd" />
        </linearGradient>
        <radialGradient id="kb-art-ball" cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#c8f1ff" />
          <stop offset="0.55" stopColor="#2fb6ff" />
          <stop offset="1" stopColor="#0a7fe0" />
        </radialGradient>
      </defs>

      <ellipse className={styles.shadow} cx="146" cy="204" rx="84" ry="9" />

      <g className={styles.spark}>
        <path d="M52 56 38 42M66 38l-3-19M42 80H23" />
      </g>

      <g className={styles.back}>
        <g transform="rotate(10 176 104)">
          <rect x="120" y="22" width="112" height="150" rx="18" fill="url(#kb-art-green)" />
          <path
            d="M186 62h28M186 84h28M186 106h28M186 128h20"
            stroke="#00a843"
            strokeOpacity="0.5"
            strokeWidth="7"
            strokeLinecap="round"
          />
        </g>
      </g>

      <g className={styles.front}>
        <g transform="rotate(-8 126 118)">
          <path
            d="M66 50a18 18 0 0 1 18-18h68l36 36v110a18 18 0 0 1-18 18H84a18 18 0 0 1-18-18Z"
            fill="url(#kb-art-purple)"
          />
          <path d="M152 32v22a14 14 0 0 0 14 14h22Z" fill="url(#kb-art-fold)" />
          <path
            d="M90 94h70M90 116h74M90 138h66M90 160h44"
            stroke="#8a63e6"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M77 62v108"
            stroke="#ffffff"
            strokeOpacity="0.55"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </g>
      </g>

      <g className={styles.ball}>
        <circle cx="200" cy="180" r="22" fill="url(#kb-art-ball)" />
        <ellipse cx="193" cy="172" rx="7" ry="4.5" fill="#ffffff" opacity="0.6" />
      </g>
    </svg>
  )
}
