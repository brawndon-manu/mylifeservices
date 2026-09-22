// SEVERAL FORMS TO SIGN ON ONE POST.
//
// A post used to carry one signable form (`formId`). The September 2026
// training series asks for two attestations from the same announcement, so
// the rest now ride in `extraFormIds`, and a person is finished only when
// every one of them carries their submission. `formId` stays the first, so
// everything that only ever read it - the email wording, the roster's
// "needs a signature" flag, the old links - keeps reading it.
//
// DEPENDENCY-FREE ON PURPOSE, like announcement-attachments.js. Every door
// that decides "signed, or still owed" goes through here: the feed, the post
// page, the emailed link, the chase cron, the audit. One rule, testable alone.

// the forms this post asks to be signed, in the order the author picked them.
// each once, and never a blank.
export function signFormIds(post) {
  const raw = [post?.formId, ...(Array.isArray(post?.extraFormIds) ? post.extraFormIds : [])];
  const out = [];
  for (const id of raw) {
    if (typeof id === "string" && id && !out.includes(id)) out.push(id);
  }
  return out;
}

// `submissions` are this post's rows, { userId, formId, createdAt? }. Returns
// the people who have signed EVERY form, each mapped to { createdAt }: the
// moment their last outstanding form landed, which is when they finished. A
// post with nothing to sign finishes nobody here - that is the ack's job.
export function signedAllByUser(post, submissions) {
  const ids = signFormIds(post);
  const done = new Map();
  if (!ids.length) return done;
  const byUser = new Map();
  for (const s of submissions || []) {
    if (!s || typeof s.userId !== "string" || !s.userId || !s.formId) continue;
    if (!byUser.has(s.userId)) byUser.set(s.userId, new Map());
    const forms = byUser.get(s.userId);
    const at = s.createdAt ? new Date(s.createdAt) : null;
    const prev = forms.get(s.formId);
    // the EARLIEST copy of a form is when it was signed; sending it again
    // later does not move the date
    if (!forms.has(s.formId) || (at && prev && at < prev)) forms.set(s.formId, at);
  }
  for (const [userId, forms] of byUser) {
    if (!ids.every((id) => forms.has(id))) continue;
    let last = null;
    for (const id of ids) {
      const at = forms.get(id);
      if (at && (!last || at > last)) last = at;
    }
    done.set(userId, { createdAt: last });
  }
  return done;
}

// the forms one person still owes on this post, in signing order
export function unsignedFormIds(post, submissions, userId) {
  const have = new Set(
    (submissions || [])
      .filter((s) => s && s.userId === userId && s.formId)
      .map((s) => s.formId),
  );
  return signFormIds(post).filter((id) => !have.has(id));
}

// the prisma `where` for people who still owe at least one signature on the
// post: missing a submission for ANY of its forms. A post with nothing to sign
// narrows nothing - the caller's own acknowledgment filter applies instead.
export function missingSignatureWhere(post) {
  const ids = signFormIds(post);
  if (!ids.length) return {};
  return {
    OR: ids.map((formId) => ({
      formSubmissions: { none: { announcementId: post.id, formId } },
    })),
  };
}
