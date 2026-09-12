/**
 * A microphone in Makitra's icon hand: straight scissor edges, square ends, currentColor.
 * The illustration set has no microphone, and borrowing a drink or a cooking pot for one
 * made the voice screen say something it did not mean.
 */
export const MicMark = ({ className = '', strokeWidth = 2.2 }: { className?: string; strokeWidth?: number }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="square"
    strokeLinejoin="miter"
    aria-hidden="true"
    focusable="false"
    className={className}
  >
    <polygon points="9,2.5 15,2.5 15.6,12.6 12,15 8.4,12.6" />
    <polyline points="5,10.5 6.4,16 12,18.6 17.6,16 19,10.5" />
    <path d="M12 18.8v2.7M8.5 21.5h7" />
  </svg>
);
