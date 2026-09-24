import { CircleAlert } from "lucide-react";
import { span, hrs, clock, clockedFigure, punchEnd, ampmLabel, minsWords } from "./figures";
import { filedParts } from "@/lib/timesheet/note-filed";
import { billableOf } from "@/lib/timesheet/billable-of";
import styles from "../audit.module.css";

// "3.00" big with a small quiet "h" beside it - Mánu 2026-09-06, off his
// mock: "have the h small like this next to the hours." Prose figures
// ("not clocked", "no clock export") pass through whole.
function FigureHours({ value }) {
  const m = /^(\d+\.\d{2})h$/.exec(String(value ?? ""));
  return m ? <>{m[1]}<span className={styles.unit}>h</span></> : value;
}

export default function ShiftEvidence({ row }) {
  const original = row.clockAvailable && row.inClockExport !== false && row.originalFrom != null && row.originalTo != null;
  const from = original ? row.originalFrom : row.schedFrom;
  const to = original ? row.originalTo : row.schedTo;
  const scheduled = from != null && to != null;
  const clocked = clockedFigure(row);
  // what bills: the reviewer's correction, the signed amendment, or the roster
  const billable = billableOf(row);
  const set = billable.source !== "billed";
  const setTone = billable.source === "amendment" ? styles.amended : styles.corrected;
  const setWord = billable.source === "amendment" ? "addendum" : "corrected";
  const note = row.note;
  return <div className={styles.evidence}>
    <dl className={styles.times}>
      <div><dt>Scheduled</dt><dd className={styles.figureValue}>{scheduled ? <FigureHours value={hrs(to - from)} /> : "—"}</dd>
        {scheduled && <dd className={styles.figureSub}>{span(from, to)}{!original && " · calendar"}</dd>}
      </div>
      <div><dt>Billed</dt><dd className={styles.figureValue}>
        {/* a correction the newest copy has caught up to is the same number
            twice - print it once rather than striking a figure through
            itself */}
        {set && billable.min !== row.billedMin ? <><span className={styles.original}><FigureHours value={hrs(row.billedMin)} /></span><span className={setTone}><FigureHours value={hrs(billable.min)} /></span></> : <FigureHours value={hrs(row.billedMin)} />}
      </dd><dd className={styles.figureSub}>{set
        // the window the figure was set as leads where there is one; otherwise
        // the figure in words, and never the word "null" on a round figure
        ? <>{billable.from != null && billable.to != null
          ? span(billable.from, billable.to)
          : minsWords(billable.min) || hrs(billable.min)} · <span className={setTone}>{setWord}{billable.by ? ` by ${billable.by}` : ""}</span></>
        : span(row.schedFrom, row.schedTo)}</dd></div>
      <div><dt>Clocked</dt>
        {/* what the export recorded, and only that: the addendum shows on the
            Billed figure and on the line under the punches, never here */}
        <dd className={`${styles.figureValue} ${clocked.tone ? styles.figureText : ""} ${clocked.tone === "bad" ? styles.bad : ""}`}><FigureHours value={clocked.value} /></dd>
        {clocked.sub && <dd className={styles.figureSub}>{clocked.sub}</dd>}
      </div>
    </dl>
    <dl className={styles.checks}>
      <div><dt>Clock</dt>
        {!row.clockAvailable ? <dd className={styles.figureSub}>No clock export for this period.</dd> : row.inClockExport === false ? <dd className={styles.figureSub}>No matching row in the clock export.</dd> : <>
          <Punch row={row} end="in" /><Punch row={row} end="out" />
          {row.sharedSession && <dd className={styles.figureSub}>One session {ampmLabel(row.sharedSession.from)}–{ampmLabel(row.sharedSession.to)} across {row.sharedSession.parts} bookings.</dd>}
          {row.amendment && <AmendedLine a={row.amendment} />}
          {!row.amendment && row.pending && <PendingLine p={row.pending} />}
        </>}
      </div>
      <div><dt>Note</dt>
        {note?.source === "dsn" ? <>
          <dd className={styles.noteValue}><span className={styles.noteTag}>DSN</span>{note.words} words</dd>
          <Filed note={note} on={row.date} />
          {!row.scheduleNote && <dd className={styles.figureSub}>No schedule note</dd>}
        </> : <>
          <dd className={styles.bad}><strong className="inline-flex items-center gap-1.5"><CircleAlert size={14} aria-hidden="true" /> No DSN</strong></dd>
          {!note && <dd className={styles.bad}>No service note</dd>}
          {!row.scheduleNote && <dd className={styles.bad}>No schedule note</dd>}
          {note && <dd className={styles.figureSub}>{note.words} words · service note</dd>}
          {row.scheduleNote && !note && <dd className={styles.figureSub}>Schedule note only</dd>}
        </>}
      </div>
    </dl>
    <p className={styles.legend}>Scheduled: QSP booking · Billed: timesheet hours · Clocked: recorded punches</p>
  </div>;
}

