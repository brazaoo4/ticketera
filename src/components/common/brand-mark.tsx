import React from "react";

interface BrandMarkProps {
  compact?: boolean;
  showWordmark?: boolean;
}

/**
 * Custom Ticketera rounded receipt-and-leaf mark (zero currency symbol).
 */
export function BrandMark({
  compact = false,
  showWordmark = true,
}: BrandMarkProps) {
  const size = compact ? 26 : 34;
  return (
    <span className="inline-flex items-center gap-2.5 shrink-0 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="36" height="36" rx="10" fill="var(--primary)" />
        <path
          d="M11 8.5C11 7.67 11.67 7 12.5 7H23.5C24.33 7 25 7.67 25 8.5V27.4L22.5 25.8L20 27.4L18 26.1L16 27.4L13.5 25.8L11 27.4V8.5Z"
          fill="#FFFFFF"
        />
        <line
          x1="14.2"
          y1="12.5"
          x2="21.8"
          y2="12.5"
          stroke="#15803D"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <line
          x1="14.2"
          y1="16.5"
          x2="21.8"
          y2="16.5"
          stroke="#15803D"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <line
          x1="14.2"
          y1="20.5"
          x2="18.2"
          y2="20.5"
          stroke="#5A605A"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M22.2 19.2C20.6 19.2 19.7 20.1 19.7 21.7C21.3 21.7 22.2 20.8 22.2 19.2Z"
          fill="#D97706"
        />
      </svg>
      {showWordmark && (
        <span
          className={`font-display font-bold leading-none text-[var(--text-primary)] ${
            compact ? "text-base" : "text-[22px]"
          }`}
        >
          Ticketera
        </span>
      )}
    </span>
  );
}
