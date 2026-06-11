# Weekly Updates

A running log of what shipped, week by week, so it's easy to gather notes for
status updates.

**How this works**
- Every change we ship gets appended to the current period's list below.
- For now it's one running list — no automatic reset. If/when Mánu wants to
  start a fresh period, we'll archive the current one into "Past periods" then.

> ⚠️ **This file is in a PUBLIC repo.** Keep it to visitor-facing /
> non-sensitive notes (website features, copy, UX). Do **not** put security or
> permission details, client/PHI-system specifics, or staff details here — those
> stay in the gitignored `local-docs/`.

---

## Current period — June 3–10, 2026

_Status: in progress (pushed early on June 7; more may be added this period)._

### Contact page — rebuilt
- Redesigned the contact info cards (Phone / Email / Office / Hours) with icon
  badges, hover effects, and tap-to-call / tap-to-email.
- Embedded an interactive **Google Map** of the office, with a "Get directions"
  link (falls back to OpenStreetMap automatically if the map key is missing).
- Added a **contact form** (Name / Email / optional Phone / Reason / Message)
  that emails the office directly, with spam protection (honeypot + rate limit)
  and clear success/error states. Staff can **reply to the sender directly** by
  hitting Reply on the email (reply-to is set to the visitor) — no copy/pasting
  addresses. Inquiries come from a dedicated `contact@mylifeservicesinc.com`
  sender (not the generic `noreply`), so they're easy to filter.
- Added a closing call-to-action ("Prefer to talk it through?") with Call and
  Email buttons.

### Site header
- The **Employee portal** is now its own clearly-styled button (was previously
  hidden inside a confusing "Quicklinks" menu).
- Removed the awkward single-item "Quicklinks" dropdown; **"Apply" is now a
  direct link** — one click instead of two.
- Slimmed down the top action buttons for a cleaner bar.

### Services page
- The "On this page" quick-jump links now look like proper buttons.
- Removed redundant "01 / 05"-style numbering above each section.

### Careers page
- Reworded the program buttons from "Apply for [program]" to
  **"Explore [program]"**, since they open a description of the role rather than
  the application form (the actual Apply button is at the bottom of each role
  page).
- **Migrated the job application form from EmailJS to Resend** (the same email
  system the rest of the site uses). Now résumés arrive as **real attachments**
  (previously only the filename was sent), the recipient is env-controlled
  (`careers@mylifeservicesinc.com`), submissions are validated server-side with
  spam protection, and the third-party EmailJS dependency was removed.
- Application emails to the reviewer are now a **clean, branded HTML layout**
  (header with applicant name + role, color-coded Yes/No badges, empty
  sections hidden) instead of a plain-text dump — easier to scan and reply to.
- Whoever reviews an application can **reply to the applicant directly** by just
  hitting Reply on the email — their response goes straight to the applicant's
  inbox (the email's reply-to is set to the applicant), no copy/pasting
  addresses or leaving the inbox.
- Application emails now come **from a dedicated `applications@mylifeservicesinc.com`
  sender** (instead of the generic `noreply`), so the reviewer can filter or
  auto-label them easily in their inbox.

### Site-wide
- Standardized the small section-heading labels to one consistent brand blue for
  better readability, fixing a mismatch where some pages used a lighter shade.
  Kept the light accent on the homepage hero tagline.
- Switched the public contact email everywhere (footer, contact page, about, and
  service pages) from the old `support@mylifeservices.net` to the new
  `contact@mylifeservicesinc.com` address.
- Phone fields now **auto-format as you type** — `(909) 837-0907` builds itself
  with the parentheses and dash. Applied across the application form, contact
  form, and the portal (settings, user edit, community resources).

### Behind the scenes
- Wired up the contact-page map via a domain-restricted Google Maps Embed API
  key (stored as an environment variable, not in the code).

### In progress / next up
- _(nothing pending right now)_

---

## Past periods

_(none yet — the first period above will be archived here after June 10.)_
