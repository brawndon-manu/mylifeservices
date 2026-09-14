import { splitSourceName } from "./people-sort.js";

const clean = (value) => String(value || "").trim().replace(/\s+/g, " ");
const searchable = (value) => clean(value).normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("en-US").replace(/,/g, " ");
const collator = new Intl.Collator("en-US", { sensitivity: "base", numeric: true });

export function payoutNameParts(who, sourceName) {
  const legal = clean(who);
  if (legal.includes(",")) return splitSourceName(legal);
  // The export's explicit surname preserves compound family names when it
  // matches the legal name. It never replaces the account's legal spelling.
  const source = splitSourceName(sourceName);
  if (source.first && legal.toLocaleLowerCase().endsWith(` ${source.last.toLocaleLowerCase()}`)) {
    return { first: legal.slice(0, -source.last.length).trim(), last: legal.slice(-source.last.length) };
  }
  const [first = "", ...rest] = legal.split(" ");
  return { first, last: rest.join(" ") };
}

export function payoutDisplayName(row, order = "first") {
  const { first, last } = payoutNameParts(row.who, row.sourceName);
  return order === "last" ? [last, first].filter(Boolean).join(", ") : [first, last].filter(Boolean).join(" ");
}

export function visiblePayoutRows(rows, query = "", order = "first") {
  const terms = searchable(query).split(/\s+/).filter(Boolean);
  const parts = new Map(rows.map((row) => [row, payoutNameParts(row.who, row.sourceName)]));
  return rows.filter((row) => {
    const text = searchable([row.who, row.preferred, row.sourceName].join(" "));
    return terms.every((term) => text.includes(term));
  }).sort((a, b) => {
    const x = parts.get(a), y = parts.get(b);
    const primary = order === "last" ? "last" : "first";
    const secondary = order === "last" ? "first" : "last";
    return collator.compare(x[primary] || x[secondary], y[primary] || y[secondary])
      || collator.compare(x[secondary], y[secondary])
      || collator.compare(a.id, b.id);
  });
}
