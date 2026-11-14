import { createLink, type LinkComponent } from "@tanstack/react-router"
import type { ComponentProps } from "react"
import styles from "./Button.module.css"

interface ButtonAnchorProps extends ComponentProps<"a"> {
  size?: "medium" | "large"
}

function ButtonAnchor({ size = "medium", className, ...props }: ButtonAnchorProps) {
  const classes = [styles.button, styles[size], className].filter(Boolean).join(" ")

  return <a className={classes} {...props} />
}

const RouterButtonAnchor = createLink(ButtonAnchor)

/** A router link that looks like Button: for calls to action that open another page. */
export const ButtonLink: LinkComponent<typeof ButtonAnchor> = (props) => (
  <RouterButtonAnchor {...props} />
)
