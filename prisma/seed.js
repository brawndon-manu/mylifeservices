import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// admin emails come from env now (SEED_ADMIN_EMAILS in .env.local) so
// they stay out of the public github repo. comma-separated list.
// example: SEED_ADMIN_EMAILS="me@example.com,boss@example.com"
//
// name defaults to the email's local part (everything before @) - the
// settings page lets people change it later. role is always IT_ADMIN for
// seeded users since this is the bootstrap admin list.
const rawEmails = process.env.SEED_ADMIN_EMAILS || "";
const ADMIN_EMAILS = rawEmails
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean)
  .map((email) => ({
    email,
    // default name = email local part (before @), title-cased a bit.
    // gets overwritten if the user already exists with a different name.
    name: email.split("@")[0],
  }));

if (ADMIN_EMAILS.length === 0) {
  console.error(
    "No SEED_ADMIN_EMAILS found in env. Add to .env.local before running seed."
  );
  process.exit(1);
}

async function main() {
  for (const { email, name } of ADMIN_EMAILS) {
    const admin = await prisma.user.upsert({
      where: { email },
      // on re-runs, only force the role. don't overwrite name - if the
      // user has updated their name via /portal/settings, we'd be
      // stomping it on every seed. fresh users get the email-derived
      // default and can change it themselves.
      update: { role: "IT_ADMIN" },
      create: { email, name, role: "IT_ADMIN" },
    });
    console.log(`Seeded admin: ${admin.email} (${admin.name}, ${admin.role})`);
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
