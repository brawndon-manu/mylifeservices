import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// single prisma client shared across the app. without this, hot reload
// in dev creates a new client every time you save a file, which eats
// up neon's connection pool until it complains.
const globalForPrisma = globalThis;

function makeClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
}

export const prisma = globalForPrisma.prisma ?? makeClient();

// stash on globalThis in dev only - in prod each cold start gets a fresh
// instance which is what we want.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
