// EVERY ROUTE THAT HANDS OUT A RECORD WRITES IT DOWN.
//
// the access log is only worth reading if nothing gets around it, and the way
// something gets around it is a new download route that streams a record and
// never calls logFileOpen - nothing fails when that happens. so this reads
// every route handler: one that hands out a file must write the open down, and
// one behind a sign-in must write a refusal down too, unless it is on the short
// list of files that are not anybody's record.
//
// node built-ins only, on purpose: it has to run against any checkout.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APP = path.join(ROOT, "src", "app");

// what handing out a file looks like in a route: a download header, a file
// type, a csv or zip helper, or a read of a stored file
const HANDS_OUT_A_FILE =
  /Content-Disposition|content-disposition|csvResponse\(|zipResponse\(|application\/pdf|fetchBlob\(|readBlob\(|openBlob\(|fetchStored\(|readStoredPdf\(/;

// the files that are not anybody's record, and why. a route that starts
// handing out a record has to come off this list and write its opens down.
const NOT_RECORDS = {
  "src/app/a/doc/[token]/[n]/route.js": "an announcement's documents, the same for everyone it went to",
  "src/app/c/[id]/photo/route.js": "the public contact card's photo",
  "src/app/f/file/[id]/route.js": "a blank open form",
  "src/app/portal/forms/[id]/file/route.js": "a blank restricted form",
  "src/app/portal/admin/tests/pdf/route.js": "a sample sheet built from made-up data",
  "src/app/portal/admin/timesheets/blob-upload/route.js": "the upload handshake: files come in, none go out",
};

function routes(dir = APP, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) routes(p, out);
    else if (e.name === "route.js") out.push(path.relative(ROOT, p).split(path.sep).join("/"));
  }
  return out;
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const fileRoutes = routes().filter((p) => HANDS_OUT_A_FILE.test(read(p)));
const recordRoutes = fileRoutes.filter((p) => !(p in NOT_RECORDS));

test("the check finds the routes it is meant to", () => {
  // a pattern that matched nothing would pass every test below
  assert.ok(recordRoutes.length >= 40, `only ${recordRoutes.length} record routes found`);
  for (const p of [
    "src/app/portal/files/[...path]/route.js",
    "src/app/portal/admin/timesheets/[id]/download-zip/route.js",
    "src/app/portal/admin/forms/csv/route.js",
    "src/app/t/[token]/pdf/route.js",
  ]) {
    assert.ok(recordRoutes.includes(p), `${p} is not seen as a record route`);
  }
});

test("every route that hands out a record writes the open down", () => {
  const silent = recordRoutes.filter((p) => !/await logFileOpen\(/.test(read(p)));
  assert.deepEqual(silent, [], `these hand out a record without writing it down:\n${silent.join("\n")}`);
});

test("a route behind a sign-in writes a refusal down too", () => {
  const signedIn = recordRoutes.filter((p) => /getCurrentUser\(|requireAttestationAccess\(/.test(read(p)));
  assert.ok(signedIn.length >= 35, `only ${signedIn.length} signed-in record routes found`);
  const quiet = signedIn.filter((p) => !/logFileDenied\(|action: "denied"/.test(read(p)));
  assert.deepEqual(quiet, [], `these refuse somebody without writing it down:\n${quiet.join("\n")}`);
});

test("the list of files that are not records is still true", () => {
  for (const [p, why] of Object.entries(NOT_RECORDS)) {
    assert.ok(fs.existsSync(path.join(ROOT, p)), `${p} (${why}) no longer exists - take it off the list`);
    assert.ok(fileRoutes.includes(p), `${p} (${why}) no longer hands out a file - take it off the list`);
  }
});
