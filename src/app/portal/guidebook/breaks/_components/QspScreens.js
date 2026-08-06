// Replicas of two QSP screens: the punch row pair and the schedule day view.
//
// Two deliberate choices here.
//
// 1. Everything is INLINE styles, not classes in globals.css. That was the first
//    attempt and the stylesheet the browser actually loaded came back without a
//    single one of the rules in it, so the examples rendered as a pile of plain
//    text with a full-page checkmark. Inline styles can't be purged, can't lose
//    a cache race, and can't be reordered, which is what you want for the one
//    part of the page that IS the explanation.
// 2. These don't follow the theme tokens. They're pictures of another app, and a
//    screenshot doesn't turn dark when you flip to Night.
//
// Sizes are in em against the wrapper's own font-size, measured off the real
// screens, so the whole thing scales as one piece and the proportions hold.

const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';

const S = {
  wrap: {
    // sized off the CONTAINER, not the viewport, so the same component reads
    // right whether it's full width or sitting in one half of a two-up. 3.54cqi
    // is the ratio the real screen has between its text and its own width.
    fontSize: "clamp(10px, 3.54cqi, 30px)",
    background: "#f2f2f2",
    padding: "0.66em 0.64em",
    fontFamily: SANS,
    display: "flex",
    flexDirection: "column",
    gap: "1em",
  },
  row: {
    background: "#fff",
    border: "0.04em solid #d2d2d7",
    borderRadius: "0.42em",
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    alignItems: "stretch",
    padding: "0.74em 0.9em 0.66em",
  },
  val: {
    fontSize: "1em",
    lineHeight: 1.16,
    color: "#1d1d1f",
    fontWeight: 400,
    letterSpacing: "-0.012em",
    whiteSpace: "nowrap",
  },
  lab: {
    fontSize: "0.45em",
    lineHeight: 1.2,
    color: "#6e6e73",
    marginTop: "1.35em",
    whiteSpace: "nowrap",
  },
  check: {
    width: "1.3em",
    height: "1.3em",
    // rounded square, not a circle - matches the real control
    borderRadius: "0.4em",
    border: "0.045em solid #3f6fa8",
    display: "inline-grid",
    placeItems: "center",
    margin: "0.3em 0 0.15em",
  },
  tick: { width: "0.66em", height: "0.66em", stroke: "#3f6fa8", fill: "none" },
};

// bottom-aligned so all three labels sit on one baseline even though the middle
// cell is taller. centering the row instead drops the middle label out of line.
function cell(align) {
  return {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    alignItems: align,
  };
}

function Row({ left, leftLabel, mid, midLabel, right, rightLabel, check }) {
  return (
    <div style={S.row}>
      <div style={cell("flex-start")}>
        <div style={S.val}>{left}</div>
        <div style={S.lab}>{leftLabel}</div>
      </div>
      <div style={cell("center")}>
        {check ? (
          <span style={S.check}>
            <svg
              viewBox="0 0 24 24"
              style={S.tick}
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
        ) : (
          <div style={S.val}>{mid}</div>
        )}
        <div style={S.lab}>{midLabel}</div>
      </div>
      <div style={cell("flex-end")}>
        <div style={S.val}>{right}</div>
        <div style={S.lab}>{rightLabel}</div>
      </div>
    </div>
  );
}

export function QspPunch({ out, back }) {
  return (
    // the container query reference. keeps the replica proportional to whatever
    // column it lands in.
    <div style={{ containerType: "inline-size" }}>
      <div style={S.wrap}>
      <Row
        left="8:00 AM"
        leftLabel="Start Time"
        mid="2.0"
        midLabel="Total Hours"
        right="10:00 AM"
        rightLabel="End Time"
      />
      <Row
        left={out}
        leftLabel="Time Out"
        midLabel="Rest Period"
        right={back}
        rightLabel="Time In"
        check
      />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- schedule */

const HOURS = [
  "8:00 AM",
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
];

const SVC = { background: "#faeec4", border: "1px solid #4472a8", color: "#1a1a1a" };
const SVC_2 = { background: "#faeec4", border: "2px solid #1a1a1a", color: "#1a1a1a" };
const TRAVEL = { background: "#ff0000", border: "1px solid #cc0000", color: "#1a1a1a" };
const MEAL = { background: "#8b0000", border: "1px solid #6b0000", color: "#fff" };

// positioned off the same 74px-per-hour grid the rows use, so the picture stays
// honest: 8:00a sits at 0 and every hour after is another 74 down.
const BLOCKS = [
  { top: 0, height: 146, tone: SVC, text: "8A-10A-Client A, R-ILS Service(2)" },
  { top: 148, height: 35, tone: TRAVEL, text: "10A-10:30A–ILS Travel(0.5)" },
  {
    top: 185,
    height: 144,
    tone: SVC_2,
    text: "10:30A-12:30P-Client B, R-ILS Service(2)",
    rest: "11A-11:10A Rest Period(-.2)",
  },
  { top: 333, height: 35, tone: MEAL, text: "12:30P-1P–Meal Break(0.5)" },
  {
    top: 370,
    height: 257,
    tone: SVC,
    text: "1P-4:30P-Client C, R-ILS Service(3.5)",
    rest: "3P-3:10P Rest Period(-.2)",
  },
];

const C = {
  cal: {
    position: "relative",
    background: "#fff",
    border: "1px solid #c9c9c9",
    borderRadius: "0.4rem",
    overflow: "hidden",
    fontFamily: "Arial, Helvetica, sans-serif",
    minWidth: 640,
  },
  gut: {
    width: 100,
    flex: "none",
    background: "#f7f7f7",
    borderRight: "1px solid #d4d4d4",
    fontSize: "0.8rem",
    fontWeight: 700,
    color: "#333",
    textAlign: "right",
    padding: "0.35rem 0.6rem 0 0",
  },
  half: {
    position: "absolute",
    left: 100,
    right: 0,
    top: 37,
    borderTop: "1px solid #f2f2f2",
  },
  blocks: { position: "absolute", left: 100, right: 8, top: 0, bottom: 0 },
  block: {
    position: "absolute",
    left: 0,
    right: 0,
    overflow: "hidden",
    padding: "0.3rem 0.5rem",
    fontSize: "0.8rem",
    lineHeight: 1.45,
  },
};

export function QspSchedule() {
  return (
    <div style={C.cal}>
      {HOURS.map((h, i) => (
        <div
          key={h}
          style={{
            position: "relative",
            height: 74,
            display: "flex",
            borderTop: i === 0 ? "none" : "1px solid #e6e6e6",
          }}
        >
          <div style={C.gut}>{h}</div>
          <div style={C.half} />
        </div>
      ))}
      <div style={C.blocks}>
        {BLOCKS.map((b) => (
          <div
            key={b.top}
            style={{ ...C.block, ...b.tone, top: b.top, height: b.height }}
          >
            {b.text}
            {b.rest ? <span style={{ display: "block" }}>{b.rest}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
