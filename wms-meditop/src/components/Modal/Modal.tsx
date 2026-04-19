import React, { useEffect } from "react";
import "./modal.css";

type ModalProps = {
  isOpen: boolean;
  title?: string;
  onClose: () => void;

  children: React.ReactNode;

  // optional
  footer?: React.ReactNode;
  width?: number | string; // ex: 600 or "600px"
  closeOnOverlayClick?: boolean; // default true
  showCloseButton?: boolean; // default true
};

const Modal = ({
  isOpen,
  title,
  onClose,
  children,
  footer,
  width,
  closeOnOverlayClick = true,
  showCloseButton = true,
}: ModalProps) => {
  // กด ESC เพื่อปิด
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // ล็อค scroll หน้าเว็บตอน modal เปิด (optional แต่แนะนำ)
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = () => {
    if (closeOnOverlayClick) onClose();
  };

  return (
   <div className="app-modal-overlay" onClick={handleOverlayClick}>
      <div
        className="app-modal-content"
        style={
          width !== undefined
            ? { width: typeof width === "number" ? `${width}px` : width }
            : undefined
        }
        onClick={(e) => e.stopPropagation()}
      >
        {(title || showCloseButton) && (
          <div className="app-modal-header">
            <h2 className="app-modal-title">{title ?? ""}</h2>

            {showCloseButton && (
              <button
                className="app-modal-close"
                onClick={onClose}
                type="button"
              >
                <i className="fa fa-times" />
              </button>
            )}
          </div>
        )}

        <div className="app-modal-body">{children}</div>

        {footer && <div className="app-modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
