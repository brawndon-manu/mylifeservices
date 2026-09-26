import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import LockWorkspace from "../LockWorkspace";
import LockChanges from "./LockChanges";
import audit from "../../audit/audit.module.css";
import styles from "../lock.module.css";

export const metadata = { title: "Schedule lock", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const when = (dt) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" })
    .format(new Date(dt)).replace(",", " ·");

// "September 1–24, 2026" off the locked days
function daysLabel(from, to) {
  const [m, d1, y] = from.split("/").map(Number);
  const d2 = Number(to.split("/")[1]);
  return `${MONTHS[m - 1]} ${d1 === d2 ? d1 : `${d1}–${d2}`}, 20${y}`;
}
const navLabel = (from, to) => daysLabel(from, to).replace(/^([A-Za-z]{3})[a-z]*/, "$1").toUpperCase();

// ONE UPLOAD: the lock shows what it locked; a check shows every change it
// found against the lock, and the ones an earlier upload showed that it no
// longer does.
export default async function LockUploadPage({ params }) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");
  const { id } = await params;
  const upload = await prisma.scheduleLockUpload.findUnique({ where: { id } });
  if (!upload) notFound();
  const lock = upload.lockId ? await prisma.scheduleLockUpload.findUnique({ where: { id: upload.lockId } }) : upload;
  if (!lock) notFound();
  const uploads = await prisma.scheduleLockUpload.findMany({
    where: { OR: [{ id: lock.id }, { lockId: lock.id }] },
    orderBy: { createdAt: "desc" },
    select: { id: true, lockId: true, createdAt: true, summary: true, presentIds: true, uploadedByName: true },
  });

  if (!upload.lockId) {
    const s = upload.summary?.lock || {};
    const checks = uploads.filter((u) => u.lockId);
    const cover = (x) => (x?.cover ? `${x.cover.from.slice(0, 5)} to ${x.cover.to.slice(0, 5)}` : null);
    const tiles = [
      [s.calendars, "calendars", `${(s.bookings || 0).toLocaleString()} bookings · ${(s.hours || 0).toLocaleString()} hours`],
      [s.dsn?.count, "DSNs", cover(s.dsn) ? `the export covers ${cover(s.dsn)}` : "not in this upload"],
      [s.serviceNotes?.count, "service notes", cover(s.serviceNotes) ? `the export covers ${cover(s.serviceNotes)}` : "not in this upload"],
      [s.scheduleNotes?.count, "schedule notes", cover(s.scheduleNotes) ? `the export covers ${cover(s.scheduleNotes)}` : "not in this upload"],
      [s.clock?.count, "clock rows", cover(s.clock) ? `the export covers ${cover(s.clock)}` : "not in this upload"],
      [s.miles?.count, "trips", cover(s.miles) ? `the export covers ${cover(s.miles)}` : "not in this upload"],
    ];
    return (
      <LockWorkspace page="lock" periodLabel={navLabel(lock.fromDate, lock.toDate)}>
        <p className={audit.eyebrow}>{daysLabel(lock.fromDate, lock.toDate)}</p>
        <header className={audit.heading}>
          <div><h1>Locked</h1><p className={audit.subtitle} style={{ marginTop: 6 }}>{lock.fromDate} to {lock.toDate} · uploaded {when(lock.createdAt)}{lock.uploadedByName ? ` · ${lock.uploadedByName}` : ""}</p></div>
          <Link href="/portal/admin/schedule-lock/new" className={audit.primary}>New upload</Link>
        </header>
        <div className={styles.counts}>
          {tiles.map(([n, what, sub]) => (
            <div key={what} className={styles.count}>
              <strong>{n == null ? "—" : n.toLocaleString()}</strong>
              <span>{what}</span>
              <small>{sub}</small>
            </div>
          ))}
        </div>
        <section style={{ marginTop: 34 }}>
          <div className={audit.sectionHeading}><h2>Checked against this lock</h2><span>{checks.length} {checks.length === 1 ? "upload" : "uploads"}</span></div>
          {checks.length === 0 ? (
            <div className={audit.empty}><p>Nothing checked against it yet.</p></div>
          ) : (
            <ul className={audit.periodList}>
              {checks.map((u) => (
                <li key={u.id}>
                  <Link href={`/portal/admin/schedule-lock/${u.id}`} className={audit.periodRow}>
                    <span>
                      <span className={audit.periodTitle}>Checked {lock.fromDate.slice(0, 5)} to {lock.toDate.slice(0, 5)}</span>
                      <span className={audit.periodMeta}>{(u.summary?.changes || 0).toLocaleString()} changes · uploaded {when(u.createdAt)}{u.uploadedByName ? ` · ${u.uploadedByName}` : ""}</span>
                    </span>
                    <span className={audit.periodArrow} aria-hidden="true">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </LockWorkspace>
    );
  }

  const presentIds = Array.isArray(upload.presentIds) ? upload.presentIds : [];
  const goneIds = Array.isArray(upload.goneIds) ? upload.goneIds : [];
  const rows = await prisma.scheduleLockChange.findMany({
    where: { id: { in: [...presentIds, ...goneIds] } },
  });
  const uploadedAt = Object.fromEntries(uploads.map((u) => [u.id, when(u.createdAt)]));
  const gone = new Set(goneIds);
  const changes = rows.map((c) => ({
    id: c.id,
    source: c.source,
    kind: c.kind,
    employee: c.employee,
    date: c.date,
    lastDate: c.lastDate,
    before: c.before,
    after: c.after,
    evidence: c.evidence,
    matchesClock: c.matchesClock,
    awayFromClock: c.awayFromClock,
    gone: gone.has(c.id),
    firstSeen: c.firstUploadId === upload.id ? null : uploadedAt[c.firstUploadId] || null,
    decision: c.decision,
    decidedByName: c.decidedByName,
    decidedAt: c.decidedAt ? when(c.decidedAt) : null,
  }));

  return (
    <LockWorkspace page="check" periodLabel={navLabel(lock.fromDate, lock.toDate)}>
      <LockChanges
        uploadId={upload.id}
        eyebrow={daysLabel(lock.fromDate, lock.toDate)}
        from={lock.fromDate}
        to={lock.toDate}
        lockAt={when(lock.createdAt)}
        uploadAt={when(upload.createdAt)}
        compared={upload.summary?.compared || {}}
        changes={changes}
      />
    </LockWorkspace>
  );
}
