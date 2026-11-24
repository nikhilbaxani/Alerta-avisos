/** Iconos de trazo propios (24×24), sin dependencias ni fuentes externas. */
const PATHS = {
  play: "M7 5v14l11-7z",
  pause: "M8 5v14M16 5v14",
  restart: "M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5",
  phone: "M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01",
  download: "M12 4v11M7 10.5l5 5 5-5M5 20h14",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  speaker: "M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11",
  alert: "M12 4 2.5 20h19zM12 10v4.5M12 17.5h.01",
  check: "M5 12.5l4.5 4.5L19 7.5",
  split: "M6 4v5a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3v5M18 4v5a3 3 0 0 1-3 3",
  mic: "M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3zM6 11.5a6 6 0 0 0 12 0M12 17.5V20",
  close: "M6 6l12 12M18 6 6 18",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  chevron: "M9 6l6 6-6 6",
  people: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.5M17.5 14a5 5 0 0 1 3 5",
  truck: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  message: "M4 5h16v11H9l-5 4zM8 9.5h8M8 12.5h5",
  bolt: "M13 3 5 13.5h6L10 21l8-10.5h-6z",
  building: "M5 21V6l7-3 7 3v15M3 21h18M9 9h1.5M13.5 9H15M9 13h1.5M13.5 13H15M10.5 21v-4h3v4",
  callback: "M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1zM15 3h6v6M21 3l-6 6",
  agent: "M12 3v3M8 7h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3zM9.5 12h.01M14.5 12h.01M9.5 15.5h5",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.5 5.6 3.5 9s-1 6.4-3.5 9c-2.5-2.6-3.5-5.6-3.5-9s1-6.4 3.5-9z",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  const filled = name === "play";
  return (
    <svg
      className={`icon ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
