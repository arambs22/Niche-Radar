import { useEffect, type ReactNode } from "react";
import { useLanguage } from "../context/LanguageContext";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Centered overlay dialog; closes on Escape, backdrop click, or the × button. */
export function Modal({ title, onClose, children }: ModalProps) {
  const { t } = useLanguage();

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-text truncate">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t.common.close} className="text-text-muted hover:text-primary">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
