import type { ComponentProps } from "react"
import styles from "./Button.module.css"

interface ButtonProps extends ComponentProps<"button"> {
  size?: "medium" | "large"
}

export function Button({ size = "medium", type = "button", className, ...props }: ButtonProps) {
  const classes = [styles.button, styles[size], className].filter(Boolean).join(" ")

  return <button type={type} className={classes} {...props} />
}
