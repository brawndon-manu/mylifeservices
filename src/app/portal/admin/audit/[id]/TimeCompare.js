// THE TIME MOVED AFTER THE REVIEW - the decision froze its figures, the
// newest copy reads differently, and the reviewer picks which figure bills.
// Mánu 2026-09-07: "show the card side by side and choosing which one to
// accept for billing time." One block shared by the cards and Focused
// review so the two surfaces can never phrase the choice differently.
import { hrs, span } from "./figures";
import { billableOf } from "@/lib/timesheet/billable-of";
import styles from "../audit.module.css";

// THE REPORT CAUGHT UP TO THE CORRECTION: the newest copy bills exactly what
// the reviewer corrected it to, so nothing needs asking
export function reviewSettled(r) {
  const rv = r?.review;
  return (
    rv?.billableMin != null
    && rv.billableMin === (r.billedMin ?? null)
    && rv.wasBilledMin != null
    && rv.wasBilledMin !== (r.billedMin ?? null)
  );
}

export function reviewMoved(r) {
  const rv = r?.review;
  return (
    !reviewSettled(r)
    && !!rv
    && rv.wasBilledMin != null
    && (rv.wasBilledMin !== (r.billedMin ?? null) || (rv.wasClockedMin ?? null) !== (r.clockedMin ?? null))
  );
}

// what the reviewer said bills: the correction where one stands, otherwise
// the billed figure the decision froze
export const reviewedFigureOf = (rv) => (rv ? rv.billableMin ?? rv.wasBilledMin : null);

export const reviewedWinOf = (rv) =>
  rv?.billableMin != null && rv.billableFrom != null && rv.billableTo != null
    ? { from: rv.billableFrom, to: rv.billableTo }
    : null;

// `previous` is the reading of the copy before the newest, handed in only when
// the time went away from the reviewed figure and came back (flipReturnOf):
// the reviewed reading and the newest agree then, so the move sits between
// them in a column of its own and the newest reads "was" against it
export default function TimeCompare({ r, busy = false, onPick, onFlag, previous = null }) {
  const rv = r.review;
  const reviewedFigure = reviewedFigureOf(rv);
  const wasBilled = previous ? previous.billedMin : rv.wasBilledMin;
  const wasClocked = previous ? previous.clockedMin : rv.wasClockedMin;
  const billedMoved = (wasBilled ?? null) !== (r.billedMin ?? null);
  const clockedMoved = (wasClocked ?? null) !== (r.clockedMin ?? null);
  const win = reviewedWinOf(rv);
  // one button, not two, when both would bill the same figure
  const newFigure = billableOf({ ...r, review: null }).min;
  const sameFigure = reviewedFigure != null && reviewedFigure === newFigure;
  // WHAT THE REVIEWER HAD RULED - Mánu 2026-09-08: "the as it was reviewed
  // should show if i had approved it or if i have adjusted it. cause i may
  // not always go through them all in between new uploads." The flip keeps
  // the original verdict as the reason's closing sentence; a review that
  // never flipped speaks for itself.
  const verdict = (() => {
    const m = /(Was approved[^.]*\.|Was flagged[^.]*\.|Earlier flag: .*)$/.exec(rv.reason || "");
    if (m) return m[1];
    if (rv.decision === "approved") return `Approved${rv.by ? ` by ${rv.by}` : ""}.`;
    if (rv.decision === "flagged") return `Flagged${rv.by ? ` by ${rv.by}` : ""}.`;
    return null;
  })();
  return (
    <>
      <div className={styles.compare}>
        <div className={styles.side}>
          <div className={styles.sideLabel}>As it was reviewed</div>
          <dl>
            <div className={styles.cmpRow}><dt>Billed</dt><dd>{hrs(rv.wasBilledMin)}</dd></div>
            <div className={styles.cmpRow}><dt>Clocked</dt><dd>{rv.wasClockedMin != null ? hrs(rv.wasClockedMin) : "no row"}</dd></div>
          </dl>
          {(verdict || rv.billableMin != null) && (
            <p className={styles.cmpNote}>
              {verdict}
              {rv.billableMin != null && `${verdict ? " " : ""}Corrected to ${hrs(rv.billableMin)}${win ? ` (${span(win.from, win.to)})` : ""}.`}
            </p>
          )}
        </div>
        {previous && (
          <div className={styles.side}>
            <div className={styles.sideLabel}>Previous copy</div>
            <dl>
              <div className={styles.cmpRow}><dt>Billed</dt><dd>{previous.billedMin != null ? hrs(previous.billedMin) : "no figure"}</dd></div>
              <div className={styles.cmpRow}><dt>Clocked</dt><dd>{previous.clockedMin != null ? hrs(previous.clockedMin) : "no row"}</dd></div>
            </dl>
          </div>
        )}
        <div className={`${styles.side} ${styles.sideNew}`}>
          <div className={styles.sideLabel}>Newest copy</div>
          <dl>
            <div className={styles.cmpRow}><dt>Billed</dt>
              <dd className={billedMoved ? styles.cmpMoved : undefined}>
                {r.billedMin != null ? hrs(r.billedMin) : "no figure"}
                {billedMoved && <span className={styles.cmpSub}>was {wasBilled != null ? hrs(wasBilled) : "no figure"}</span>}
              </dd>
            </div>
            <div className={styles.cmpRow}><dt>Clocked</dt>
              <dd className={clockedMoved ? styles.cmpMoved : undefined}>
                {r.clockedMin != null ? hrs(r.clockedMin) : "no row"}
                {clockedMoved && (
                  <span className={styles.cmpSub}>was {wasClocked != null ? hrs(wasClocked) : "no row"}</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      {previous && <p className={styles.cmpBack}>The newest copy is back to the time that was reviewed.</p>}
      <div className={styles.pickRow}>
        {reviewedFigure != null && !sameFigure && (
          <button type="button" disabled={busy} className={styles.primary} onClick={() => onPick("reviewed")}>
            Bill the reviewed time · {hrs(reviewedFigure)}
          </button>
        )}
        {r.billedMin != null && (
          <button type="button" disabled={busy} className={sameFigure ? styles.primary : styles.secondary} onClick={() => onPick("new")}>
            {/* what bills once the reviewer's own figure is let go: the signed
                amendment where one stands, the roster's figure otherwise */}
            Accept the new time · {hrs(newFigure)}
          </button>
        )}
        <button type="button" disabled={busy} className={styles.secondary} onClick={onFlag}>Flag with a reason</button>
        {!sameFigure && reviewedFigure != null && (
          <small>Billing the reviewed time records it as a corrected billable figure, same as the adjust panel.</small>
        )}
      </div>
    </>
  );
}
