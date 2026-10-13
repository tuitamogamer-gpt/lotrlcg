import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "@phosphor-icons/react";

export function Modal({
  title,
  children,
  onClose,
  wide = false,
  compact = false,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const parent = opener?.closest<HTMLDialogElement>("dialog[open]");
    dialog.showModal();
    return () => {
      dialog.close();
      if (opener?.isConnected && opener !== document.body) {
        opener.focus({ preventScroll: true });
        if (document.activeElement === opener) return;
      }
      if (parent?.isConnected && parent.open) {
        parent
          .querySelector<HTMLElement>(
            '[tabindex="-1"], [autofocus], button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
          )
          ?.focus({ preventScroll: true });
      }
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""} ${compact ? "modal-compact" : ""} ${className}`}
      onCancel={(e) => {
        // React owns closing so native cancel cannot remove focus a second time.
        e.preventDefault();
        onClose?.();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-top">
        <h2>{title}</h2>
        {onClose && (
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}
