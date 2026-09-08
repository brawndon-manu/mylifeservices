// THE CLIENT'S DAY, DRAWN THE WAY CALENDAR DRAWS A CONFLICT - Mánu
// 2026-09-08, picking variant C: side-by-side event blocks in a small day
// column, hour lines behind them, and an amber band across the stretch the
// client is billed twice. The drawing is a picture of what the finding
// already says in words, so it hides behind a disclosure and carries
// aria-hidden; the sentence underneath does the talking for everyone else.
//
// Color discipline per the UI gate (docs/ui-gate.md): the blocks are neutral
// fill - the ONLY color is the band, and it means "booked twice".
import { ampmLabel, hrs } from "./figures";
import styles from "../audit.module.css";

const PX_PER_HOUR = 56;

export default function OverlapDay({ row }) {
  const partners = row.overlapPartners || [];
  if (!partners.length || row.schedFrom == null || row.schedTo == null) return null;
  const lanes = [
    { who: row.who, from: row.schedFrom, to: row.schedTo },
    ...partners.map((p) => ({ who: p.who, from: p.schedFrom, to: p.schedTo })),
  ];
  const gridFrom = Math.floor(Math.min(...lanes.map((l) => l.from)) / 60) * 60;
  const gridTo = Math.ceil(Math.max(...lanes.map((l) => l.to)) / 60) * 60;
  const y = (m) => ((m - gridFrom) / 60) * PX_PER_HOUR;
  const height = y(gridTo);
  // label every hour, every second hour once the day stretches past six
  const step = gridTo - gridFrom > 6 * 60 ? 120 : 60;
  const hours = [];
  for (let h = gridFrom; h <= gridTo; h += step) hours.push(h);

  // the stretches billed twice: each partner's intersection with this shift,
  // merged so bordering intersections read as one band
  const cuts = partners
    .map((p) => [Math.max(row.schedFrom, p.schedFrom), Math.min(row.schedTo, p.schedTo)])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const bands = [];
  for (const [a, b] of cuts) {
    const last = bands[bands.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else bands.push([a, b]);
  }
  const twiceMin = bands.reduce((n, [a, b]) => n + (b - a), 0);

  const cols = lanes.length;
  const width = (100 - 3 * (cols - 1)) / cols;

  return (
    <>
      <div className={styles.overlapDay} aria-hidden="true">
        <div className={styles.overlapGutter}>
          {hours.map((h) => (
            <span key={h} style={{ top: y(h) }}>{ampmLabel(h).replace(":00", "")}</span>
          ))}
        </div>
        <div className={styles.overlapGrid} style={{ height }}>
          {hours.map((h) => <span key={h} className={styles.overlapHour} style={{ top: y(h) }} />)}
          {bands.map(([a, b], i) => (
            <span key={i} className={styles.overlapBand} style={{ top: y(a), height: y(b) - y(a) }} />
          ))}
          {lanes.map((l, i) => (
            <div
              key={i}
              className={styles.overlapEv}
              style={{ top: y(l.from), height: Math.max(30, y(l.to) - y(l.from)), left: `${i * (width + 3)}%`, width: `${width}%` }}
            >
              <p>{l.who}</p>
              <p>{ampmLabel(l.from)} - {ampmLabel(l.to)}</p>
            </div>
          ))}
        </div>
      </div>
      <p className={styles.overlapTwice}>
        <b>Booked twice</b>{" "}
        {bands.map(([a, b]) => `${ampmLabel(a)} - ${ampmLabel(b)}`).join(", ")} · {hrs(twiceMin)}
      </p>
    </>
  );
}
