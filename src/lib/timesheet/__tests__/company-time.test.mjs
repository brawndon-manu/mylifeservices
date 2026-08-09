// One date, one answer, wherever the code happens to be running.
//
// The bug: a batch created at 05:35 UTC showed "Aug 7" on the deployed site and
// "Aug 6" on a dev server, from the same database row. `toLocaleDateString`
// with no timeZone uses whatever zone the process is in - UTC on Vercel,
// Pacific here - and inside a client component it uses the VIEWER's zone, a
// third answer again.
//
// These tests set TZ explicitly and assert the output does not move.
import { test } from "node:test";
import assert from "node:assert/strict";

import { companyDate, companyDateTime, COMPANY_TZ } from "../../company-time.js";

// the real row that exposed this: batch 2 of the live batch list
const THE_BATCH = "2026-08-07T05:35:57.375Z"; // 22:35 on Aug 6, Pacific

test("the same instant reads the same whatever timezone the process is in", () => {
  const before = process.env.TZ;
  const seen = new Set();
  try {
    for (const tz of ["UTC", "America/Los_Angeles", "America/New_York", "Asia/Tokyo"]) {
      process.env.TZ = tz;
      seen.add(companyDate(THE_BATCH));
    }
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
  assert.equal(seen.size, 1, `one answer expected, got ${[...seen].join(" / ")}`);
  // and it is the Pacific reading, which is what a pay period means here
  assert.equal([...seen][0], "Aug 6, 2026");
});

test("and it is NOT the answer the unpinned call gives on a UTC host", () => {
  // the control. if this ever matches, the bug was never real and the fix is
  // doing nothing.
  const before = process.env.TZ;
  try {
    process.env.TZ = "UTC";
    const unpinned = new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric", year: "numeric",
    }).format(new Date(THE_BATCH));
    assert.equal(unpinned, "Aug 7, 2026", "this is what production was showing");
    assert.notEqual(companyDate(THE_BATCH), unpinned);
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});

test("null and unparseable in, null out - never the words Invalid Date", () => {
  for (const bad of [null, undefined, "", "not a date", NaN]) {
    assert.equal(companyDate(bad), null, `${String(bad)} should give null`);
  }
  // a real Date object and an ISO string agree
  assert.equal(companyDate(new Date(THE_BATCH)), companyDate(THE_BATCH));
});

test("format options pass through, the timezone cannot be overridden by accident", () => {
  assert.equal(
    companyDate(THE_BATCH, { month: "long", day: "numeric", year: "numeric" }),
    "August 6, 2026",
  );
  // a caller passing its own timeZone does not win - payroll dates are not
  // negotiable per call site, which is the whole reason this helper exists
  assert.equal(companyDate(THE_BATCH, { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Tokyo" }), "Aug 6, 2026");
});

test("companyDateTime carries the time, in the same zone", () => {
  const s = companyDateTime(THE_BATCH);
  assert.match(s, /Aug 6, 2026/);
  assert.match(s, /10:35/); // 22:35 Pacific
  assert.equal(COMPANY_TZ, "America/Los_Angeles");
});
