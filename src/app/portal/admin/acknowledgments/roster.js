// shared roster logic for the acknowledgments report (summary cards) and the
// per-announcement dedicated page (full list). server-only helpers.
import { preferredName } from "@/lib/contacts";
import { ANNOUNCEMENT_TAG_STYLES } from "@/lib/announcements";

export const PACIFIC = "America/Los_Angeles";
export const DEFAULT_TAG_CLS =
  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";

const slim = (p) => ({ id: p.id, displayName: p.displayName, image: p.image || null });

export function fmtPosted(iso) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}
export function fmtAck(iso) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function audienceLabel(p, expected) {
  if (p.ackEveryone || (!p.ackTitles?.length && !p.ackUserIds?.length)) {
    return `Everyone (${expected})`;
  }
  const bits = [...(p.ackTitles || [])];
  if (p.ackUserIds?.length) {
    bits.push(`${p.ackUserIds.length} ${p.ackUserIds.length === 1 ? "person" : "people"}`);
  }
  return `${bits.join(", ")} (${expected})`;
}

export function firstLine(content) {
  const line = (content || "").split("\n").find((l) => l.trim()) || "Announcement";
  return line.length > 80 ? line.slice(0, 79) + "…" : line;
}

export function tagCls(tag) {
  return ANNOUNCEMENT_TAG_STYLES[tag] || DEFAULT_TAG_CLS;
}

// build the acknowledged / not-yet roster for one announcement. `p.acks` must be
// the ack rows (userId, viaEmail, createdAt).
// OPENED AND SIGNED ARE TWO DIFFERENT STATES. Mánu 2026-08-10: the
// acknowledgment tells you somebody at least opened it; on a post carrying a
// form, the signature is what finishes it. A roster that showed only the tick
// read "done" for people who had read the thing and signed nothing.
//
// `p.submissions` is optional - a post with no form has none, and everything
// below then behaves exactly as it always did.
export function buildAckRoster(p, audienceUsers) {
  const ackByUser = new Map((p.acks || []).map((a) => [a.userId, a]));
  const signedByUser = new Map(
    (p.submissions || []).filter((s) => s.userId).map((s) => [s.userId, s]),
  );
  const needsSignature = !!p.formId;
  const people = audienceUsers.map((u) => {
    const a = ackByUser.get(u.id);
    const sub = signedByUser.get(u.id);
    return {
      signed: !!sub,
      signedId: sub?.id || null,
      signedLabel: sub ? fmtAck(sub.createdAt) : null,
      id: u.id,
      displayName: preferredName(u),
      title: u.title || "",
      image: u.image || null,
      email: u.email || null,
      phone: u.phone || null,
      acked: !!a,
      viaEmail: a?.viaEmail || false,
      dateLabel: a ? fmtAck(a.createdAt) : null,
    };
  });
  const acked = people.filter((x) => x.acked);
  const notYet = people.filter((x) => !x.acked);
  const signed = people.filter((x) => x.signed);
  // read it and stopped there - the state the tick used to hide
  const openedNotSigned = people.filter((x) => x.acked && !x.signed);
  const viaEmail = acked.filter((x) => x.viaEmail).length;
  const expected = people.length;
  const pct = expected > 0 ? Math.round((acked.length / expected) * 100) : 0;

  return {
    people,
    needsSignature,
    signed: signed.length,
    openedNotSigned: openedNotSigned.length,
    acked: acked.length,
    notYet: notYet.length,
    viaEmail,
    inPortal: acked.length - viaEmail,
    expected,
    pct,
    summary: {
      ackedCount: acked.length,
      ackedPeople: acked.map(slim),
      inPortal: acked.length - viaEmail,
      viaEmail,
      notYetCount: notYet.length,
      notYetPeople: notYet.map(slim),
    },
  };
}
