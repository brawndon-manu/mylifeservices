import { prisma } from "@/lib/prisma";

// WRITING DOWN WHO OPENED A RECORD (the AccessLog table), and who asked for
// one and was turned away ("denied").
//
// best-effort: a log write that fails must never stop somebody opening a file
// they are allowed to open, but it does not fail quietly either.
export async function logFileOpen({ user, pathname, req, via = "session", action = "open" }) {
  try {
    await prisma.accessLog.create({
      data: {
        userId: user?.id ?? null,
        userEmail: user?.email ?? null,
        role: user?.realRole || user?.role || null,
        via,
        action,
        target: String(pathname).slice(0, 500),
        ip: req?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        userAgent: req?.headers?.get("user-agent")?.slice(0, 300) || null,
      },
    });
  } catch (e) {
    console.error("access log write failed:", pathname, e?.message || e);
  }
}
