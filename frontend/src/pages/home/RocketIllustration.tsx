import styles from "./RocketIllustration.module.css"

// the rocket is drawn pointing up around (0, 0) and turned towards the upper right as a whole
const BODY_PATH =
  "M0 -74C30 -56 36 -12 31 24C28 42 18 50 0 50C-18 50 -28 42 -31 24C-36 -12 -30 -56 0 -74Z"

/**
 * Decorative "3D plastic" rocket for the main page, in the style of the landing illustration:
 * a lavender body with green fins, an orbit and a planet behind it, a cloud of smoke under it.
 */
export function RocketIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={className ? `${styles.scene} ${className}` : styles.scene}
      viewBox="0 0 300 205"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="home-rocket-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f4eeff" />
          <stop offset="0.5" stopColor="#d6c4fb" />
          <stop offset="1" stopColor="#a888ee" />
        </linearGradient>
        <linearGradient id="home-rocket-green" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7cf7ad" />
          <stop offset="0.5" stopColor="#00e05a" />
          <stop offset="1" stopColor="#00b84c" />
        </linearGradient>
        <radialGradient id="home-rocket-cyan" cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#c8fbff" />
          <stop offset="0.55" stopColor="#4fdbe8" />
          <stop offset="1" stopColor="#19b4c9" />
        </radialGradient>
        <radialGradient id="home-rocket-cloud" cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#efe9fe" />
          <stop offset="1" stopColor="#d7cbf8" />
        </radialGradient>
        <linearGradient id="home-rocket-trail" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c4abf5" />
          <stop offset="1" stopColor="#e6dcfd" />
        </linearGradient>
        <clipPath id="home-rocket-body-clip">
          <path d={BODY_PATH} />
        </clipPath>
      </defs>

      <ellipse
        className={styles.orbit}
        cx="150"
        cy="122"
        rx="128"
        ry="34"
        transform="rotate(-10 150 122)"
      />

      <g className={styles.planet}>
        <circle cx="266" cy="58" r="19" fill="url(#home-rocket-cyan)" />
        <ellipse cx="259" cy="50" rx="6" ry="4" fill="#ffffff" opacity="0.6" />
      </g>

      <g className={styles.rocket}>
        <g transform="translate(168 84) rotate(40)">
          <path
            d="M-13 50C-15 70 -12 90 -16 112H16C12 90 15 70 13 50Z"
            fill="url(#home-rocket-trail)"
          />
          <path
            d="M-26 0C-44 10 -54 30 -52 50C-44 44 -34 40 -22 40Z"
            fill="url(#home-rocket-green)"
          />
          <path d="M26 0C44 10 54 30 52 50C44 44 34 40 22 40Z" fill="url(#home-rocket-green)" />
          <path d="M-14 44H14L10 56H-10Z" fill="#b89cf2" />

          <path d={BODY_PATH} fill="url(#home-rocket-body)" />
          <g clipPath="url(#home-rocket-body-clip)">
            <path d="M-40 -90H40V-40Q0 -28 -40 -40Z" fill="url(#home-rocket-green)" />
          </g>
          <path
            d="M-18 -30C-22 -10 -21 10 -17 28"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.55"
            strokeWidth="6"
            strokeLinecap="round"
          />

          <circle cy="-8" r="14" fill="#3fd3e0" />
          <circle cy="-8" r="9.5" fill="url(#home-rocket-cyan)" />
          <circle cx="-3" cy="-11" r="3" fill="#ffffff" opacity="0.7" />
        </g>
      </g>

      <g className={styles.cloud} fill="url(#home-rocket-cloud)">
        <circle cx="100" cy="160" r="14" />
        <circle cx="118" cy="170" r="16" />
        <circle cx="92" cy="178" r="20" />
        <circle cx="72" cy="186" r="13" />
        <circle cx="114" cy="188" r="14" />
      </g>
    </svg>
  )
}
