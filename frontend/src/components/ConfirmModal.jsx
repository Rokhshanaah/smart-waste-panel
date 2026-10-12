import Modal from './Modal';

export default function ConfirmModal({
  open,
  title = 'تأیید حذف',
  message = 'آیا از حذف این مورد مطمئن هستید؟',
  confirmLabel = 'حذف',
  cancelLabel = 'انصراف',
  onConfirm,
  onClose,
  busy = false,
}) {
  if (!open) return null;

  return (
    <Modal open title={title} onClose={busy ? undefined : onClose}>
      <div className="crud-form confirm-modal-body">
        <p className="confirm-modal-text">{message}</p>
        <div className="modal-actions">
          <button
            type="button"
            className="danger-button"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={onClose}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
