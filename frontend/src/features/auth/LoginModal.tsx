import { Modal } from "../../shared/ui/Modal/Modal"
import { LoginForm } from "./LoginForm"

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
      {/* mounted only while open, so the typed password and errors do not outlive the modal */}
      {open && <LoginForm />}
    </Modal>
  )
}
