import { prisma } from "@/lib/prisma";

// WRITING DOWN WHO OPENED A RECORD (the AccessLog table), and who asked for
// one and was turned away ("denied").
//
// best-effort: a log write that fails must never stop somebody opening a file
// they are allowed to open, but it does not fail quietly either.
//
// `pathname` is the stored file's pathname, or for a document built on the
// spot (a report, a zip) a key saying what it was built from. `label` is the
// same thing in words, kept as it stood at the time.
export async function logFileOpen({ user, pathname, req, via = "session", action = "open", label = null }) {
  try {
    await prisma.accessLog.create({
      data: {
        userId: user?.id ?? null,
        userEmail: user?.email ?? null,
        role: user?.realRole || user?.role || null,
        via,
        action,
        target: String(pathname).slice(0, 500),
        label: label ? String(label).slice(0, 300) : null,
        ip: req?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        userAgent: req?.headers?.get("user-agent")?.slice(0, 300) || null,
      },
    });
  } catch (e) {
    console.error("access log write failed:", pathname, e?.message || e);
  }
}

// somebody signed in asked for a record their role doesn't open. signed out
// is not written down - there is nobody to write down, and the bots would fill
// the log.
export async function logFileDenied({ user, pathname, req, label = null }) {
  if (!user) return;
  await logFileOpen({ user, pathname, req, action: "denied", label });
}
