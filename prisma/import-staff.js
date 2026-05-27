// one-off bulk import script. reads emails from a local text file
// (one per line, or comma/semicolon separated), and adds each new one
// as STAFF in the User table. idempotent - re-running just skips any
// users that are already in the db.
//
// usage:
//   1. paste emails into prisma/staff-emails.txt (the file is gitignored
//      so the staff list never goes to github)
//   2. npx tsx prisma/import-staff.js
//   3. (optional) pass a different file path as the first arg:
//      npx tsx prisma/import-staff.js path/to/some-other.txt
//
// least privilege by design - everyone gets STAFF role. promote
// individuals to MANAGER or IT_ADMIN later via the admin invite UI
// or task #35 once that's built.

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// inlined email check - duplicating cleanEmail from src/lib/security.js
// to avoid pulling in upstash redis init for a one-off script.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LEN = 254;

function cleanEmail(raw) {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > EMAIL_MAX_LEN) return null;
  if (!EMAIL_RE.test(email)) return null;
  return email;
}

const FILE_PATH = process.argv[2] || "prisma/staff-emails.txt";

async function main() {
  let raw;
  try {
    raw = readFileSync(resolve(FILE_PATH), "utf8");
  } catch {
    console.error(`Couldn't read ${FILE_PATH}.`);
    console.error(
      "Paste the email list into that file (one per line, or comma-separated), or pass a path as the first arg."
    );
    process.exit(1);
  }

  // split on newlines, commas, semicolons - whatever gmail or whoever
  // copy-paste produces. then strip whitespace and drop empty lines.
  const entries = raw
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  console.log(`Found ${entries.length} entries in ${FILE_PATH}.\n`);

  const stats = { added: 0, skipped: 0, invalid: 0 };
  const invalidEntries = [];

  for (const entry of entries) {
    // entries might be just an email, or "Name <email@x.com>" from a
    // mail client paste. extract anything that looks like an email.
    const match = entry.match(/[^\s<>]+@[^\s<>]+/);
    const candidate = match ? match[0] : entry;
    const email = cleanEmail(candidate);

    if (!email) {
      stats.invalid += 1;
      invalidEntries.push(entry);
      continue;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      stats.skipped += 1;
      continue;
    }

    await prisma.user.create({
      data: {
        email,
        // default display name = email's local part. they can change
        // it themselves in /portal/settings after signing in.
        name: email.split("@")[0],
        role: "STAFF",
      },
    });
    stats.added += 1;
    console.log(`+ ${email}`);
  }

  console.log();
  console.log(`Summary`);
  console.log(`  Added:   ${stats.added}`);
  console.log(`  Skipped: ${stats.skipped} (already in DB)`);
  console.log(`  Invalid: ${stats.invalid}`);
  if (invalidEntries.length > 0) {
    console.log(`\nInvalid entries (couldn't parse an email out of these):`);
    invalidEntries.forEach((l) => console.log(`  ${l}`));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
