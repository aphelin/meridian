import type { SVGProps } from "react";

const paths = {
  search: <><circle cx="11" cy="11" r="6.25" /><path d="m20 20-4.4-4.4" /></>,
  user: <><circle cx="12" cy="8.5" r="3.75" /><path d="M4.75 20c.9-3.6 3.8-5.5 7.25-5.5s6.35 1.9 7.25 5.5" /></>,
  heart: <path d="M12 19.5s-7.25-4.3-7.25-9.6A4.15 4.15 0 0 1 12 7.4a4.15 4.15 0 0 1 7.25 2.5c0 5.3-7.25 9.6-7.25 9.6Z" />,
  bag: <><path d="M5.25 8.25h13.5l-1 11.5H6.25l-1-11.5Z" /><path d="M8.75 10.5V7.25a3.25 3.25 0 0 1 6.5 0v3.25" /></>,
  menu: <><path d="M4 8h16" /><path d="M4 16h16" /></>,
  close: <><path d="m6.5 6.5 11 11" /><path d="m17.5 6.5-11 11" /></>,
  plus: <><path d="M12 5.5v13" /><path d="M5.5 12h13" /></>,
  minus: <path d="M5.5 12h13" />,
  arrowRight: <><path d="M4.5 12h15" /><path d="m13.5 6 6 6-6 6" /></>,
  arrowLeft: <><path d="M19.5 12h-15" /><path d="m10.5 6-6 6 6 6" /></>,
  chevronDown: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  info: <><circle cx="12" cy="12" r="8.25" /><path d="M12 11v5" /><path d="M12 7.9v.1" /></>,
  alert: <><circle cx="12" cy="12" r="8.25" /><path d="M12 7.75v5" /><path d="M12 16.1v.1" /></>,
  eye: <><path d="M2.75 12S6.25 5.75 12 5.75 21.25 12 21.25 12 17.75 18.25 12 18.25 2.75 12 2.75 12Z" /><circle cx="12" cy="12" r="2.75" /></>,
  eyeOff: <><path d="M9.9 6c.68-.16 1.38-.25 2.1-.25C17.75 5.75 21.25 12 21.25 12a15.6 15.6 0 0 1-2.4 3.1" /><path d="M6.3 7.6C3.95 9.2 2.75 12 2.75 12S6.25 18.25 12 18.25c1.6 0 3-.48 4.2-1.2" /><path d="m4 4 16 16" /></>,
  sliders: <><path d="M4 7h9" /><path d="M17 7h3" /><circle cx="15" cy="7" r="2" /><path d="M4 17h3" /><path d="M11 17h9" /><circle cx="9" cy="17" r="2" /></>,
  package: <><path d="m12 3.25 7.75 4.25v9L12 20.75 4.25 16.5v-9L12 3.25Z" /><path d="m4.5 7.6 7.5 4.15 7.5-4.15" /><path d="M12 11.75v9" /></>,
  copy: <><rect x="8.75" y="8.75" width="11" height="11" rx="2.5" /><path d="M15.25 5.75v-.5a1.5 1.5 0 0 0-1.5-1.5h-8.5a1.5 1.5 0 0 0-1.5 1.5v8.5a1.5 1.5 0 0 0 1.5 1.5h.5" /></>,
  logout: <><path d="M14.25 4.75h3.5a1.5 1.5 0 0 1 1.5 1.5v11.5a1.5 1.5 0 0 1-1.5 1.5h-3.5" /><path d="M10.5 16.25 14.75 12 10.5 7.75" /><path d="M14.5 12H4.75" /></>,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 22, filled, ...rest }: { name: IconName; size?: number; filled?: boolean } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
