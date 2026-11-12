import { ButtonLink } from "../../shared/ui/Button/ButtonLink"
import { ArrowRightIcon, ChatDotsIcon } from "../../shared/ui/icons/icons"
import { PageTitle } from "../../shared/ui/PageTitle/PageTitle"
import { Faq } from "./Faq"
import { FirstSteps } from "./FirstSteps"
import styles from "./HomePage.module.css"
import { RocketIllustration } from "./RocketIllustration"

/** Main page of the app: where to start, answers to common questions and the way to the chat. */
export function HomePage() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <PageTitle
          title="С чего начнём?"
          subtitle="Освойся в команде и найди ответы вместе с AI Buddy"
        />
        <RocketIllustration className={styles.rocket} />
      </div>

      <div className={styles.cards}>
        <FirstSteps />
        <Faq />
      </div>

      <section className={styles.banner} aria-labelledby="home-chat-title">
        <span className={styles.bannerIcon}>
          <ChatDotsIcon />
        </span>
        <div className={styles.bannerText}>
          <h2 id="home-chat-title" className={styles.bannerTitle}>
            Остались вопросы?
          </h2>
          <p>AI Buddy поможет разобраться в деталях.</p>
        </div>
        <ButtonLink to="/chat" className={styles.bannerButton}>
          Перейти в чат
          <ArrowRightIcon />
        </ButtonLink>
      </section>
    </div>
  )
}
