// WHAT A SHIFT BILLS, DECIDED ONCE.
//
// three figures can claim the billable minutes of one shift: the roster's
// billed figure, the reviewer's corrected figure, and the window an approved
// clock amendment was signed for. every roll-up, report and card used to read
// "the reviewer's correction, else the billed figure" in its own words, seven
// times over, and an amendment would have had to be added seven times.
//
// the order: a correction and an amendment are both statements about the
// same minutes, and the later one wins, because whoever made it had the other
// in front of them. a review that corrected nothing defers to the amendment.
// with neither, the roster's billed figure stands.
//
// import-free: client components sum with it and node --test reads it.
const ms = (v) => {
  const n = Date.parse(v || "");
  return Number.isFinite(n) ? n : 0;
};

export function billableOf(r) {
  const rv = r?.review || null;
  const am = r?.amendment || null;
  const fromReview = rv?.billableMin != null;
  const fromAmendment = !!am?.timesChanged && am?.min != null;
  const review = () => ({
    min: rv.billableMin,
    from: rv.billableFrom ?? null,
    to: rv.billableTo ?? null,
    source: "review",
    by: rv.by || null,
    byLegal: rv.byLegal || null,
    at: rv.lastAt || rv.at || null,
  });
  const amendment = () => ({
    min: am.min,
    from: am.from ?? null,
    to: am.to ?? null,
    source: "amendment",
    by: am.by || null,
    byLegal: am.byLegal || null,
    at: am.at || null,
  });
  if (fromReview && fromAmendment) return ms(rv.lastAt || rv.at) >= ms(am.at) ? review() : amendment();
  if (fromReview) return review();
  if (fromAmendment) return amendment();
  return {
    min: r?.billedMin ?? null,
    from: r?.schedFrom ?? null,
    to: r?.schedTo ?? null,
    source: "billed",
    by: null,
    byLegal: null,
    at: null,
  };
}

export const billableMinOf = (r) => billableOf(r).min;

// a figure somebody set, as opposed to the roster's own
export const isAdjusted = (r) => billableOf(r).source !== "billed";

// the word a document prints beside a figure somebody set
export const adjustedWord = (r) => (billableOf(r).source === "amendment" ? "by addendum" : "adjusted");
