import { Modal } from "../../shared/ui/Modal/Modal"
import styles from "./DocumentModal.module.css"

interface DocumentModalProps {
  title: string
  open: boolean
  onClose: () => void
}

// TODO(#17): load the document from GET /api/documents/{id} and render its markdown
export function DocumentModal({ title, open, onClose }: DocumentModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} description="Документ из базы знаний">
      <p className={styles.soon}>Скоро здесь можно будет прочитать документ целиком.</p>
    </Modal>
  )
}
