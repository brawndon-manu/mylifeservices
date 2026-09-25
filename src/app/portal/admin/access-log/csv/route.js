import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { cell, csvResponse } from "@/lib/csv";
import { accessLabel, lineLabel } from "@/lib/access-labels";
import { logFileOpen, logFileDenied } from "@/lib/file-log";
import { COMPANY_TZ } from "@/lib/company-time";
import { howOf, logWhere, readFilters } from "../query";

// THE ACCESS LOG AS A FILE, with the same filters as the page and every column
// the page leaves under a refusal (address, browser). a copy of the log is
// itself worth knowing about, so taking one is written down too.
export const dynamic = "force-dynamic";

const MAX = 20000;
const stamp = new Intl.DateTimeFormat("en-CA", {
  timeZone: COMPANY_TZ,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hourCycle: "h23",
});

export async function GET(req) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) {
    await logFileDenied({ user, pathname: "access-log/csv", req, label: "Access log · CSV" });
    return new Response("Not found", { status: 404 });
  }

  const f = readFilters(Object.fromEntries(new URL(req.url).searchParams));
  const people = f.q
    ? await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: f.q, mode: "insensitive" } },
            { preferredFirstName: { contains: f.q, mode: "insensitive" } },
            { preferredLastName: { contains: f.q, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 50,
      })
    : [];
  const rows = await prisma.accessLog.findMany({
    where: logWhere(f, new Date(), people.map((p) => p.id)),
    orderBy: { at: "desc" },
    take: MAX,
  });
  const ids = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, preferredFirstName: true, preferredLastName: true, email: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  const header = ["When (Pacific)", "Who", "Email", "Role", "Record", "Target", "How", "Result", "Address", "Browser"];
  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    const u = byId.get(r.userId);
    lines.push(
      [
        stamp.format(r.at).replace(",", ""),
        r.via === "client-link" ? "Person served's link" : (u && preferredName(u)) || (r.userEmail ? "" : "Emailed link"),
        r.userEmail || "",
        r.role || "",
        lineLabel(r),
        r.target,
        howOf(r.via),
        r.action === "denied" ? "Refused" : "Opened",
        r.ip || "",
        r.userAgent || "",
      ]
        .map(cell)
        .join(","),
    );
  }

  await logFileOpen({ user, pathname: "access-log/csv", req, label: accessLabel("Access log", f.range.label, "CSV") });
  const day = stamp.format(new Date()).slice(0, 10);
  return csvResponse(lines, `access-log-${f.range.key}-${day}.csv`);
}
