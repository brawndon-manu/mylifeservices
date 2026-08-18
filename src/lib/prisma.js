import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// single prisma client shared across the app. without this, hot reload
// in dev creates a new client every time you save a file, which eats
// up neon's connection pool until it complains.
const globalForPrisma = globalThis;

function makeClient() {
  return new PrismaClient({
    // DATABASE_SCHEMA points the app at another postgres schema on the same
    // instance - unset everywhere normal, which means public. it exists so a
    // local review can run against a copied schema without production seeing
    // a single row of it.
    adapter: new PrismaPg(
      { connectionString: process.env.DATABASE_URL },
      process.env.DATABASE_SCHEMA ? { schema: process.env.DATABASE_SCHEMA } : undefined,
    ),
  });
}

export const prisma = globalForPrisma.prisma ?? makeClient();

// stash on globalThis in dev only - in prod each cold start gets a fresh
// instance which is what we want.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
