const baseProps = {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  "aria-hidden": "true",
};

export function PhoneIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...baseProps} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.911 3.852a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 5.25v1.5Z"
      />
    </svg>
  );
}

export function EnvelopeIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...baseProps} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
      />
    </svg>
  );
}

export function MapPinIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...baseProps} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
      />
    </svg>
  );
}

export function ClockIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...baseProps} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

export function ArrowRightIcon({ className = "h-4 w-4" }) {
  return (
    <svg {...baseProps} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// program + careers icons. same stroke language as the homepage bento icons so
// the whole site reads as one set.
// ---------------------------------------------------------------------------
const strokeProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

// day program categories ----------------------------------------------------

// skill development: a rising bar chart, progress you can see
export function SkillsIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...strokeProps} className={className}>
      <path d="M4 20h16" />
      <path d="M7 20v-5M12 20V9M17 20v-8" />
    </svg>
  );
}

// social + peer engagement: two people
export function PeopleIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...strokeProps} className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6" />
      <path d="M17.5 19a5.5 5.5 0 0 0-2.2-4.4" />
    </svg>
  );
}

// community-based: a map pin out in the world
export function CommunityIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...strokeProps} className={className}>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

// pre-vocational: a work bag
export function BriefcaseIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...strokeProps} className={className}>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      <path d="M3 12.5h18" />
    </svg>
  );
}

// health + wellness: a pulse line
export function PulseIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...strokeProps} className={className}>
      <path d="M3 12.5h4l2-5 3 10 2.5-7 1.5 2H21" />
    </svg>
  );
}

// individual goal progression: a target
export function TargetIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...strokeProps} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

// careers -------------------------------------------------------------------

// you see the progress: an upward trend
export function TrendIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...strokeProps} className={className}>
      <path d="M3 16.5l5.5-5.5 3.5 3.5L21 6" />
      <path d="M15.5 6H21v5.5" />
    </svg>
  );
}

// real relationships: a handshake-ish clasp
export function HandshakeIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...strokeProps} className={className}>
      <path d="M3 13.5l3.5-3.5a2 2 0 0 1 2.8 0L12 12.7l2.7-2.7a2 2 0 0 1 2.8 0L21 13.5" />
      <path d="M8.5 15.5L11 18a1.8 1.8 0 0 0 2.5 0l2.5-2.5" />
    </svg>
  );
}

// no two days the same: a compass, always moving
export function RouteIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...strokeProps} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </svg>
  );
}

// work that's needed: a steady hand holding something up
export function SupportIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...strokeProps} className={className}>
      <circle cx="12" cy="6.5" r="2.5" />
      <path d="M12 9.5v6" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

// work settings (the role matcher) ------------------------------------------

// one person at a time: a single person
export function PersonIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...strokeProps} className={className}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

// leading a group: a person in front of a group
export function GroupIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...strokeProps} className={className}>
      <circle cx="7" cy="8" r="2.4" />
      <circle cx="17" cy="8" r="2.4" />
      <circle cx="12" cy="6.5" r="2.6" />
      <path d="M3 19a4 4 0 0 1 8 0M13 19a4 4 0 0 1 8 0" />
    </svg>
  );
}

// helping someone run their own plan: a checklist they own
export function PlanIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...strokeProps} className={className}>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2" />
      <path d="M8.5 9l1.5 1.5L13 7.5" />
      <path d="M8.5 15h7" />
    </svg>
  );
}

// showing up when it's hard: a shield
export function ShieldIcon({ className = "h-5 w-5" }) {
  return (
    <svg {...strokeProps} className={className}>
      <path d="M12 3l7 3v5.5c0 4.3-3 8-7 9.5-4-1.5-7-5.2-7-9.5V6z" />
      <path d="M9.5 12l1.8 1.8 3.4-3.6" />
    </svg>
  );
}
