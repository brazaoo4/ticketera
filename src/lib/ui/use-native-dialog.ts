"use client";

import { useEffect, type RefObject } from "react";

/**
 * Synchronizes a React boolean open state with a native <dialog> element opened via showModal(),
 * including progressive-enhancement `closedby="any"` backdrop dismissal fallback and returnValue reset.
 */
export function useNativeDialog(
  dialogRef: RefObject<HTMLDialogElement | null>,
  isOpen: boolean,
  onClose: () => void,
  options?: { closeOnBackdrop?: boolean }
) {
  const closeOnBackdrop = options?.closeOnBackdrop ?? true;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (closeOnBackdrop) {
      dialog.setAttribute("closedby", "any");
    } else {
      dialog.setAttribute("closedby", "closerequest");
    }

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [dialogRef, isOpen, closeOnBackdrop]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = "";
      onClose();
    };

    dialog.addEventListener("close", handleClose);

    // Fallback for browsers lacking HTMLDialogElement.prototype.closedBy (e.g. Safari)
    let cleanupBackdrop: (() => void) | undefined;
    if (closeOnBackdrop && !("closedBy" in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (e: PointerEvent) => {
        const rect = dialog.getBoundingClientRect();
        return (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        );
      };
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e) && dialog.open) {
          dialog.close("backdrop");
        }
        pressedOutside = false;
      };
      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);
      cleanupBackdrop = () => {
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener("close", handleClose);
      cleanupBackdrop?.();
    };
  }, [dialogRef, onClose, closeOnBackdrop]);
}
