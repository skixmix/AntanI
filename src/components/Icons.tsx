import opencodePng from "../assets/opencode.png";

interface IconProps {
  size?: number;
  className?: string;
}

/** Real Claude / Anthropic logomark (from Wikimedia Commons) */
export function AnthropicIcon({ size = 14, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="hsl(14.8,63.1%,59.6%)"
      aria-hidden="true"
      className={className}
    >
      <path d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z" />
    </svg>
  );
}

export function CodexIcon({ size = 14, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="146 226 268 267"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M249.176 323.434V298.276C249.176 296.158 249.971 294.569 251.825 293.509L302.406 264.381C309.29 260.409 317.5 258.555 325.973 258.555C357.75 258.555 377.877 283.185 377.877 309.399C377.877 311.253 377.877 313.371 377.611 315.49L325.178 284.771C322.001 282.919 318.822 282.919 315.645 284.771L249.176 323.434ZM367.283 421.415V361.301C367.283 357.592 365.694 354.945 362.516 353.092L296.048 314.43L317.763 301.982C319.617 300.925 321.206 300.925 323.058 301.982L373.639 331.112C388.205 339.586 398.003 357.592 398.003 375.069C398.003 395.195 386.087 413.733 367.283 421.412V421.415ZM233.553 368.452L211.838 355.742C209.986 354.684 209.19 353.095 209.19 350.975V292.718C209.19 264.383 230.905 242.932 260.301 242.932C271.423 242.932 281.748 246.641 290.49 253.26L238.321 283.449C235.146 285.303 233.555 287.951 233.555 291.659V368.455L233.553 368.452ZM280.292 395.462L249.176 377.985V340.913L280.292 323.436L311.407 340.913V377.985L280.292 395.462ZM300.286 475.968C289.163 475.968 278.837 472.259 270.097 465.64L322.264 435.449C325.441 433.597 327.03 430.949 327.03 427.239V350.445L349.011 363.155C350.865 364.213 351.66 365.802 351.66 367.922V426.179C351.66 454.514 329.679 475.965 300.286 475.965V475.968ZM237.525 416.915L186.944 387.785C172.378 379.31 162.582 361.305 162.582 343.827C162.582 323.436 174.763 305.164 193.563 297.485V357.861C193.563 361.571 195.154 364.217 198.33 366.071L264.535 404.467L242.82 416.915C240.967 417.972 239.377 417.972 237.525 416.915ZM234.614 460.343C204.689 460.343 182.71 437.833 182.71 410.028C182.71 407.91 182.976 405.792 183.238 403.672L235.405 433.863C238.582 435.715 241.763 435.715 244.938 433.863L311.407 395.466V420.622C311.407 422.742 310.612 424.331 308.758 425.389L258.179 454.519C251.293 458.491 243.083 460.343 234.611 460.343H234.614ZM300.286 491.854C332.329 491.854 359.073 469.082 365.167 438.892C394.825 431.211 413.892 403.406 413.892 375.073C413.892 356.535 405.948 338.529 391.648 325.552C392.972 319.991 393.766 314.43 393.766 308.87C393.766 271.003 363.048 242.666 327.562 242.666C320.413 242.666 313.528 243.723 306.644 246.109C294.725 234.457 278.307 227.042 260.301 227.042C228.258 227.042 201.513 249.815 195.42 280.004C165.761 287.685 146.694 315.49 146.694 343.824C146.694 362.362 154.638 380.368 168.938 393.344C167.613 398.906 166.819 404.467 166.819 410.027C166.819 447.894 197.538 476.231 233.024 476.231C240.172 476.231 247.058 475.173 253.943 472.788C265.859 484.441 282.278 491.854 300.286 491.854Z" />
    </svg>
  );
}

/** Real VS Code icon (simple-icons path) */
export function VSCodeIcon({ size = 14, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" />
    </svg>
  );
}

/** Close/X glyph */
export function CloseIcon({ size = 14, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 3l10 10M13 3L3 13" />
    </svg>
  );
}

/** Terminal chevron icon. `blink` pulses the underscore, signaling a job is
 *  running in the foreground (as opposed to the shell sitting at a prompt). */
export function TerminalIcon({
  size = 14,
  className = "",
  blink = false,
}: IconProps & { blink?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" className={blink ? "terminal-cursor-blink" : ""} />
    </svg>
  );
}

/** Generic file icon, tinted via currentColor for git status coloring */
export function FileIcon({ size = 13, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 1.5h5.5L13 5v9a.5.5 0 0 1-.5.5h-8A.5.5 0 0 1 4 14V2a.5.5 0 0 1 0-.5Z" />
      <path d="M9.5 1.5V5H13" />
    </svg>
  );
}

/** Folder-tree expand/collapse chevron; rotate via className for expanded state */
export function ChevronRightIcon({ size = 12, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <polyline points="6 3 11 8 6 13" />
    </svg>
  );
}

