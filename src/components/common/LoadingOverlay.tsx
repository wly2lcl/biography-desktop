import { useState, useEffect } from 'react';

interface LoadingOverlayProps {
  text: string;
}

export default function LoadingOverlay({ text }: LoadingOverlayProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [text]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-dark-950/85 backdrop-blur-sm animate-fade-in">
      {/* Spinner */}
      <div className="relative mb-6">
        <div className="w-12 h-12 rounded-full border-4 border-dark-700 border-t-primary-500 animate-spin" />
      </div>

      {/* Loading text */}
      {text && (
        <p className="text-gray-300 text-base mb-2 font-sans">{text}</p>
      )}

      {/* Elapsed timer */}
      <p className="text-gray-500 text-sm font-mono tabular-nums">
        {elapsed < 60
          ? `${elapsed}秒`
          : `${Math.floor(elapsed / 60)}分${elapsed % 60}秒`}
      </p>
    </div>
  );
}
