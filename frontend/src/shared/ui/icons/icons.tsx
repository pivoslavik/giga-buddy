import type { SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement>

function BaseIcon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 12h16M14 6l6 6-6 6" />
    </BaseIcon>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </BaseIcon>
  )
}

export function ChatIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3a9 9 0 1 1-4.2 16.96L3 21l1.04-4.8A9 9 0 0 1 12 3z" />
    </BaseIcon>
  )
}

export function CodeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
    </BaseIcon>
  )
}

export function ZapIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
    </BaseIcon>
  )
}

export function BulbIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2v.5h5V16c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" />
    </BaseIcon>
  )
}

export function SparkleIcon(props: IconProps) {
  return (
    <BaseIcon fill="currentColor" stroke="none" {...props}>
      <path d="M12 1.5c.6 5.6 2.9 8.9 10.5 10.5-7.6 1.6-9.9 4.9-10.5 10.5-.6-5.6-2.9-8.9-10.5-10.5C9.1 10.4 11.4 7.1 12 1.5z" />
    </BaseIcon>
  )
}
