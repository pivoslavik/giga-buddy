import { useRef } from "react"
import { LogoMark } from "../../shared/ui/Logo/Logo"
import { BulbIcon, CodeIcon, SparkleIcon } from "../../shared/ui/icons/icons"
import styles from "./HeroIllustration.module.css"
import { usePointerParallax } from "./usePointerParallax"

/**
 * Decorative hero scene: what working with AI Buddy looks like. Hidden from assistive tech.
 * Every direct child is a layer with its own depth for the pointer parallax.
 */
export function HeroIllustration() {
  const sceneRef = useRef<HTMLDivElement>(null)
  usePointerParallax(sceneRef)

  return (
    <div ref={sceneRef} className={styles.scene} aria-hidden="true">
      <div className={styles.orbit} />
      <div className={styles.blobBlue} />
      <div className={styles.blobPurple} />
      <SparkleIcon className={`${styles.sparkle} ${styles.sparkleLarge}`} />
      <SparkleIcon className={`${styles.sparkle} ${styles.sparkleSmall}`} />

      <div className={`${styles.card} ${styles.aiChat}`}>
        <div className={styles.cardTitle}>
          <SparkleIcon className={styles.aiChatIcon} />
          AI-чат
        </div>
        <div className={styles.aiChatBubble}>
          <span className={`${styles.line} ${styles.long}`} />
          <span className={`${styles.line} ${styles.medium}`} />
          <span className={`${styles.line} ${styles.short}`} />
        </div>
        <div className={styles.typing}>
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className={`${styles.card} ${styles.hint}`}>
        <div className={styles.cardTitle}>
          <BulbIcon className={styles.hintIcon} />
          Подсказка
        </div>
        <span className={`${styles.line} ${styles.long}`} />
        <span className={`${styles.line} ${styles.medium}`} />
        <span className={`${styles.line} ${styles.short}`} />
      </div>

      <div className={`${styles.card} ${styles.code}`}>
        <div className={styles.cardTitle}>
          <CodeIcon />
          Код
        </div>
        <span className={`${styles.codeRow} ${styles.codeGreen}`} />
        <span className={`${styles.codeRow} ${styles.codePurple}`} />
        <span className={`${styles.codeRow} ${styles.codeBlue}`} />
      </div>

      <div className={`${styles.card} ${styles.chat}`}>
        <div className={styles.chatHeader}>
          <LogoMark className={styles.chatAvatar} />
          <div>
            <div className={styles.chatName}>AI Buddy</div>
            <div className={styles.chatStatus}>онлайн</div>
          </div>
        </div>
        <p className={`${styles.message} ${styles.outgoing}`}>Как оформить отгул?</p>
        <p className={`${styles.message} ${styles.incoming}`}>
          Расскажу порядок и помогу подготовить заявку
        </p>
      </div>
    </div>
  )
}
