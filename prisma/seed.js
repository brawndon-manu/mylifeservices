import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ADMIN_EMAILS = [
  { email: "brawndonu@gmail.com", name: "Brawndon" },
  // School email also seeded so we can test in dev before verifying a
  // custom Resend sending domain (Resend free tier only delivers to the
  // address that owns the account).
  { email: "brawndon@csu.fullerton.edu", name: "Brawndon" },
];

async function main() {
  for (const { email, name } of ADMIN_EMAILS) {
    const admin = await prisma.user.upsert({
      where: { email },
      update: { role: "IT_ADMIN" },
      create: { email, name, role: "IT_ADMIN" },
    });
    console.log(`Seeded admin: ${admin.email} (${admin.role})`);
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
