// WHAT MOVED SINCE THE PREVIOUS AUDIT COPY - Mánu 2026-09-05, designing the
// daily upload rhythm: "the only thing that changes on new uploads is if
// there is ANY change from the one before regarding hour changes then there
// should be a changes category. if any additioanl notes get added then mark
// those as changes too."
//
// And 2026-09-06, opening the September rhythm: "if new service, schedule,
// or DSN changes and there was already a flag or approval or edited time
// then flag those for adjusted after already reviewed and say what changed.
// do the same for if the time for either have changed. flag as well if note
// has disapeared! or if entire shifts have disapeared." So the diff now
// reads in both directions - a note shrinking or vanishing is a change the
// same as one arriving - it says what moved in words, it keeps the identity
// of every shift that left the upload, and adjustedAfterReviewPlan turns
// the ones somebody had already ruled on back into flags.
//
// And 2026-09-07, splitting notes from times for the daily rhythm: a note
// ADDED or EDITED on a decided shift no longer flips it - it goes to the New
// notes ledger (noteChangesPlan) where it waits to be marked seen. A note
// that disappears still flips, and so does any time move - except the one
// where the billed figure lands exactly on the reviewer's own corrected
// billable, which is the report catching up to him, not a change to chase.
//
// The diff is scoped to the dates BOTH copies cover: a day the old copy never
// reached is new territory, not a change - the Not-decided pile catches it.

const dayKey = (d) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(d || "");
  return m ? Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]) : 0;
};

const hrs = (m) => (m == null ? "none" : `${(m / 60).toFixed(2)}h`);
const noteName = (n) => (n?.source === "dsn" ? "DSN note" : "service note");

// the change sentences for one shift both copies hold, or [] when nothing
// moved. Written once here so the card line, the stored diff and the
// re-flag reason can never phrase the same change three ways.
//
// Beside the kinds and words it also hands back:
//   figures    - which time figures moved, structured, so the flip plan can
//                tell "the report caught up to the correction" from a real move
//   noteEvents - the note ADDITIONS and EDITS alone (never disappearances),
//                each with its kind, for the New notes ledger
function changesBetween(prev, r) {
  const kinds = new Set();
  const words = [];
  const figures = { billed: null, clocked: null };
  const noteEvents = [];
  if ((r.billedMin ?? null) !== (prev.billedMin ?? null)) {
    kinds.add("hours");
    figures.billed = { from: prev.billedMin ?? null, to: r.billedMin ?? null };
    words.push(`billed ${hrs(prev.billedMin)} -> ${hrs(r.billedMin)}`);
  }
  if ((r.clockedMin ?? null) !== (prev.clockedMin ?? null)) {
    kinds.add("hours");
    figures.clocked = { from: prev.clockedMin ?? null, to: r.clockedMin ?? null };
    words.push(`clocked ${hrs(prev.clockedMin)} -> ${hrs(r.clockedMin)}`);
  }
  if (!prev.note && r.note) {
    kinds.add("note");
    const w = `${noteName(r.note)} added (${r.note.words || 0} words)`;
    words.push(w);
    noteEvents.push({ kind: "service", detail: w });
  } else if (prev.note && !r.note) {
    kinds.add("note-gone");
    words.push(`${noteName(prev.note)} gone (was ${prev.note.words || 0} words)`);
  } else if (prev.note && r.note) {
    const grewOrShrank = (r.note.words || 0) !== (prev.note.words || 0);
    const reworded = (r.note.summary || "") !== (prev.note.summary || "");
    if (grewOrShrank) {
      kinds.add("note");
      const w = `${noteName(r.note)} changed (${prev.note.words || 0} -> ${r.note.words || 0} words)`;
      words.push(w);
      noteEvents.push({ kind: "service", detail: w });
    } else if (reworded) {
      kinds.add("note");
      const w = `${noteName(r.note)} reworded`;
      words.push(w);
      noteEvents.push({ kind: "service", detail: w });
    }
  }
  const prevSn = prev.scheduleNote?.text || null;
  const newSn = r.scheduleNote?.text || null;
  if (!prevSn && newSn) {
    kinds.add("note");
    words.push("schedule note added");
    noteEvents.push({ kind: "schedule", detail: "schedule note added" });
  } else if (prevSn && !newSn) {
    kinds.add("note-gone");
    words.push("schedule note gone");
  } else if (prevSn && newSn && prevSn !== newSn) {
    kinds.add("note");
    words.push("schedule note changed");
    noteEvents.push({ kind: "schedule", detail: "schedule note changed" });
  }
  return { kinds: [...kinds], words, figures, noteEvents };
}

