// HOW THE ALL-EMPLOYEES LIST IS ORDERED.
//
// Mánu 2026-08-22: "we need a filtering system in the all employee views.
// default by last names, add in by first name, by amount of premiums, by amount
// of etc etc."
//
// Last name stays the default because it already was one: the query orders on
// `sourceName`, and QSP writes every name "Last, First", so the list has always
// come back alphabetical by surname. Naming it as a choice rather than leaving
// it implicit is the point - a list with a sort control that opens on an
// unlabelled order makes people wonder what they are looking at.
//
// EVERY ORDER IS TOTAL. Each comparator falls through to surname, so two people
// on 3.00 premium hours come back in the same order every render. Without that
// the list reshuffles under somebody mid-scroll on a screen two people use at
// once, and a row that moved for no reason reads as a row that changed.

// "Adams, Taylor" -> { last: "Adams", first: "Taylor" }. A name with no comma is
// all surname, which is what the fallbacks want: an unmatched export spelling
// sorts among the surnames rather than to one end.
export function splitSourceName(name) {
  const s = String(name || "").trim();
  const i = s.indexOf(",");
  if (i < 0) return { last: s, first: "" };
  return { last: s.slice(0, i).trim(), first: s.slice(i + 1).trim() };
}

// how many findings on this person are about how the schedule was built. Read
// off the tags rather than recomputed, so it cannot disagree with the chips
// printed on the same row.
export function schedulingCount(tags) {
  return (tags || []).reduce((n, t) => (t.tone === "scheduling" ? n + (t.n || 0) : n), 0);
}

const byLast = (a, b) => {
  const x = splitSourceName(a.who);
  const y = splitSourceName(b.who);
  return x.last.localeCompare(y.last) || x.first.localeCompare(y.first);
};

// biggest first, then surname. `desc` exists because "by amount of" always
// means most-first: nobody opens this list to find who has the fewest.
const byNumber = (pick) => (a, b) => (pick(b) || 0) - (pick(a) || 0) || byLast(a, b);

export const SORTS = {
  name: {
    label: "Last name",
    hint: "A to Z by surname, the way the export prints them.",
    compare: byLast,
  },
  first: {
    label: "First name",
    hint: "A to Z by the name you would call them.",
    compare: (a, b) => {
      const x = splitSourceName(a.who);
      const y = splitSourceName(b.who);
      return x.first.localeCompare(y.first) || x.last.localeCompare(y.last);
    },
  },
  premium: {
    label: "Premium hours",
    hint: "Most owed first.",
    compare: byNumber((p) => p.premium),
  },
  raise: {
    label: "Things to raise",
    hint: "Most questions to put to a person first.",
    compare: byNumber((p) => p.toRaise),
  },
  scheduling: {
    label: "Scheduling",
    hint: "Most bookings over the cap or rostered over each other.",
    compare: byNumber((p) => schedulingCount(p.tags)),
  },
  hours: {
    label: "Hours worked",
    hint: "Longest period first.",
    compare: byNumber((p) => p.paid),
  },
};

export const DEFAULT_SORT = "name";

// what the URL asked for, or the default. An unknown key is the default rather
// than an error: a stale link should show the list, not a screen about itself.
export function sortKeyFrom(value) {
  return Object.hasOwn(SORTS, String(value)) ? String(value) : DEFAULT_SORT;
}

// a NEW array, never sorted in place - the caller's list is also what the
// summary strip counts, and reordering it under them is the kind of shared
// mutation nobody goes looking for.
export function sortPeople(people, key) {
  return [...(people || [])].sort(SORTS[sortKeyFrom(key)].compare);
}
