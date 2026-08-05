type LibraryToggleProps = {
  open: boolean;
  onToggle: () => void;
};

/**
 * The mockup's `• LIBRARY` chip. Lives on the LEFT edge, next to the panel it toggles, and glows
 * in the current toolbar accent when the panel is open (note-taker: "should be on the other side
 * in the left and also should be glowing").
 *
 * Rendered directly (position: fixed, styled in boardChrome.scss) rather than portalled into
 * Excalidraw's centered toolbar row — the panel is on the left, so the toggle belongs on the left
 * too. The panel's open state is owned by the outer app (App.tsx), which passes it down here.
 */
export const LibraryToggle = ({ open, onToggle }: LibraryToggleProps) => {
  return (
    <button
      type="button"
      className={`LibraryToggle${open ? " LibraryToggle--open" : ""}`}
      aria-pressed={open}
      onClick={onToggle}
    >
      Library
    </button>
  );
};
