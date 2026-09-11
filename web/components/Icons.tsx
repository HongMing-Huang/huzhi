// 知乎式线性图标（stroke 1.8，24 网格），替代 emoji 去除"AI 味"。
interface IconProps {
  size?: number;
  className?: string;
}

const base = (size = 20) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IconFeed = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
    <path d="M7.5 9h9M7.5 12.5h9M7.5 16h5.5" />
  </svg>
);

export const IconFire = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3c1 3-2.5 4.5-2.5 7.5a4.5 4.5 0 0 0 9 .2C19.5 6.5 15 5.5 12 3Z" />
    <path d="M9.5 20.5h5" />
  </svg>
);

export const IconUsers = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" />
    <circle cx="16.8" cy="9.5" r="2.4" />
    <path d="M16.5 14.6c2 .3 3.5 1.6 4 3.9" />
  </svg>
);

export const IconMask = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 6.5C6.5 8 9.2 8.4 12 8.4S17.5 8 20 6.5c.4 4.6-.6 11-8 11s-8.4-6.4-8-11Z" />
    <path d="M8.5 11.5c.8.8 2 .8 2.8 0M12.8 11.5c.8.8 2 .8 2.8 0" />
  </svg>
);

export const IconChat = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M20 11.5c0 4-3.6 7-8 7-1 0-2-.2-2.9-.5L4.5 19.5l1.2-3.4C4.6 15 4 13.3 4 11.5c0-4 3.6-7 8-7s8 3 8 7Z" />
  </svg>
);

export const IconRobot = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="5" y="8" width="14" height="10" rx="3" />
    <path d="M12 8V4.5M9.5 13h.01M14.5 13h.01M9.5 15.8h5" />
    <circle cx="12" cy="3.5" r="1" />
  </svg>
);

export const IconBag = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M5.5 8.5h13l-.8 10a2 2 0 0 1-2 1.8H8.3a2 2 0 0 1-2-1.8l-.8-10Z" />
    <path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" />
  </svg>
);

export const IconUser = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 19.5c1-3.5 3.8-5.2 7-5.2s6 1.7 7 5.2" />
  </svg>
);

export const IconSearch = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.4-4.4" />
  </svg>
);

export const IconBell = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15L6 16Z" />
    <path d="M10 21h4" />
  </svg>
);

export const IconPlus = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconAgree = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 4.5 5.5 11v8a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-8L12 4.5Z" />
  </svg>
);

export const IconComment = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M8.5 5.5h7a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4H12l-3.5 3v-3H8a4 4 0 0 1-4-4v-3a4 4 0 0 1 4-3.5h.5Z" />
  </svg>
);

export const IconStar = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L12 4Z" />
  </svg>
);

export const IconEye = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);

export const IconDice = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="4" y="4" width="16" height="16" rx="3.5" />
    <circle cx="9" cy="9" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="15" cy="15" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="15" cy="9" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="9" cy="15" r="1.15" fill="currentColor" stroke="none" />
  </svg>
);

export const IconBolt = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12L13 3Z" />
  </svg>
);

export const IconFlag = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M6 21V4.5" />
    <path d="M6 5h11.5l-2.5 3.5 2.5 3.5H6" />
  </svg>
);

export const IconInfo = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 7.8h.01" />
  </svg>
);
