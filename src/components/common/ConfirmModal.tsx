interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export default function ConfirmModal({
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-950/70 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel max-w-sm w-full mx-4 p-6 animate-slide-up">
        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-100 mb-3 text-center">
          {title}
        </h3>

        {/* Message */}
        <p className="text-gray-400 text-sm text-center mb-6 leading-relaxed whitespace-pre-wrap break-words">
          {message}
        </p>

        {/* Buttons */}
        <div className="flex justify-center gap-3">
          <button
            onClick={onConfirm}
            className={danger ? 'btn-danger min-w-[100px]' : 'btn-primary min-w-[100px]'}
          >
            {confirmText}
          </button>
          <button onClick={onCancel} className="btn-secondary min-w-[100px]">
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
}
