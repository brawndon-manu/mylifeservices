// WHAT GOES TO PAYROLL IN ONE EMAIL - Mánu 2026-09-14: "lets add an option to
// send out the break penalty hours, payout report pdf excel and csv, and the
// most updated signed timesheets with a click of a button".
//
// THE FILES ARE THE ROUTES' OWN BYTES. Every one of these already exists as a
// download, and each route gathers its own figures inline - about 150 lines of
// premium standing, PTO rows and correction counts in the PDF route alone. A
// second copy of that for the email is the way the emailed figure and the
// downloaded figure start disagreeing, and nobody would notice which was
// right. So the bundle CALLS THE HANDLERS rather than rebuilding anything: what
// David opens is byte-identical to what the button on the screen gives you.
//
// The handlers do their own permission check against the signed-in user, so
// this inherits it rather than re-deciding it.
//
// THE SIGNED TIMESHEETS ARE NOT HERE, on purpose. Measured on 08/16-08/31: 61
// of them are 24.30 MB, and email base64-encodes attachments, so they arrive
// as roughly 32 MB against Gmail's 25 MB ceiling. They go as a link.

// WHO IT IS FOR, written down rather than typed at the screen. These are named
// people in a fixed reporting line, not a list somebody picks each period, and
// a free text box is how payroll figures reach the wrong inbox.
//
// HERE RATHER THAN IN THE ACTION because a "use server" file may only export
// async functions - exporting an object from one fails the page at runtime with
// "can only export async functions, found object", which is exactly what it did.
export const BUNDLE_TO = { name: "David Zermeno", email: "mylifeservicesinc@gmail.com" };
export const BUNDLE_CC = [
  { name: "Brandon Uribe", email: "brandon@mylifeservicesinc.com" },
  { name: "Gabriel Miranda", email: "gabemirandamls@gmail.com" },
];

export const BUNDLE_FILES = [
  { key: "pdf", label: "Payout report", ext: "pdf", type: "application/pdf" },
  { key: "xlsx", label: "Payroll workbook", ext: "xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { key: "csv", label: "Payout figures", ext: "csv", type: "text/csv" },
  { key: "penalties", label: "Break penalty hours", ext: "pdf", type: "application/pdf" },
];

// WHAT THIS PAYROLL IS CALLED. Every other screen in the timesheets tree says
// "ILS"; this said "Agency", which was mine alone and nobody else's word -
// Mánu 2026-09-14: "it should say ILS Payroll as well as in the subject".
export function programLabel(program) {
  return program === "DP" ? "Day Program" : "ILS";
}

// a filename payroll can file without renaming it
export function bundleName(batch, part, ext) {
  const span = `${String(batch?.periodFrom || "").replace(/\//g, "-")}_${String(batch?.periodTo || "").replace(/\//g, "-")}`;
  const program = programLabel(batch?.program);
  return `${program} ${span} ${part}.${ext}`;
}

// one handler's response as bytes, or an explanation of why it is missing.
// A route that refuses is not an exception here: it is a file the email must
// not silently go without.
async function partOf(handler, id, label) {
  let res;
  try {
    res = await handler(new Request("http://internal/"), { params: Promise.resolve({ id }) });
  } catch (e) {
    console.error(`payroll bundle: ${label} threw:`, e);
    return { ok: false, label, why: "could not be built" };
  }
  if (!res || res.status !== 200) {
    return { ok: false, label, why: `the download returned ${res ? res.status : "nothing"}` };
  }
  const body = Buffer.from(await res.arrayBuffer());
  if (!body.length) return { ok: false, label, why: "came back empty" };
  return { ok: true, label, body };
}

export async function buildPayrollBundle(id, batch) {
  const { GET: pdf } = await import("@/app/portal/admin/timesheets/[id]/report/pdf/route");
  const { GET: xlsx } = await import("@/app/portal/admin/timesheets/[id]/report/xlsx/route");
  const { GET: csv } = await import("@/app/portal/admin/timesheets/[id]/report/csv/route");
  const { GET: penalties } = await import("@/app/portal/admin/timesheets/[id]/penalties/route");
  const handlers = { pdf, xlsx, csv, penalties };

  const files = [];
  const missing = [];
  for (const spec of BUNDLE_FILES) {
    const got = await partOf(handlers[spec.key], id, spec.label);
    if (!got.ok) { missing.push(got); continue; }
    files.push({
      filename: bundleName(batch, spec.label, spec.ext),
      content: got.body,
      contentType: spec.type,
      bytes: got.body.length,
      label: spec.label,
      ext: spec.ext,
    });
  }
  return { files, missing, bytes: files.reduce((n, f) => n + f.bytes, 0) };
}

// what the attachments weigh once encoded, which is the number that decides
// whether an inbox accepts them. base64 is 4 bytes for every 3.
export function onTheWire(bytes) {
  return Math.ceil(bytes / 3) * 4;
}
