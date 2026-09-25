// PRIVATE FILES. every record the portal stores - a signed timesheet, a client
// attestation, a filled form, a certificate - goes in the private blob store,
// and reaches a browser only through the /portal/files gate. the public store
// keeps what the website and the emails show to anybody.
//
// the unit tests pin the three rules that decide it (which bucket, what link,
// who may open). the guards underneath read the source, because the way this
// breaks is wiring: one new upload that calls put() itself, one page that
// renders a stored url straight into an <a>, and a record is public again with
// nothing failing.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  FILES_ROUTE,
  cleanPathname,
  fileHref,
  isBlobUrl,
  isGatedHref,
  isPrivateBlobUrl,
  isPublicKey,
  parseBlobUrl,
} from "../blob-paths.js";
import { FILE_RULES, canOpenFile, fileRuleFor } from "../file-access.js";

const PUB = "https://c0i3i49bjdwrdp3w.public.blob.vercel-storage.com";
const PRIV = "https://abcd1234.private.blob.vercel-storage.com";

test("only the website's pictures, the email logo and an announcement's pictures are public", () => {
  for (const key of [
    "site/about/1-a.jpg",
    // the About page's first photos, uploaded before site/ existed
    "clients/about-hero.jpg",
    "newsletter/1-b.png",
    "email/logo.png",
    "announcements/inline/1-c.gif",
    "announcements/1-cover.jpg",
  ]) {
    assert.equal(isPublicKey(key), true, key);
  }
  for (const key of [
    "announcements/docs/1-x.pdf",
    "timesheets/signed/abc.pdf",
    "timesheets/src/u1/clock-Clock Report.xls",
    "client-attestations/forms/x.pdf",
    "form-submissions/x.pdf",
    "certificates/x.pdf",
    "clock-amendments/id/dsn.pdf",
    "applications/x.pdf",
    "hub/1-a.jpg",
    "avatars/u1-1.jpg",
    "feedback/1-a.png",
    "forms/supervision/x.pdf",
    "",
    "sitemap.xml",
  ]) {
    assert.equal(isPublicKey(key), false, key);
  }
});

test("a store url comes apart into its store, its access and its decoded pathname", () => {
  assert.deepEqual(parseBlobUrl(`${PUB}/timesheets/src/u1/clock-Clock%20Report.xls`), {
    store: "c0i3i49bjdwrdp3w",
    access: "public",
    pathname: "timesheets/src/u1/clock-Clock Report.xls",
  });
  assert.equal(parseBlobUrl(`${PRIV}/timesheets/signed/a.pdf?download=1`).pathname, "timesheets/signed/a.pdf");
  assert.equal(isPrivateBlobUrl(`${PRIV}/x.pdf`), true);
  assert.equal(isPrivateBlobUrl(`${PUB}/x.pdf`), false);
  // not ours, so not parsed - and never treated as a record
  for (const url of [
    "/forms/handbook.pdf",
    "http://c0i3i49bjdwrdp3w.public.blob.vercel-storage.com/x.pdf",
    "//c0i3i49bjdwrdp3w.public.blob.vercel-storage.com/x.pdf",
    "https://evil.example/x.public.blob.vercel-storage.com/x.pdf",
    "data:image/png;base64,AAAA",
    null,
    undefined,
  ]) {
    assert.equal(isBlobUrl(url), false, String(url));
  }
});

