// THE TIME MOVED AFTER THE REVIEW - the decision froze its figures, the
// newest copy reads differently, and the reviewer picks which figure bills.
// Mánu 2026-09-07: "show the card side by side and choosing which one to
// accept for billing time." One block shared by the cards and Focused
// review so the two surfaces can never phrase the choice differently.
import { hrs, span } from "./figures";
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

export default function TimeCompare({ r, busy = false, onPick, onFlag }) {
  const rv = r.review;
  const reviewedFigure = reviewedFigureOf(rv);
  const billedMoved = rv.wasBilledMin !== (r.billedMin ?? null);
  const clockedMoved = (rv.wasClockedMin ?? null) !== (r.clockedMin ?? null);
  const win = reviewedWinOf(rv);
  return (
    <>
      <div className={styles.compare}>
        <div className={styles.side}>
          <div className={styles.sideLabel}>As it was reviewed</div>
          <dl>
            <div className={styles.cmpRow}><dt>Billed</dt><dd>{hrs(rv.wasBilledMin)}</dd></div>
            <div className={styles.cmpRow}><dt>Clocked</dt><dd>{rv.wasClockedMin != null ? hrs(rv.wasClockedMin) : "no row"}</dd></div>
          </dl>
          {rv.billableMin != null && (
            <p className={styles.cmpNote}>
              Corrected to {hrs(rv.billableMin)}{win ? ` (${span(win.from, win.to)})` : ""}.
            </p>
          )}
        </div>
        <div className={`${styles.side} ${styles.sideNew}`}>
          <div className={styles.sideLabel}>Newest copy</div>
          <dl>
            <div className={styles.cmpRow}><dt>Billed</dt>
              <dd className={billedMoved ? styles.cmpMoved : undefined}>
                {r.billedMin != null ? hrs(r.billedMin) : "no figure"}
                {billedMoved && <span className={styles.cmpSub}>was {hrs(rv.wasBilledMin)}</span>}
              </dd>
            </div>
            <div className={styles.cmpRow}><dt>Clocked</dt>
              <dd className={clockedMoved ? styles.cmpMoved : undefined}>
                {r.clockedMin != null ? hrs(r.clockedMin) : "no row"}
                {clockedMoved && (
                  <span className={styles.cmpSub}>was {rv.wasClockedMin != null ? hrs(rv.wasClockedMin) : "no row"}</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div className={styles.pickRow}>
        {reviewedFigure != null && (
          <button type="button" disabled={busy} className={styles.primary} onClick={() => onPick("reviewed")}>
            Bill the reviewed time · {hrs(reviewedFigure)}
          </button>
        )}
        {r.billedMin != null && (
          <button type="button" disabled={busy} className={styles.secondary} onClick={() => onPick("new")}>
            Accept the new time · {hrs(r.billedMin)}
          </button>
        )}
        <button type="button" disabled={busy} className={styles.secondary} onClick={onFlag}>Flag with a reason</button>
        <small>Billing the reviewed time records it as a corrected billable figure, same as the adjust panel.</small>
      </div>
    </>
  );
}
