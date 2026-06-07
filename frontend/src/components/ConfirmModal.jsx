import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import "../styles/ConfirmModal.css";

/**
 * Compact confirmation dialog (replaces window.confirm). Renders in a portal.
 */
const ConfirmModal = ({
  isOpen,
  title,
  message,
  detail,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  isLoading = false,
  onClose,
  onConfirm,
  showWarningIcon = true,
}) => {
  const confirmBtnRef = useRef(null);
  const previouslyFocused = useRef(null);

  const handleKeyDown = useCallback(
    (e) => {
      if (!isOpen) return;
      if (e.key === "Escape" && !isLoading) {
        e.preventDefault();
        onClose?.();
      }
    },
    [isOpen, isLoading, onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement;
    const t = setTimeout(() => confirmBtnRef.current?.focus(), 50);
    document.addEventListener("keydown", handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const handleBackdropMouseDown = (e) => {
    if (e.target === e.currentTarget && !isLoading) onClose?.();
  };

  const content = (
    <div
      className="confirm-modal-overlay"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className={`confirm-modal-card confirm-modal-card--${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby={message ? "confirm-modal-desc" : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="confirm-modal-header">
          <div className="confirm-modal-title-row">
            {showWarningIcon && variant === "danger" && (
              <span className="confirm-modal-icon-wrap" aria-hidden>
                <AlertTriangle className="confirm-modal-icon" strokeWidth={2} />
              </span>
            )}
            <h2 id="confirm-modal-title" className="confirm-modal-title">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="confirm-modal-close"
            onClick={() => !isLoading && onClose?.()}
            disabled={isLoading}
            aria-label="Close"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        {message && (
          <p id="confirm-modal-desc" className="confirm-modal-message">
            {message}
          </p>
        )}
        {detail && <p className="confirm-modal-detail">{detail}</p>}
        <div className="confirm-modal-actions">
          <button
            type="button"
            className="confirm-modal-btn confirm-modal-btn--ghost"
            onClick={() => onClose?.()}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className={`confirm-modal-btn confirm-modal-btn--primary confirm-modal-btn--${variant}`}
            onClick={() => onConfirm?.()}
            disabled={isLoading}
          >
            {isLoading ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default ConfirmModal;
