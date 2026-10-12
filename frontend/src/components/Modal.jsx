import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({ title, children, onClose, open = true }) {
  if (!open) return null;

  const close = typeof onClose === 'function' ? onClose : undefined;

  return createPortal(
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="icon-button" onClick={close} disabled={!close}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
