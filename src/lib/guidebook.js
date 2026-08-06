// Public share links for guidebook pages.
//
// Same idea as a resource's /r/<id> or a contact's /c/<id>: a link you can send
// to anyone, that opens without a login, and is never indexed or linked from
// anywhere public. Break policy is something staff need to read on a phone
// without hunting for a portal password, and something HR needs to be able to
// send to somebody who has no account yet.
//
// The slug falls back to a readable constant, so the link is public the moment
// this deploys and needs no setup - resources and contacts need none either.
// Set GUIDEBOOK_BREAKS_SLUG to a random value and it uses that instead, which
// buys an unguessable URL. Either way it works; the variable only changes how
// hard the address is to guess.
//
// The first version had NO fallback, so the link silently stayed private until
// somebody set the variable in Vercel. A share button that quietly does not
// share is worse than one that is merely guessable.
//
// These pages carry no client data, no staff names and no figures. They are
// policy, written to be handed out.

export const GUIDEBOOK_PAGES = {
  breaks: {
    slug: process.env.GUIDEBOOK_BREAKS_SLUG || "breaks",
    portalPath: "/portal/guidebook/breaks",
    title: "Meal Periods & Rest Breaks",
  },
};

// the public link to hand out
export function sharePath(key) {
  const page = GUIDEBOOK_PAGES[key];
  return page ? `/g/${page.slug}` : null;
}

// resolve an incoming /g/<slug> back to a page key
export function pageForSlug(slug) {
  if (!slug || typeof slug !== "string") return null;
  for (const [key, page] of Object.entries(GUIDEBOOK_PAGES)) {
    if (page.slug === slug) return key;
  }
  return null;
}
