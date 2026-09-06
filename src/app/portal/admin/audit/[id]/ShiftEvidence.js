import { span, hrs, clockedFigure, punchEnd, ampmLabel, minsWords } from "./figures";
import styles from "../audit.module.css";

export default function ShiftEvidence({ row }) {
  const original = row.clockAvailable && row.inClockExport !== false && row.originalFrom != null && row.originalTo != null;
  const from = original ? row.originalFrom : row.schedFrom;
  const to = original ? row.originalTo : row.schedTo;
  const scheduled = from != null && to != null;
  const clocked = clockedFigure(row);
  const correction = row.review?.billableMin;
  const note = row.note;
  return <div className={styles.evidence}>
    <dl className={styles.times}>
      <div><dt>Scheduled</dt><dd className={styles.figureValue}>{scheduled ? hrs(to - from) : "—"}</dd>
        {scheduled && <dd className={styles.figureSub}>{span(from, to)}{!original && " · calendar"}</dd>}
      </div>
      <div><dt>Billed</dt><dd className={styles.figureValue}>
        {correction != null ? <><span className={styles.original}>{hrs(row.billedMin)}</span><span className={styles.corrected}>{hrs(correction)}</span></> : hrs(row.billedMin)}
      </dd><dd className={styles.figureSub}>{correction != null ? `${minsWords(correction)} · corrected${row.review?.by ? ` by ${row.review.by}` : ""}` : span(row.schedFrom, row.schedTo)}</dd></div>
      <div><dt>Clocked</dt><dd className={`${styles.figureValue} ${clocked.tone ? styles.figureText : ""} ${clocked.tone === "bad" ? styles.bad : ""}`}>{clocked.value}</dd>
        {clocked.sub && <dd className={styles.figureSub}>{clocked.sub}</dd>}
      </div>
    </dl>
    <dl className={styles.checks}>
      <div><dt>Clock</dt>
        {!row.clockAvailable ? <dd className={styles.figureSub}>No clock export for this period.</dd> : row.inClockExport === false ? <dd className={styles.figureSub}>No matching row in the clock export.</dd> : <>
          <Punch row={row} end="in" /><Punch row={row} end="out" />
          {row.sharedSession && <dd className={styles.figureSub}>One session {ampmLabel(row.sharedSession.from)}–{ampmLabel(row.sharedSession.to)} across {row.sharedSession.parts} bookings.</dd>}
        </>}
      </div>
      <div><dt>Note</dt>
        {note?.source === "dsn" ? <>
          <dd className={styles.noteValue}><span className={styles.noteTag}>DSN</span>{note.words} words</dd>
          {!row.scheduleNote && <dd className={styles.figureSub}>No schedule note</dd>}
        </> : <>
          <dd className={styles.bad}><strong>No DSN</strong></dd>
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