export function PlusIcon({ size = 12, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function MinusIcon({ size = 12, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 8h10" />
    </svg>
  );
}

/** Discard/revert — a counter-clockwise "undo" arrow */
export function DiscardIcon({ size = 12, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 8a5 5 0 1 1 1.6 3.7" />
      <path d="M3 4v4h4" />
    </svg>
  );
}

/** Source control toggle — a simplified git-branch glyph */
export function SourceControlIcon({ size = 14, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="4" cy="3" r="1.6" />
      <circle cx="4" cy="13" r="1.6" />
      <circle cx="12" cy="8" r="1.6" />
      <path d="M4 4.6V11.4M4 7a5 5 0 0 0 5 3.6h1.4" />
    </svg>
  );
}

/** Git branch glyph, used to label the current branch in the source control header */
export function BranchIcon({ size = 12, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="4" cy="3" r="1.6" />
      <circle cx="4" cy="13" r="1.6" />
      <circle cx="12" cy="6" r="1.6" />
      <path d="M4 4.6V11.4M12 7.6V9a3 3 0 0 1-3 3H8" />
    </svg>
  );
}

/** Folder glyph for the "Projects" sidebar header */
export function ProjectsIcon({ size = 13, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M1.5 4.2c0-.7.6-1.2 1.2-1.2h3l1.2 1.5h6.4c.7 0 1.2.6 1.2 1.2v6.1c0 .7-.6 1.2-1.2 1.2H2.7c-.7 0-1.2-.6-1.2-1.2V4.2Z" />
    </svg>
  );
}

/** Wrench glyph — used for the Settings entry point */
export function WrenchIcon({ size = 13, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M11.3 2.3a3 3 0 0 0-4.1 3.6L2.6 10.5a1.4 1.4 0 0 0 2 2l4.6-4.6a3 3 0 0 0 3.6-4.1l-2 2-1.4-.4-.4-1.4 2-2z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Bolt glyph — shared icon for every per-project custom quick-access command,
 *  tinted per-command via a wrapping element's `color` (uses currentColor). */
export function CustomCommandIcon({ size = 13, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M8.8 1.2 3.2 9h3.4l-.9 5.8 6-8.2H8.2l.6-5.4Z" />
    </svg>
  );
}

/** Chat bubble with a sparkle — marks an AI prompt injectable, distinct from
 *  the bolt used for launchable custom commands. */
export function PromptIcon({ size = 13, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M2.5 4a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 13.5 4v4.5A1.5 1.5 0 0 1 12 10H6.5l-3 2.5V10H4A1.5 1.5 0 0 1 2.5 8.5V4Z" />
      <path
        d="M8 4.3 8.7 6l1.7.7-1.7.7L8 9.1l-.7-1.7L5.6 6.7 7.3 6 8 4.3Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/** Terminal window with an arrow dropping into it — marks a terminal snippet
 *  injectable, hinting the text is pushed into the terminal. */
export function InjectIcon({ size = 13, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="1.8" y="5" width="12.4" height="9" rx="1.4" />
      <path d="M4.4 8 6.3 9.7 4.4 11.4" />
      <path d="M8 1.2v4M6.3 3.5 8 5.2 9.7 3.5" />
    </svg>
  );
}

/** Pencil glyph — used for "Rename" menu entries */
export function PencilIcon({ size = 13, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M10.8 2.3a1.4 1.4 0 0 1 2 2L4.5 12.6l-2.8.7.7-2.8 8.4-8.2Z" />
      <path d="M9.3 3.8 12.2 6.7" />
    </svg>
  );
}

/** Paint palette glyph — used for "Change color" menu entries */
export function PaletteIcon({ size = 13, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M8 1.5a6.3 6.3 0 1 0 0 12.6c1 0 1.5-.6 1.5-1.4 0-.4-.2-.7-.4-1-.2-.3-.4-.6-.4-1 0-.7.6-1.2 1.3-1.2h1.2c1.6 0 2.8-1.2 2.8-2.8 0-3-2.8-5.2-6-5.2Z" />
      <circle cx="4.7" cy="7" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="4.3" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="9.8" cy="4.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Trash-can glyph — used for destructive "Remove"/"Delete" menu entries */
export function TrashIcon({ size = 13, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M2.5 4.2h11" />
      <path d="M5.3 4.2V3a1 1 0 0 1 1-1h3.4a1 1 0 0 1 1 1v1.2" />
      <path d="M4.2 4.2 5 13a1 1 0 0 0 1 .9h4a1 1 0 0 0 1-.9l.8-8.8" />
      <path d="M6.7 6.8v4.4M9.3 6.8v4.4" />
    </svg>
  );
}

/** OpenCode — PNG raster logo */
export function OpenCodeIcon({ size = 14, className = "" }: IconProps) {
  return (
    <img
      src={opencodePng}
      width={size}
      height={size}
      alt="OpenCode"
      aria-hidden
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
