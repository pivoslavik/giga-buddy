import { useRef } from "react"
import { BulbIcon, CodeIcon, SparkleIcon } from "../../shared/ui/icons/icons"
import buddyLarge from "./assets/buddy-896.webp"
import buddySmall from "./assets/buddy-448.webp"
import styles from "./HeroIllustration.module.css"
import { usePointerParallax } from "./usePointerParallax"

/**
 * Decorative hero scene: an intern working with AI Buddy hints floating around.
 * Hidden from assistive tech. Every direct child is a layer with its own depth
 * for the pointer parallax.
 */
export function HeroIllustration() {
  const sceneRef = useRef<HTMLDivElement>(null)
  usePointerParallax(sceneRef)

  return (
    <div ref={sceneRef} className={styles.scene} aria-hidden="true">
      <div className={styles.orbit} />
      <div className={styles.blobBlue} />
      <div className={styles.blobPurple} />

      <div className={`${styles.card} ${styles.code}`}>
        <div className={styles.cardTitle}>
          <CodeIcon />
          Код
        </div>
        <span className={`${styles.codeRow} ${styles.codeGreen}`} />
        <span className={`${styles.codeRow} ${styles.codePurple}`} />
        <span className={`${styles.codeRow} ${styles.codeBlue}`} />
      </div>

      <div className={styles.character}>
        <img
          src={buddyLarge}
          srcSet={`${buddySmall} 448w, ${buddyLarge} 896w`}
          sizes="(max-width: 960px) 66vw, 460px"
          width={896}
          height={893}
          alt=""
          fetchPriority="high"
          decoding="async"
        />
      </div>

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

      <SparkleIcon className={`${styles.sparkle} ${styles.sparkleLarge}`} />
      <SparkleIcon className={`${styles.sparkle} ${styles.sparkleSmall}`} />
    </div>
  )
}