test("a record's link goes through the gate whichever store it sits in; a public picture keeps its url", () => {
  assert.equal(fileHref(`${PRIV}/timesheets/signed/a.pdf`), `${FILES_ROUTE}/timesheets/signed/a.pdf`);
  // still in the public store, waiting to be moved: gated all the same
  assert.equal(fileHref(`${PUB}/client-attestations/forms/b.pdf`), `${FILES_ROUTE}/client-attestations/forms/b.pdf`);
  // encoded one segment at a time, so a space or a hash can't cut the path short
  assert.equal(
    fileHref(`${PRIV}/timesheets/src/u1/clock-Clock%20Report%20%231.xls`),
    `${FILES_ROUTE}/timesheets/src/u1/clock-Clock%20Report%20%231.xls`,
  );
  assert.equal(fileHref(`${PUB}/newsletter/1-b.png`), `${PUB}/newsletter/1-b.png`);
  assert.equal(fileHref(`${PUB}/announcements/inline/1-c.gif`), `${PUB}/announcements/inline/1-c.gif`);
  // a public-store file whose pathname is a record never keeps its own url
  assert.ok(!fileHref(`${PUB}/announcements/docs/1-x.pdf`).includes("blob.vercel-storage.com"));
  // not ours: left exactly as it was
  assert.equal(fileHref("/forms/handbook.pdf"), "/forms/handbook.pdf");
  assert.equal(fileHref("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
  assert.equal(fileHref(null), null);
  assert.equal(isGatedHref(`${FILES_ROUTE}/hub/1.jpg`), true);
  assert.equal(isGatedHref(`${PUB}/newsletter/1-b.png`), false);
});

test("a pathname that climbs, or has an empty or odd segment, never reaches a lookup", () => {
  assert.equal(cleanPathname(["timesheets", "signed", "a.pdf"]), "timesheets/signed/a.pdf");
  for (const segs of [
    ["hub", "..", "timesheets", "signed", "a.pdf"],
    ["hub", ".", "a.jpg"],
    ["hub", "", "a.jpg"],
    ["hub\\..\\timesheets", "a.pdf"],
    ["hub", "a\0.jpg"],
    [],
  ]) {
    assert.equal(cleanPathname(segs), null, JSON.stringify(segs));
  }
});

test("who opens what: each kind of file follows the screen that lists it", () => {
  const as = (role) => ({ id: "u", role });
  const open = (role, p) => canOpenFile(as(role), p);

  // staff: the shared pictures and documents, never a record
  assert.equal(open("STAFF", "hub/1.jpg"), true);
  assert.equal(open("STAFF", "avatars/u1.jpg"), true);
  assert.equal(open("STAFF", "announcements/docs/1.pdf"), true);
  assert.equal(open("STAFF", "timesheets/signed/a.pdf"), false);
  assert.equal(open("STAFF", "client-attestations/forms/a.pdf"), false);
  assert.equal(open("STAFF", "form-submissions/a.pdf"), false);
  assert.equal(open("STAFF", "applications/a.pdf"), false);

  // a supervisor opens their own clients' forms through the desk's form route,
  // which checks the row; by its path an attestation file is the office's.
  // and nothing of payroll
  assert.equal(open("SUPERVISOR", "client-attestations/forms/a.pdf"), false);
  assert.equal(open("SUPERVISOR", "timesheets/signed/a.pdf"), false);
  assert.equal(open("SUPERVISOR", "clock-amendments/x/dsn.pdf"), false);

  // HR: timesheets, form records and the whole attestation month
  assert.equal(open("HR", "timesheets/signed/a.pdf"), true);
  assert.equal(open("HR", "client-attestations/forms/a.pdf"), true);
  assert.equal(open("HR", "form-submissions/a.pdf"), true);
  assert.equal(open("HR", "certificates/a.pdf"), true);

  // a blank template is looked up against its form at the gate; with no form
  // row the fallback is admin only
  assert.equal(fileRuleFor("forms/supervision/a.pdf").form, true);
  assert.equal(open("STAFF", "forms/supervision/a.pdf"), false);
  assert.equal(open("ADMIN", "forms/supervision/a.pdf"), true);

  // nobody, and anything no rule names, is refused - even for the top role
  assert.equal(canOpenFile(null, "hub/1.jpg"), false);
  assert.equal(open("SUPER", "somewhere-new/a.pdf"), false);
});

test("every record kind is written to the access log, and no shared picture is", () => {
  const records = FILE_RULES.filter((r) => r.record).map((r) => r.prefix);
  for (const p of ["timesheets/", "client-attestations/", "form-submissions/", "clock-amendments/", "certificates/", "applications/"]) {
    assert.ok(records.includes(p), p);
  }
  for (const p of ["hub/", "avatars/", "feedback/", "announcements/docs/", "forms/"]) {
    assert.equal(fileRuleFor(`${p}x`).record, false, p);
  }
});

// ---------------------------------------------------------------- guards

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
function sourceFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "generated") continue;
      out.push(...sourceFiles(rel));
    } else if (/\.(js|mjs)$/.test(e.name)) {
      out.push(rel);
    }
  }
  return out;
}
const SRC = sourceFiles("src");

