"use client";

// Small inline-SVG icon set, replacing the emoji previously standing in for
// icons across the console (🤝 ⏳ 🔍 ✅ ⚠️). Stroke-based outline style to
// match the mobile app's Ionicons usage, so the two surfaces read as one
// brand rather than two unrelated visual languages. No icon font/CDN
// dependency — inline paths keep the console's zero-external-asset posture.

const PATHS = {
  handshake: "M8 12l3 3 3-3 3 3M4 8l4 4-2 2M20 8l-4 4 2 2M9 6l3-3 3 3",
  hourglass: "M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.35-4.35",
  check: "M20 6L9 17l-5-5",
  "check-circle": "M20 6L9 17l-5-5M12 21a9 9 0 100-18 9 9 0 000 18",
  warning: "M12 2L1 21h22L12 2zM12 9v5M12 17.5v.01",
  refresh: "M21 12a9 9 0 11-3-6.7M21 3v5.5h-5.5",
  box: "M3 8l9-5 9 5-9 5-9-5zM3 8v9l9 5 9-5V8M12 13v9",
  camera: "M4 7h3l2-3h6l2 3h3a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1zM12 17a4 4 0 100-8 4 4 0 000 8z",
};

/**
 * Icon — outline SVG icon.
 * Props: { name: keyof PATHS, size?: number, color?: string, style?: object }
 */
export default function Icon({ name, size = 18, color = "currentColor", style }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
