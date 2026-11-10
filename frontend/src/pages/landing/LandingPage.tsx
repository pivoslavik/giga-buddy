import { useState } from "react"
import { LoginModal } from "../../features/auth/LoginModal"
import { Button } from "../../shared/ui/Button/Button"
import { Logo } from "../../shared/ui/Logo/Logo"
import { ArrowRightIcon, ChatIcon, CodeIcon, ZapIcon } from "../../shared/ui/icons/icons"
import { HeroIllustration } from "./HeroIllustration"
import styles from "./LandingPage.module.css"

const FEATURES = [
  {
    title: "Ответы на вопросы",
    text: "Быстрые и понятные ответы по процессам, инструментам и команде",
    Icon: ChatIcon,
    tone: styles.green,
  },
  {
    title: "Помощь с задачами",
    text: "Разбор, подсказки и примеры по реальным рабочим задачам",
    Icon: CodeIcon,
    tone: styles.purple,
  },
  {
    title: "Быстрый старт",
    text: "Проще войти в проект, разобраться в окружении и стать частью команды",
    Icon: ZapIcon,
    tone: styles.blue,
  },
]

/** Entry page for guests: a short pitch of the service and the way to log in. */
export function LandingPage() {
  const [isLoginOpen, setIsLoginOpen] = useState(false)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Logo />
      </header>

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.intro}>
            <svg className={styles.strokes} viewBox="0 0 64 64" aria-hidden="true">
              <path d="M10 26 4 8M24 22l8-18M34 36l22-10" />
            </svg>

            <h1 id="landing-title" className={styles.title}>
              Твой <span className={styles.nowrap}>AI-помощник</span> на стажировке
            </h1>
            <p className={styles.subtitle}>
              Разбирайся в задачах, находи ответы и развивайся быстрее вместе с AI Buddy
            </p>

            <Button
              size="large"
              className={styles.cta}
              aria-haspopup="dialog"
              onClick={() => setIsLoginOpen(true)}
            >
              Войти в сервис
              <ArrowRightIcon />
            </Button>
          </div>

          <HeroIllustration />
        </section>

        <section aria-label="Что умеет AI Buddy">
          <ul className={styles.features}>
            {FEATURES.map(({ title, text, Icon, tone }) => (
              <li key={title} className={styles.feature}>
                <span className={`${styles.featureIcon} ${tone}`}>
                  <Icon />
                </span>
                <div>
                  <h2 className={styles.featureTitle}>{title}</h2>
                  <p className={styles.featureText}>{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <LoginModal open={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </div>
  )
}
