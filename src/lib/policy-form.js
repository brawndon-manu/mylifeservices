// The signed policy the timesheet's break assumption rests on.
//
// The timesheet email and the signing page both tell people that recording
// their breaks is their responsibility "under the Rest & Meal Period Policy and
// Acknowledgement you signed". Mánu 2026-08-10 wants that named document to be
// reachable from the sentence, so somebody can read what they agreed to before
// they sign a figure that depends on it.
//
// LOOKED UP BY TITLE, NOT BY ID OR SLUG. A form re-uploaded through the library
// gets a fresh share slug, and a dead link inside a payroll email is worse than
// no link at all. If nothing matches, callers render the name as plain text.
import { prisma } from "@/lib/prisma";

// same shape as the `rest-meal-break` route in forms.js, deliberately: one
// document, matched the same way wherever it is referred to.
export const REST_MEAL_TITLE = /rest\b.*\bmeal\b/i;

export async function restMealPolicyLink() {
  let forms = [];
  try {
    forms = await prisma.form.findMany({ select: { title: true, shareSlug: true } });
  } catch (e) {
    console.error("policy link lookup failed:", e?.message || e);
    return null;
  }
  // the share path is public on purpose - staff reading this on a phone they
  // have never signed in on still need to open it
  const f = forms.find((x) => REST_MEAL_TITLE.test(x.title || "") && x.shareSlug);
  return f ? { title: f.title, path: `/f/${f.shareSlug}` } : null;
}
