import type { ReactNode, SVGProps } from "react";

export type AppIconName =
  | "inbox"
  | "contacts"
  | "bot"
  | "book"
  | "megaphone"
  | "chart"
  | "settings"
  | "menu"
  | "close"
  | "logout"
  | "grid"
  | "building"
  | "shield";

type AppIconProps = Omit<SVGProps<SVGSVGElement>, "children" | "name"> & {
  name: AppIconName;
};

export function AppIcon({
  name,
  className = "h-5 w-5",
  ...props
}: AppIconProps) {
  let content: ReactNode;

  switch (name) {
    case "inbox":
      content = (
        <>
          <path d="M4 5.5h16l-2 10H6l-2-10Z" />
          <path d="M6 15.5v3h12v-3M9 11.5h6" />
        </>
      );
      break;
    case "contacts":
      content = (
        <>
          <circle cx="12" cy="9" r="4" />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0M19 9.5a3 3 0 0 1 2.5 3M5 9.5a3 3 0 0 0-2.5 3" />
        </>
      );
      break;
    case "bot":
      content = (
        <>
          <path d="M12 6V3.5" />
          <rect x="4.5" y="7" width="15" height="12" rx="3.5" />
          <path d="M8.5 12h.01M15.5 12h.01M9.5 16h5" />
        </>
      );
      break;
    case "book":
      content = (
        <>
          <path d="M5 4.5h9a3 3 0 0 1 3 3v12H8a3 3 0 0 0-3-3v-12Z" />
          <path d="M5 16.5a3 3 0 0 1 3-3h9" />
        </>
      );
      break;
    case "megaphone":
      content = (
        <>
          <path d="M4 11v3h3l9 4V7l-9 4H4Z" />
          <path d="M7 14v5h3M20 9.5v6" />
        </>
      );
      break;
    case "chart":
      content = (
        <>
          <path d="M5 4.5v15h15" />
          <path d="M8.5 16v-4M13 16V8.5M17.5 16v-6" />
        </>
      );
      break;
    case "settings":
      content = (
        <>
          <circle cx="12" cy="12" r="3.25" />
          <path d="M19.1 13.6a7.8 7.8 0 0 0 0-3.2l2-1.5-2-3.4-2.5 1a8 8 0 0 0-2.7-1.6L13.6 2h-3.2l-.3 2.9a8 8 0 0 0-2.7 1.6l-2.5-1-2 3.4 2 1.5a7.8 7.8 0 0 0 0 3.2l-2 1.5 2 3.4 2.5-1a8 8 0 0 0 2.7 1.6l.3 2.9h3.2l.3-2.9a8 8 0 0 0 2.7-1.6l2.5 1 2-3.4-2-1.5Z" />
        </>
      );
      break;
    case "menu":
      content = <path d="M4 7h16M4 12h16M4 17h16" />;
      break;
    case "close":
      content = <path d="m6 6 12 12M18 6 6 18" />;
      break;
    case "logout":
      content = (
        <>
          <path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" />
        </>
      );
      break;
    case "grid":
      content = (
        <>
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </>
      );
      break;
    case "building":
      content = (
        <>
          <path d="M4 20V6.5A1.5 1.5 0 0 1 5.5 5h7A1.5 1.5 0 0 1 14 6.5V20" />
          <path d="M14 10h4.5A1.5 1.5 0 0 1 20 11.5V20M3 20h18" />
          <path d="M7 8.5h3.5M7 12h3.5M7 15.5h3.5M17 13.5v3" />
        </>
      );
      break;
    case "shield":
      content = (
        <>
          <path d="M12 3.5l7 2.5v5.5c0 4-3 7.2-7 9-4-1.8-7-5-7-9V6l7-2.5Z" />
          <path d="m9.25 12 2 2 3.5-3.5" />
        </>
      );
      break;
  }

  return (
    <svg
      {...props}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {content}
    </svg>
  );
}

export function BrandMark({
  size = "md",
}: {
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm shadow-emerald-950/20 ${
        size === "sm" ? "h-9 w-9 rounded-xl" : "h-10 w-10 rounded-[0.875rem]"
      }`}
      aria-hidden="true"
    >
      <svg
        className={size === "sm" ? "h-5 w-5" : "h-[1.375rem] w-[1.375rem]"}
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M5 5.75h14v9.5H9.2L5 19v-13.25Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9 10.5h.01M12 10.5h.01M15 10.5h.01"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
