import { useEffect } from "react";

// Handle Pattern List copy/paste shortcuts when the list has pointer/focus context.
export const usePatternListClipboardShortcuts = function ({
  patternListRef,
  isPointerOverList,
  orderedSelectedPatternIds,
  clipboardPatternIds,
  onCopyPatterns,
  onPastePatterns,
}) {
  useEffect(
    function () {
      const shouldIgnoreShortcutTarget = function (target) {
        if (!(target instanceof HTMLElement)) {
          return false;
        }

        if (target.isContentEditable) {
          return true;
        }

        return Boolean(
          target.closest("input, textarea, select, [contenteditable='true']"),
        );
      };

      const onKeyDown = function (event) {
        const isModifierPressed = event.ctrlKey || event.metaKey;
        const isCopyShortcut =
          isModifierPressed && !event.shiftKey && event.code === "KeyC";
        const isPasteShortcut =
          isModifierPressed && !event.shiftKey && event.code === "KeyV";

        if (!isCopyShortcut && !isPasteShortcut) {
          return;
        }

        const root = patternListRef.current;
        const activeElement = document.activeElement;
        const hasContext =
          isPointerOverList ||
          (root instanceof HTMLElement && root.contains(activeElement));

        if (!hasContext || shouldIgnoreShortcutTarget(event.target)) {
          return;
        }

        if (isCopyShortcut) {
          if (orderedSelectedPatternIds.length === 0) {
            return;
          }

          event.preventDefault();
          onCopyPatterns(orderedSelectedPatternIds);
          return;
        }

        if (clipboardPatternIds.length === 0) {
          return;
        }

        event.preventDefault();
        onPastePatterns(clipboardPatternIds);
      };

      window.addEventListener("keydown", onKeyDown);
      return function () {
        window.removeEventListener("keydown", onKeyDown);
      };
    },
    [
      clipboardPatternIds,
      isPointerOverList,
      onCopyPatterns,
      onPastePatterns,
      orderedSelectedPatternIds,
      patternListRef,
    ],
  );
};
