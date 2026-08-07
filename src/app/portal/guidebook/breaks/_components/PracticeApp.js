"use client";

// A practice copy of the QSP phone app, so somebody can record a rest period
// once in a place where getting it wrong costs nothing.
//
// Most staff do this on their phone, so a desktop-shaped demo would be teaching
// the wrong screen. Everything below is drawn from screenshots of the real app:
// the calendar with its dots, the cream shift rows and the dark red meal break,
// the Shift Detail card stack, and the three-column time wheel.
//
// The colours are hardcoded on purpose. This is a picture of another app and it
// must not turn dark when the portal does, exactly like the punch screens
// further up the page.
//
// Nothing is saved anywhere. It is a teaching aid, not a form.
import { useEffect, useRef, useState } from "react";

const DAY = [
  { a: "8:00 AM", b: "10:00 AM", who: "Client A - ILS Service (2.0)" },
  { a: "10:00 AM", b: "10:30 AM", who: "- ILS Travel (0.5)" },
  { a: "10:30 AM", b: "12:30 PM", who: "Client B - ILS Service (2.0)", target: true },
  { a: "12:30 PM", b: "1:00 PM", who: "- Meal Break (0.5)", meal: true },
  { a: "1:00 PM", b: "4:30 PM", who: "Client C - ILS Service (3.5)" },
];

const TASKS = [
  <>
    A full 8 hour day, <b>8:00 AM to 4:30 PM</b>: 7.5 hours of service, 0.5
    travel, and 30 minutes unpaid for lunch. Open the shift that runs{" "}
    <b>10:30 AM to 12:30 PM</b>.
  </>,
  <>
    Tap the <b>Rest Period</b> box to record that you took one.
  </>,
  <>
    It is <b>11:20 AM</b> and you are stepping away. Set your <b>Time Out</b>.
  </>,
  <>
    You are back at <b>11:30 AM</b>. Set your <b>Time In</b>.
  </>,
  <>Have a look at what you entered.</>,
];

const ITEM = 46; // wheel row height, must match the class below
// the phone clock follows the exercise rather than sitting on a fixed time,
// so the screen agrees with what the task is asking for
const CLOCK = ["11:18", "11:18", "11:20", "11:30", "11:30"];
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function toMins(t) {
  const m = /^(\d+):(\d\d)\s(AM|PM)$/.exec(t || "");
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3] === "PM") h += 12;
  return h * 60 + Number(m[2]);
}

// August 2026 opens on a Saturday, so the 1st sits alone on the far right.
// Dots mark booked days; Saturdays and the 31st have none.
function CalendarGrid() {
  const cells = [];
  for (let i = 0; i < 6; i++) cells.push(<div key={`b${i}`} />);
  for (let d = 1; d <= 31; d++) {
    const isSat = (5 + d) % 7 === 6;
    const dot = !isSat && d !== 31 && d !== 6;
    if (d === 6) {
      cells.push(
        <div key={d} className="py-1 text-[0.9rem] text-white">
          <span className="mx-auto grid size-8 place-items-center rounded-full bg-[#1f5fa9]">
            6
          </span>
        </div>,
      );
    } else {
      cells.push(
        <div key={d} className="relative py-1 pb-2 text-[0.9rem]">
          {d}
          {dot && (
            <span className="absolute bottom-0.5 left-1/2 size-[5px] -translate-x-1/2 rounded-full bg-[#2b6cb0]" />
          )}
        </div>,
      );
    }
  }
  return (
    <div className="rounded-lg bg-white p-2 shadow-sm">
      <div className="flex items-center justify-between px-2 pb-2">
        <span className="text-lg font-bold">&laquo;</span>
        <span className="text-[1.02rem]">Aug 2026</span>
        <span className="text-lg font-bold">&raquo;</span>
      </div>
      <div className="grid grid-cols-7 text-center text-[0.82rem] text-[#3c3c43]">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="pb-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 text-center">{cells}</div>
    </div>
  );
}

// Declared out here on purpose. Defined inside the component they would be a
// brand new component type on every render, so React would throw away and
// rebuild the subtree each time instead of updating it.
function Card({ children, className = "" }) {
  return <div className={`mb-2 rounded-xl bg-white p-3 shadow-sm ${className}`}>{children}</div>;
}

function Cell({ v, l, align, onClick, tappable }) {
  return (
    <div className={align}>
      <div
        onClick={onClick}
        className={`text-[1.06rem] ${tappable ? "cursor-pointer rounded hover:bg-[#eef5fd]" : ""}`}
      >
        {/* empty really is empty on the real screen - no dashes, no underline.
            you tap the space and the wheel comes up. */}
        {v || <span className="inline-block h-[1.2em] min-w-[78px]" />}
      </div>
      <div className="mt-0.5 text-[0.72rem] text-[#6e6e73]">{l}</div>
    </div>
  );
}


