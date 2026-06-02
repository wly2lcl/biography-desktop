interface ErrorModalProps {
  message: string;
  onClose: () => void;
  onRetry?: () => void;
}

export default function ErrorModal({ message, onClose, onRetry }: ErrorModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-950/70 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel max-w-md w-full mx-4 p-6 animate-slide-up">
        {/* Error icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg
              className="w-7 h-7 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
        </div>

        {/* Message */}
        <h3 className="text-lg font-semibold text-center text-gray-100 mb-2">
          出错了
        </h3>
        <p className="text-gray-400 text-center text-sm mb-6 leading-relaxed whitespace-pre-wrap break-words">
          {message}
        </p>

        {/* Buttons */}
        <div className="flex justify-center gap-3">
          {onRetry && (
            <button onClick={onRetry} className="btn-primary min-w-[100px]">
              重试
            </button>
          )}
          <button onClick={onClose} className="btn-secondary min-w-[100px]">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
