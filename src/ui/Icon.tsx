import type { CSSProperties } from "react";
const paths = {
  command: "M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  research: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6M7 8h6M7 11h4",
  work: "M8 5V3h8v2M3 7h18v14H3V7Zm0 5h18M9 12v3h6v-3",
  crew: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 8M19 15a6 6 0 0 1 3 6",
  activity: "M2 12h5l3-8 4 16 3-8h5",
  shield: "m12 2 8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5l8-3Zm-4 10 3 3 5-6",
  leaf: "M20 3C9 1 2 7 5 15c8 5 16-1 15-12ZM3 21 15 9M8 17v-6m0 6h6",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  chevron: "m8 4 8 8-8 8",
  close: "m6 6 12 12M6 18 18 6",
  check: "m5 12 4 4L19 6",
  pause: "M8 5v14M16 5v14",
  play: "m7 4 14 8-14 8V4Z",
  image: "M3 3h18v18H3V3Zm0 13 6-6 5 5 3-3 4 4M16 7h.01",
  archive: "M3 3h18v5H3V3Zm2 5v13h14V8M9 12h6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2",
  link: "m10 14 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 6a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01",
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