// Drawn rather than typed. These were emoji codepoints, which meant the browser
// substituted its own glyph: a colour floppy disk, a colour wastebasket, and
// text blocks standing in for signal bars. Emoji ignore the colour you set and
// change shape per platform, so the toolbar never matched the real app on any
// two machines. As SVG they take the same blue and hold their shape.
const BLUE = "#1a73c7";

function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
function IconBack() {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.15rem]" fill="none" stroke={BLUE} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke={BLUE} strokeWidth="2.1" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" className="size-5">
      <path d="M7 2.5v3M17 2.5v3" stroke={BLUE} strokeWidth="2" strokeLinecap="round" />
      <rect x="3" y="4.5" width="18" height="17" rx="2.6" fill={BLUE} />
      {[
        [6.5, 11], [10.7, 11], [14.9, 11],
        [6.5, 15.4], [10.7, 15.4], [14.9, 15.4],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="2.9" height="2.4" rx="0.5" fill="#fff" />
      ))}
    </svg>
  );
}
function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke={BLUE} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6.5h16M9.5 6.5V4.2h5v2.3M6.5 6.5l.9 13.3h9.2l.9-13.3" />
      <path d="M10.3 10.2v6.3M13.7 10.2v6.3" />
    </svg>
  );
}
// the save button in the real toolbar is a solid blue floppy with a white
// shutter and label
function IconSave() {
  return (
    <svg viewBox="0 0 24 24" className="size-5">
      <path d="M4.8 3h11.4L21 7.8V20a1 1 0 0 1-1 1H4.8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" fill={BLUE} />
      <path d="M7.6 3.4h7.1v5.3H7.6z" fill="#fff" />
      <rect x="11.7" y="4.4" width="1.9" height="3.4" rx="0.4" fill={BLUE} />
      <rect x="7" y="13" width="10" height="7.2" rx="0.8" fill="#fff" />
      <path d="M8.7 15h6.6M8.7 17.2h6.6" stroke={BLUE} strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}
function IconSignal() {
  return (
    <svg viewBox="0 0 17 12" className="h-3 w-[17px]" fill="#1c1c1e">
      <rect x="0" y="8" width="3" height="4" rx="1" />
      <rect x="4.6" y="5.5" width="3" height="6.5" rx="1" />
      <rect x="9.2" y="3" width="3" height="9" rx="1" />
      <rect x="13.8" y="0.5" width="3" height="11.5" rx="1" opacity="0.28" />
    </svg>
  );
}
function IconWifi() {
  return (
    <svg viewBox="0 0 16 12" className="h-3 w-4" fill="none" stroke="#1c1c1e" strokeWidth="1.7" strokeLinecap="round">
      <path d="M1.2 3.6a10.6 10.6 0 0 1 13.6 0" />
      <path d="M3.8 6.5a6.7 6.7 0 0 1 8.4 0" />
      <path d="M6.3 9.2a2.8 2.8 0 0 1 3.4 0" />
      <circle cx="8" cy="11" r="0.55" fill="#1c1c1e" stroke="none" />
    </svg>
  );
}
// iOS 16 onwards prints the percentage inside the battery, white on a filled body
function IconBattery({ pct = 85 }) {
  return (
    <svg viewBox="0 0 27 13" className="h-[13px] w-[27px]">
      <rect x="0.6" y="0.6" width="23.8" height="11.8" rx="3.4" fill="#1c1c1e" />
      <path d="M25.4 4.6c1 .3 1.5 1 1.5 1.9s-.5 1.6-1.5 1.9V4.6Z" fill="#1c1c1e" opacity="0.42" />
      <text x="12.5" y="9.5" textAnchor="middle" fontSize="8.2" fontWeight="700" fill="#fff">
        {pct}
      </text>
    </svg>
  );
}

export default function PracticeApp({ employeeName = "Your Name" }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [checked, setChecked] = useState(false);
  const [out, setOut] = useState(null);
  const [inn, setInn] = useState(null);
  const [picking, setPicking] = useState(null); // "out" | "in" | null
  const [wheel, setWheel] = useState({ h: "11", m: "20", p: "AM" });
  const cols = useRef({});
  const initial = useRef({ h: "11", m: "20", p: "AM" });
  const drag = useRef(null);
  const dragged = useRef(false);
  const snapTimer = useRef({});

  // A wheel built while the sheet is hidden has no layout, so scrollTop is
  // silently dropped and every column opens parked on its first value. Set it
  // once the sheet is actually on screen.
  //
  // This reads the snapshot taken when the picker opened, NOT the live value.
  // Keying it to the live value would yank the wheel back under the finger the
  // moment a drag changed the selection.
  useEffect(() => {
    if (!picking) return;
    const put = (key, list, val) => {
      const el = cols.current[key];
      if (el) el.scrollTop = Math.max(0, list.indexOf(val)) * ITEM;
    };
    put("h", HOURS, initial.current.h);
    put("m", MINUTES, initial.current.m);
    put("p", ["AM", "PM"], initial.current.p);
  }, [picking]);

  // Whatever ends up sitting in the grey band is the value. Called after a drag
  // and after a mouse wheel stops, so the two agree.
  function settle(key, list) {
    const el = cols.current[key];
    if (!el) return;
    const i = Math.max(0, Math.min(list.length - 1, Math.round(el.scrollTop / ITEM)));
    el.scrollTo({ top: i * ITEM, behavior: "smooth" });
    setWheel((w) => (w[key] === list[i] ? w : { ...w, [key]: list[i] }));
  }

  // Drag with the mouse the way a thumb drags on a phone. Pointer events cover
  // mouse and touch together, so this is the same code path on both.
  function onDown(e, key) {
    const el = cols.current[key];
    if (!el) return;
    drag.current = { key, y: e.clientY, top: el.scrollTop };
    dragged.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onMove(e, key) {
    const d = drag.current;
    if (!d || d.key !== key) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 3) dragged.current = true;
    cols.current[key].scrollTop = d.top - dy;
  }
  function onUp(key, list) {
    if (!drag.current || drag.current.key !== key) return;
    drag.current = null;
    settle(key, list);
  }
  function onScroll(key, list) {
    clearTimeout(snapTimer.current[key]);
    snapTimer.current[key] = setTimeout(() => {
      if (!drag.current) settle(key, list);
    }, 130);
  }

  function reset() {
    setStep(0);
    setChecked(false);
    setOut(null);
    setInn(null);
    setPicking(null);
  }

  function startPicking(which) {
    const start = { h: "11", m: which === "out" ? "20" : "30", p: "AM" };
    initial.current = start;
    setWheel(start);
    setPicking(which);
  }

  function confirmPick() {
    const v = `${wheel.h}:${wheel.m} ${wheel.p}`;
    if (picking === "out") {
      setOut(v);
      if (step === 2) setStep(3);
    } else {
      setInn(v);
      if (step === 3) setStep(4);
    }
    setPicking(null);
  }

  const verdict = (() => {
    if (!out || !inn) return null;
    const o = toMins(out);
    const i = toMins(inn);
    const gap = i - o;
    if (o === 700 && i === 710)
      return {
        tone: "ok",
        head: "That is right.",
        body: "Out at 11:20, back in at 11:30. Time Out is the earlier time, Time In is the later one, and the gap is ten minutes. Payroll reads this as a rest period taken.",
      };
    if (gap < 0)
      return {
        tone: "bad",
        head: "These are the wrong way round.",
        body: `You put ${out} as Time Out and ${inn} as Time In, which reads as coming back before you left. Time cannot run that way, so the break does not count and the day looks like a missed rest period. This is the most common mistake we see. Left is when you stop. Right is when you start again.`,
      };
    if (gap === 0)
      return {
        tone: "warn",
        head: "Both times are the same.",
        body: "That records a break with no length to it. Your ten needs a start and an end ten minutes apart.",
      };
    if (gap !== 10)
      return {
        tone: "warn",
        head: `Right order, but that is ${gap} minutes.`,
        body: "The order is correct, which is the part most people get wrong. A rest period is ten minutes though, so from 11:20 it reads 11:30.",
      };
    return {
      tone: "warn",
      head: "Ten minutes, in the right order.",
      body: "The mechanics are right. On this shift you stepped away at 11:20, so it would read 11:20 out and 11:30 in.",
    };
  })();

  const VTONE = {
    ok: "border-emerald-800 bg-emerald-950/60 text-emerald-300",
    bad: "border-rose-900 bg-rose-950/60 text-rose-300",
    warn: "border-amber-800 bg-amber-950/60 text-amber-300",
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-bold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:bg-accent dark:text-[#06232f]"
      >
        <span aria-hidden="true">📱</span> Open the practice app
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Practice recording a rest period"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        >
          <div className="flex min-h-full flex-col items-center gap-4 px-4 py-6 pb-16">
            <div className="flex w-full max-w-3xl items-start justify-between gap-4">
              <div>
                <p className="text-base leading-relaxed text-white">
                  <span className="mr-2 inline-block min-w-6 rounded-full bg-[#38b6ef] px-1.5 py-0.5 text-center text-xs font-bold text-[#06232f]">
                    {Math.min(step + 1, 5)}
                  </span>
                  {TASKS[Math.min(step, 4)]}
                </p>
                <div className="mt-2 flex gap-1.5">
                  {TASKS.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1 w-6 rounded-full ${
                        i < step ? "bg-[#38b6ef]/60" : i === step ? "bg-[#38b6ef]" : "bg-white/25"
                      }`}
                    />
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close the practice app"
                className="grid size-9 flex-none place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
              >
                ✕
              </button>
            </div>

            {/* the phone */}
            <div className="w-[393px] max-w-full flex-none rounded-[3.2rem] bg-[#0b0b0d] p-[11px] shadow-2xl ring-2 ring-[#2a2a2e]">
              <div className="relative flex h-[760px] flex-col overflow-hidden rounded-[2.55rem] bg-[#f2f2f7] text-[#1c1c1e] [font-family:-apple-system,BlinkMacSystemFont,'Segoe_UI',Helvetica,Arial,sans-serif]">
                <div className="relative flex h-[54px] flex-none items-center bg-white px-6 text-[0.86rem] font-semibold">
                  <span>{CLOCK[Math.min(step, 4)]}</span>
                  <span className="absolute left-1/2 top-[11px] h-9 w-[125px] -translate-x-1/2 rounded-full bg-black" />
                  <span className="ml-auto flex items-center gap-1.5">
                    <IconSignal />
                    <IconWifi />
                    <IconBattery pct={85} />
                  </span>
                </div>

                <div className="flex flex-none items-center gap-4 border-b border-[#d8d8dc] bg-white px-4 pb-2 pt-2">
                  {step === 0 ? (
                    <>
                      <IconMenu />
                      <IconBack />
                      <span className="flex-1 text-center text-[1.05rem] font-bold">
                        {employeeName}
                      </span>
                      <IconPlus />
                      <IconCalendar />
                    </>
                  ) : (
                    <>
                      <IconBack />
                      <IconTrash />
                      <span className="flex-1 text-center text-[1.05rem] font-bold">
                        Shift Detail
                      </span>
                      <IconSave />
                    </>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  {step === 0 ? (
                    <>
                      <CalendarGrid />
                      <div className="mt-3 overflow-hidden rounded-lg shadow-sm">
                        {DAY.map((s, i) => (
                          <div
                            key={i}
                            onClick={() => {
                              if (s.target && step === 0) setStep(1);
                            }}
                            className={`flex border-b border-[#e6e6ea] bg-white last:border-b-0 ${
                              s.target
                                ? "cursor-pointer shadow-[inset_0_0_0_2px_#1a73c7]"
                                : "cursor-default"
                            }`}
                          >
                            <div
                              className={`w-[138px] flex-none px-2.5 py-2 text-[0.82rem] leading-relaxed ${
                                s.meal ? "bg-[#8b1a1a] text-white" : "bg-[#f7edc9]"
                              }`}
                            >
                              6th - {s.a}
                              <br />
                              6th - {s.b}
                            </div>
                            <div className="flex flex-1 items-center px-3 py-2 text-[0.85rem]">
                              {s.who}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <Card>
                        <div className="grid grid-cols-3 items-end">
                          <Cell v="Client B" l="Client Name" align="text-left" />
                          <div />
                          <Cell v="ILS Service" l="Service Type" align="text-right" />
                        </div>
                      </Card>
                      <p className="mb-2 ml-0.5 text-[0.85rem] text-[#d0021b]">
                        Authorization Remaining: 0
                      </p>
                      <Card>
                        <div className="grid grid-cols-3 items-end">
                          <Cell v="10:30 AM" l="Start Time" align="text-left" />
                          <Cell v="2.0" l="Total Hours" align="text-center" />
                          <Cell v="12:30 PM" l="End Time" align="text-right" />
                        </div>
                      </Card>
                      <Card>
                        <div className="grid grid-cols-3 items-end">
                          <Cell
                            v={out}
                            l="Time Out"
                            align="text-left"
                            tappable={checked}
                            onClick={() => checked && startPicking("out")}
                          />
                          <div className="text-center">
                            <span
                              onClick={() => {
                                if (step === 1) {
                                  setChecked(true);
                                  setStep(2);
                                }
                              }}
                              className={`inline-grid size-[2.15rem] cursor-pointer place-items-center rounded-[0.66rem] border-[1.5px] border-[#2f6fb0] ${
                                step === 1 ? "animate-pulse" : ""
                              }`}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`size-4 fill-none stroke-[#2f6fb0] stroke-[2.1] ${
                                  checked ? "" : "invisible"
                                }`}
                              >
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            </span>
                            <div className="mt-0.5 text-[0.72rem] text-[#6e6e73]">Rest Period</div>
                          </div>
                          <Cell
                            v={inn}
                            l="Time In"
                            align="text-right"
                            tappable={checked}
                            onClick={() => checked && startPicking("in")}
                          />
                        </div>
                      </Card>
                      <Card>
                        <div className="grid grid-cols-3 items-end">
                          <Cell v="8/6/2026" l="Start Date" align="text-left" />
                          <div />
                          <Cell v="8/6/2026" l="End Date" align="text-right" />
                        </div>
                      </Card>
                      <Card>
                        <div className="text-[1.06rem]">{employeeName}</div>
                        <div className="mt-0.5 text-[0.72rem] text-[#6e6e73]">Employee Name</div>
                      </Card>
                      <Card className="flex items-center justify-between">
                        <span className="text-[1.06rem]">Add Mileage</span>
                        <span className="text-[#1a73c7]">&#9662;</span>
                      </Card>
                      {["Schedule Notes", "Service Notes"].map((n) => (
                        <Card key={n}>
                          <div className="h-14" />
                          <div className="flex items-center justify-between">
                            <span className="text-[0.72rem] text-[#6e6e73]">{n}</span>
                            <span className="text-[0.78rem] text-[#1a73c7] underline">
                              Full screen view
                            </span>
                          </div>
                        </Card>
                      ))}
                      <Card>
                        <div className="flex items-center justify-between">
                          <span className="text-[0.72rem] text-[#6e6e73]">Objective</span>
                          <span className="rounded bg-[#1f5fa9] px-2 py-1 text-[0.8rem] font-semibold text-white">
                            ＋Add
                          </span>
                        </div>
                        <p className="mt-1 text-center text-[0.78rem] text-[#8e8e93]">
                          No Objectives found
                        </p>
                      </Card>
                    </>
                  )}
                </div>

                <div className="grid h-6 flex-none place-items-center bg-[#f2f2f7]">
                  <span className="h-[5px] w-[134px] rounded-full bg-[#1c1c1e]/85" />
                </div>

                {picking && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[2.55rem] bg-black/35">
                    <div className="w-[268px] overflow-hidden rounded-xl bg-white shadow-2xl">
                      <div className="relative grid h-[322px] grid-cols-3 px-2">
                        <span className="pointer-events-none absolute inset-x-2 top-[138px] h-[46px] rounded-md bg-[#ececec]" />
                        {[
                          ["h", HOURS],
                          ["m", MINUTES],
                          ["p", ["AM", "PM"]],
                        ].map(([key, list]) => (
                          <div
                            key={key}
                            ref={(el) => (cols.current[key] = el)}
                            onPointerDown={(e) => onDown(e, key)}
                            onPointerMove={(e) => onMove(e, key)}
                            onPointerUp={() => onUp(key, list)}
                            onPointerCancel={() => onUp(key, list)}
                            onScroll={() => onScroll(key, list)}
                            className="relative z-10 cursor-grab touch-none select-none overflow-y-auto overscroll-contain text-center active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                          >
                            <div className="h-[138px]" />
                            {list.map((v) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => {
                                  // a drag ends in a click too; ignore that one
                                  if (dragged.current) return;
                                  setWheel((w) => ({ ...w, [key]: v }));
                                  cols.current[key]?.scrollTo({
                                    top: list.indexOf(v) * ITEM,
                                    behavior: "smooth",
                                  });
                                }}
                                className={`block h-[46px] w-full text-[1.45rem] leading-[46px] ${
                                  wheel[key] === v ? "text-[#1c1c1e]" : "text-[#c2c2c7]"
                                }`}
                              >
                                {v}
                              </button>
                            ))}
                            <div className="h-[138px]" />
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={confirmPick}
                        className="w-full py-3 text-[1.05rem] font-medium text-[#00b140]"
                      >
                        OK
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {verdict && (
              <div className={`w-full max-w-3xl rounded-xl border p-4 text-sm leading-relaxed ${VTONE[verdict.tone]}`}>
                <b className="mb-1 block">{verdict.head}</b>
                <span className="text-[#e7e8ec]">{verdict.body}</span>
              </div>
            )}
            {verdict && (
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-white/25 px-4 py-2 text-sm text-white hover:bg-white/10"
              >
                Start over
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
