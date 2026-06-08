# Weekly Updates

A running log of what shipped, week by week, so it's easy to gather notes for
status updates.

**How this works**
- During the active period, every change we make gets appended under
  **"Current period"** below.
- After the period ends, on Mánu's authorization, the current period is moved
  down into **"Past periods"** and a fresh "Current period" block is started.
- Periods run in ~weekly windows (dates noted per entry).

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

### Site-wide
- Standardized the small section-heading labels to one consistent brand blue for
  better readability, fixing a mismatch where some pages used a lighter shade.
  Kept the light accent on the homepage hero tagline.

### Behind the scenes
- Wired up the contact-page map via a domain-restricted Google Maps Embed API
  key (stored as an environment variable, not in the code).

### In progress / next up
- **Contact form** — name / email / message that emails the office directly,
  with spam protection. Designed and planned; building next.

---

## Past periods

_(none yet — the first period above will be archived here after June 10.)_