// WHEN THE NOTE WAS FILED, on the face of the card rather than only inside
// the fold-out - Mánu 2026-09-14: "i want to add signed at under note DSN x
// words".
//
// THE DAY IS RED WHEN IT APPEARS, because it only appears when the note was
// filed on some day other than the shift's - 3 of 661 on the current period.
//
// THE DAY IS PRINTED ONLY WHEN IT IS NOT THE SHIFT'S OWN. Measured on the
// current period: 658 of 661 DSN notes were signed on the day of the shift
// they describe, so printing the date every time is noise on 99.5% of cards
// and the whole story on the other three.
//
// Guarded, because a line reading "Filed" with nothing after it says
// something untrue. Only the DSN export carries a signature at all; the
// supervisor .xls sets all three fields to null on purpose. It says FILED and
// not signed because the export's Signature column is blank on all 661 - see
// note-filed.js.
function Filed({ note, on }) {
  const f = filedParts(note, on);
  if (!f) return null;
  return <dd className={styles.figureSub}>
    Filed{" "}
    {f.date && <><span
      className={f.otherDay ? styles.bad : undefined}
      title={f.otherDay ? "Filed on a different day from the shift" : undefined}
    >{f.date}</span>{f.time ? " " : ""}</>}
    {f.time}
  </dd>;
}

function Punch({ row, end }) {
  const punch = punchEnd(row, end);
  return <dd className={styles.punch}>
    <span>{end}</span><Mark value={punch.mark} label={`Clock ${end}`} /><span>{punch.time || "—"}</span><span>GPS</span><Mark value={punch.gps} label={`${end} GPS`} />
  </dd>;
}
function Mark({ value, label }) {
  const description = value === "yes" ? "recorded" : value === "no" ? "missing" : "unavailable";
  return <span aria-label={`${label}: ${description}`} title={`${label}: ${description}`} className={value === "yes" ? styles.good : value === "no" ? styles.bad : undefined}>{value === "yes" ? "✓" : value === "no" ? "✕" : "—"}</span>;
}

// WHAT THE AMENDMENT CHANGED, in one line under the punches, and the form it
// came from. the punch lines above keep saying what the export holds: the
// signature is the record of the visit, not a punch the phone caught.
function AmendedLine({ a }) {
  const parts = [];
  if (a.inChanged && a.from != null) parts.push(`Clock-in ${clock(a.from)} by addendum`);
  if (a.outChanged && a.to != null) parts.push(`Clock-out ${clock(a.to)} by addendum`);
  if (!parts.length) {
    parts.push(
      a.placeIn && a.placeOut ? "Where they were at both punches attested"
        : a.placeIn ? "Where they were at clock-in attested"
          : a.placeOut ? "Where they were at clock-out attested"
            : "Addendum on the clock record",
    );
  }
  return <dd className={styles.amendedLine}>
    {parts.join(", ")}{a.signedBy ? `, signed by ${a.signedBy}` : ""} · <a href={a.form}>open the form</a>
  </dd>;
}

// AN AMENDMENT OUT FOR THE SHIFT AND NOT YET APPROVED: when it went, to whom,
// where it stands in the queue's own words, and the form. nothing about the
// figures, because nothing has been signed off yet.
const mdyOf = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
};
function PendingLine({ p }) {
  const line = String(p.line || "").replace(/^./, (c) => c.toLowerCase());
  return <dd className={styles.amendedLine}>
    Addendum{p.sentAt ? ` sent ${mdyOf(p.sentAt)}` : ""}{p.to ? ` to ${p.to}` : ""}{line ? `, ${line}` : ""} · <a href={p.form}>open the form</a>
  </dd>;
}
