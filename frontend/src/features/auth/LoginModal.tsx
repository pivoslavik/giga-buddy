import { Modal } from "../../shared/ui/Modal/Modal"

interface LoginModalProps {
  open: boolean
  onClose: () => void
}

export function LoginModal({ open, onClose }: LoginModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Вход в AI Buddy"
      description="Авторизуйся, чтобы продолжить"
    >
      {/* TODO(#4): login form posting { username, password } to /api/login */}
    </Modal>
  )
}
