# Archived services content

**Why this exists:** On 2026-07-24, per the owner's direction, the public site was
reduced to a single service, **Independent Living Services (ILS)**. The other
services now appear only as supports offered *under the ILS umbrella*, and the
**Day Program was removed from the public site entirely** (for now).

Nothing was deleted. This folder holds the full, original content so it can be
restored later.

## What's here

- `services-original.js` is a verbatim copy of `src/lib/services.js` as it was on
  the `week6` branch before this change, with all five services intact:
  1. Independent Living Services (ILS)
  2. Supported Living
  3. Day Program
  4. Self-Determination
  5. Crisis Support

  Each entry keeps its full public-page content (`day`, `categories`, `cta`, etc.)
  and its careers content (`role`, `roleDescription`).

## What changed on the site (week6)

- `src/lib/services.js` now holds only ILS, plus an `umbrella` field describing
  Supported Living / Self-Determination / Crisis Support as supports under ILS.
- `src/app/services/day-program/` (the dedicated Day Program page) was removed.
- `src/app/services/[slug]/page.js` redirects the retired slugs (supported-living,
  self-determination, crisis-support, day-program) to `/services`.
- `src/app/careers/*` now hires for the ILS role only; the multi-program
  RoleMatcher and `WORK_SETTINGS` were removed, and the apply form lists only the
  Independent Living Staff position.

## How to restore a service later

1. Copy the service object you want back from `services-original.js` into the
   `services` array in `src/lib/services.js`.
2. For the Day Program specifically, restore its page from git history
   (`src/app/services/day-program/page.js`) and add `day-program` back to the
   `OWN_PAGE` list in `src/app/services/[slug]/page.js`.
3. Remove the restored slug(s) from the `RETIRED_SLUGS` redirect lists in
   `src/app/services/[slug]/page.js` and `src/app/careers/[slug]/page.js`.
4. For a careers role, add it back to the `POSITIONS` lists in
   `src/app/careers/apply/ApplyForm.js` and `src/app/careers/apply/actions.js`,
   and restore the RoleMatcher / `WORK_SETTINGS` from git history if you want the
   multi-program picker back.

This folder lives outside `src/`, so Next.js never builds or ships it.
