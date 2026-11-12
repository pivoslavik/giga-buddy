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

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 17 17 7M8 7h9v9" />
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

export function ChatDotsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3c5 0 9 3.4 9 7.6s-4 7.6-9 7.6c-.9 0-1.8-.1-2.6-.3L4.5 20.5l1.2-3.9C4 15.2 3 13 3 10.6 3 6.4 7 3 12 3z" />
      <path d="M8 10.75h.01M12 10.75h.01M16 10.75h.01" strokeWidth={2.6} />
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

export function UserIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </BaseIcon>
  )
}

export function LockIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14.5v2" />
    </BaseIcon>
  )
}

export function EyeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </BaseIcon>
  )
}

export function EyeOffIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 4l16 16" />
    </BaseIcon>
  )
}

export function DocumentIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </BaseIcon>
  )
}

export function LogoutIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
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