test("only src/lib/blob.js talks to the store, so no upload can pick its own bucket", () => {
  const offenders = SRC.filter((f) => {
    if (f === "src/lib/blob.js") return false;
    const m = read(f).match(/import\s*\{([^}]*)\}\s*from\s*["']@vercel\/blob["']/);
    if (!m) return false;
    // the presigned upload desk mints a token; that is all it may take
    return m[1].split(",").map((s) => s.trim()).some((name) => name && name !== "issueSignedToken");
  });
  assert.deepEqual(offenders, [], `these import put/del/get from @vercel/blob directly: ${offenders.join(", ")}`);
});

// every column that holds a stored file's url
const STORED = [
  "pdfUrl", "signedPdfUrl", "approvedPdfUrl", "formUrl", "clientSignedPdfUrl",
  "dsnPdfUrl", "staffSignatureUrl", "clientSignatureUrl", "templateUrl", "resumeUrl",
  "sourceUrl", "scheduleUrl", "clockUrl", "notesUrl", "serviceNotesUrl",
  "scheduleNotesUrl", "restsUrl", "payrollUrl", "timesheetUrl", "dpMileageUrl",
].join("|");

test("no server code fetches a stored file by its url - fetchBlob reads either store", () => {
  const re = new RegExp(`\\bfetch\\([^)]*\\.(${STORED})\\b`);
  const offenders = SRC.filter((f) => re.test(read(f)));
  assert.deepEqual(offenders, [], `plain fetch() of a stored url (private urls refuse it): ${offenders.join(", ")}`);
});

test("no page renders a stored record's url straight into a link or an image", () => {
  const re = new RegExp(`(href|src)=\\{[a-zA-Z.?]*\\.(${STORED})\\}`);
  const offenders = SRC.filter((f) => re.test(read(f)));
  assert.deepEqual(offenders, [], `wrap these in fileHref(): ${offenders.join(", ")}`);
  // and every avatar in the portal goes through the one component that does it
  assert.match(read("src/components/Avatar.js"), /src=\{fileHref\(image\)\}/);
});

test("a fresh read is asked of the private store only - the public one answers it with a 400", () => {
  // found by opening an announcement's pdf from its emailed link: every read of
  // a record still waiting in the public store failed until this was split
  const blob = read("src/lib/blob.js");
  assert.match(blob, /const fresh = parsed\.access === "private" \? \{ useCache: false \} : \{\};/);
  assert.match(blob, /\.\.\.authFor\(parsed\), \.\.\.fresh \}/);
});

test("no route sends the browser to a stored file's own address", () => {
  // a redirect to a private url is a 403 in the visitor's browser - the
  // addendum pdf route did this until it was caught after the move
  const re = new RegExp(`redirect\\(\\s*[a-zA-Z_.?]*\\.(${STORED}|fileUrl|imageUrl|image)\\b`);
  const offenders = SRC.filter((f) => re.test(read(f)));
  assert.deepEqual(offenders, [], `stream these through the server instead: ${offenders.join(", ")}`);
});

test("the timesheet exports upload into the private store", () => {
  const form = read("src/app/portal/admin/timesheets/new/UploadForm.js");
  assert.match(form, /uploadPresigned\(`timesheets\/src\//);
  assert.match(form, /access: "private"/);
  const desk = read("src/app/portal/admin/timesheets/blob-upload/route.js");
  assert.match(desk, /handleUploadPresigned\(/);
  assert.match(desk, /\.\.\.privateBlobAuth\(\)/);
  assert.match(desk, /if \(!canManageTimesheets\(user\?\.role\)\)/);
});

test("the gate asks who is there before it opens anything", () => {
  const gate = read("src/app/portal/files/[...path]/route.js");
  const who = gate.indexOf("await getCurrentUser()");
  const allowed = gate.indexOf("if (!allowed)");
  const opened = gate.indexOf("await openBlob(");
  assert.ok(who > 0 && allowed > who && opened > allowed, "user, then the rule, then the store");
  assert.match(gate, /const pathname = cleanPathname\(path\);/);
  assert.match(gate, /rule\.record \? "private, no-store"/);
  assert.match(gate, /if \(rule\.record\) await logFileOpen\(/);
});