// pure: the change map between two audit builds' rows. `overlap` is the
// from/to both copies cover. Returns
//   changed - shiftKey -> kinds ("new" | "hours" | "note" | "note-gone"),
//             the shape the Changed chip has read since 09/05
//   details - shiftKey -> one plain sentence of what moved
//   gone    - the shifts the old copy held on shared days that the new one
//             does not, each with enough identity to be shown and re-flagged
//   figures - shiftKey -> which time figures moved, structured (not stored
//             on the batch; the flip plan reads it at upload)
//   noteEvents - shiftKey -> the note additions/edits alone, for the ledger
export function diffAuditRows(oldRows, newRows, overlap) {
  const from = dayKey(overlap.from);
  const to = dayKey(overlap.to);
  const inScope = (r) => {
    const k = dayKey(r.date);
    return k >= from && k <= to;
  };
  const byKey = new Map(oldRows.filter(inScope).map((r) => [r.shiftKey, r]));
  const changed = {};
  const details = {};
  const gone = [];
  const figures = {};
  const noteEvents = {};
  const seen = new Set();
  for (const r of newRows) {
    if (!inScope(r)) continue;
    seen.add(r.shiftKey);
    const prev = byKey.get(r.shiftKey);
    if (!prev) {
      changed[r.shiftKey] = ["new"];
      details[r.shiftKey] = "appeared on a day the previous copy already covered";
      continue;
    }
    const found = changesBetween(prev, r);
    if (found.kinds.length) {
      changed[r.shiftKey] = found.kinds;
      details[r.shiftKey] = found.words.join("; ");
      figures[r.shiftKey] = found.figures;
      if (found.noteEvents.length) noteEvents[r.shiftKey] = found.noteEvents;
    }
  }
  for (const [k, prev] of byKey) {
    if (seen.has(k)) continue;
    gone.push({
      shiftKey: k,
      who: prev.who,
      whoLegal: prev.whoLegal || prev.who,
      date: prev.date,
      client: prev.client || null,
      service: prev.service || null,
      billedMin: prev.billedMin ?? null,
      schedFrom: prev.schedFrom ?? null,
      schedTo: prev.schedTo ?? null,
    });
  }
  return { changed, details, gone, figures, noteEvents };
}

// A DECIDED SHIFT WHOSE FACTS MOVED GOES BACK IN THE FLAGGED PILE, wearing
// what changed. Pure: hand it the diff and the reviews standing on those
// keys, it hands back the review updates to write. The reviewer's original
// verdict survives inside the reason as its closing sentence, and a shift
// that changes again on a later upload gets a fresh opening sentence with
// the same closing carried forward rather than reasons nesting inside
// reasons.
const AUTO_OPENERS = /^Auto: (changed after review|gone from the latest upload|back in the upload)/;

function contextOf(review) {
  const by = review.decidedBy?.name ? ` by ${review.decidedBy.name}` : "";
  if (AUTO_OPENERS.test(review.reason || "")) {
    // a previous flip: keep the closing sentence it already carries
    const m = /(Was approved.*|Was flagged.*|Earlier flag:.*)$/.exec(review.reason);
    if (m) return m[1];
  }
  if (review.decision === "approved") return `Was approved${by}.`;
  if (review.reason) return `Earlier flag: "${review.reason}"`;
  return `Was flagged${by}.`;
}

export function adjustedAfterReviewPlan({ changed = {}, details = {}, gone = [], figures = {} }, reviews) {
  const flips = [];
  const byKey = new Map((reviews || []).map((r) => [r.shiftKey, r]));
  for (const [key, kinds] of Object.entries(changed)) {
    const review = byKey.get(key);
    if (!review) continue;
    // A NOTE MERELY ARRIVING OR GROWING NO LONGER FLIPS THE DECISION - Mánu
    // 2026-09-07: "if its just new notes added in then it would be just to
    // show me that its new but i still need to see it." Those land in the
    // New notes ledger instead (noteChangesPlan below); a note VANISHING
    // still flips, and so does any time move.
    const serious = kinds.filter((k) => k !== "note");
    if (!serious.length) continue;
    // THE REPORT CAUGHT UP TO THE CORRECTION. When the only serious move is
    // the billed figure landing exactly on the reviewer's corrected billable,
    // the office fixed QSP to what he already ruled - his words: "if my
    // adjusted time is now the newer report time then good." The decision and
    // the correction stand; the card says so quietly.
    const f = figures[key];
    if (
      serious.every((k) => k === "hours")
      && review.billableMin != null
      && f?.billed && f.billed.to === review.billableMin
      && !f.clocked
    ) continue;
    const what = kinds.includes("new")
      ? "back in the upload after it was reviewed as gone"
      : details[key] || "the export moved it";
    const opener = kinds.includes("new")
      ? "Auto: back in the upload."
      : `Auto: changed after review (${what}).`;
    flips.push({ shiftKey: key, reason: `${opener} ${contextOf(review)}` });
  }
  for (const g of gone) {
    const review = byKey.get(g.shiftKey);
    if (!review) continue;
    flips.push({
      shiftKey: g.shiftKey,
      reason: `Auto: gone from the latest upload. ${contextOf(review)}`,
    });
  }
  return flips;
}

// THE NEW NOTES LEDGER - one row per note that arrived or changed on a shift
// somebody had already ruled on. Pure: hand it the diff's noteEvents, the new
// rows and the standing reviews; it hands back the rows to record. The
// upload writes them into AuditNoteChange, where they stay until marked seen.
export function noteChangesPlan({ noteEvents = {} }, newRows, reviews) {
  const byKey = new Map((reviews || []).map((r) => [r.shiftKey, r]));
  const rowByKey = new Map((newRows || []).map((r) => [r.shiftKey, r]));
  const out = [];
  for (const [key, events] of Object.entries(noteEvents)) {
    const review = byKey.get(key);
    if (!review) continue;
    const r = rowByKey.get(key);
    if (!r) continue;
    for (const e of events) {
      out.push({
        shiftKey: key,
        employeeKey: r.employeeKey || "",
        kind: e.kind,
        detail: e.detail,
        who: r.who,
        whoLegal: r.whoLegal || r.who,
        date: r.date,
        client: r.client || null,
        billedMin: r.billedMin ?? null,
        clockedMin: r.clockedMin ?? null,
        decision: review.decision,
      });
    }
  }
  return out;
}

// the shared days of two period ranges, or null when they never touch
export function periodOverlap(a, b) {
  const from = dayKey(a.from) >= dayKey(b.from) ? a.from : b.from;
  const to = dayKey(a.to) <= dayKey(b.to) ? a.to : b.to;
  return dayKey(from) <= dayKey(to) ? { from, to } : null;
}
