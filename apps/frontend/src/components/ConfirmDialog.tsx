import type { ReactNode } from 'react';
import Modal from './Modal';

interface Props {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title, message, confirmLabel = 'Confirm', tone = 'primary', onConfirm, onCancel,
}: Props) {
  return (
    <Modal title={title} onClose={onCancel} size="sm">
      <p className="text-sm text-stone-600 mb-5">{message}</p>
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className={tone === 'danger' ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
