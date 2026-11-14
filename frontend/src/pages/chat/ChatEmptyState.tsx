import styles from "./ChatPage.module.css"

const illustrationViewBox = "0 0 336 236"

export function ChatEmptyState() {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIllustration} aria-hidden="true">
        <svg viewBox={illustrationViewBox} focusable="false">
          <path
            fill="#eae5fc"
            d="M143 49C151 23 171 7 194 7c27 0 47 20 47 47 0 15-5 26 0 42 5 17 27 28 30 52 5 30-12 58-37 64-23 5-38-7-65-2-21 4-37 16-63 16-29 0-55-15-57-44-3-34 24-52 46-67 24-17 39-40 48-66Z"
          />
          <path
            fill="#00e56d"
            d="M24 136c2 0 3 4 5 8s5 6 9 7 5 2 5 4-3 2-6 4c-5 2-7 4-9 9-2 4-2 5-4 5s-2-4-4-8-4-6-9-8-5-2-5-4 3-2 6-3c6-2 8-5 9-9 1-3 1-5 3-5Zm266 83a39 39 0 0 1 39-39v39Z"
          />
          <circle cx="91" cy="197" r="8.5" fill="#ff535b" />
          <path
            d="m253 40 8-23m7 33 21-17m-15 34 24-4"
            fill="none"
            stroke="#ff535b"
            strokeLinecap="round"
            strokeWidth="9"
          />
        </svg>

        <svg
          className={`${styles.emptyBubble} ${styles.emptyBubblePurple}`}
          viewBox={illustrationViewBox}
          focusable="false"
        >
          <path
            fill="#8549ee"
            d="M184 86h64a54 54 0 0 1 11 107l1 22c0 4-3 5-6 3l-26-21a13 13 0 0 0-8-3h-36a54 54 0 1 1 0-108Z"
          />
          <g fill="#fafaff">
            <circle cx="203" cy="144" r="7.5" />
            <circle cx="230" cy="144" r="7.5" />
            <circle cx="257" cy="144" r="7.5" />
          </g>
        </svg>

        <svg
          className={`${styles.emptyBubble} ${styles.emptyBubbleBlue}`}
          viewBox={illustrationViewBox}
          focusable="false"
        >
          <path
            fill="#00a2ef"
            stroke="#f8f9fe"
            d="M86 34h81a52 52 0 0 1 0 104h-62a10 10 0 0 0-7 3l-25 21c-3 3-7 1-7-3l2-24a52 52 0 0 1 18-101Z"
          />
          <g fill="#fafaff">
            <circle cx="93" cy="84" r="10" />
            <circle cx="128" cy="84" r="10" />
            <circle cx="164" cy="84" r="10" />
          </g>
        </svg>
      </div>

      <h2>Напиши первое сообщение</h2>
      <p>Задай вопрос, попроси помочь с задачей или узнай что-то о проекте</p>
    </div>
  )
}
