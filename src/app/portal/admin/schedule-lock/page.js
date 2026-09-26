import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import LockWorkspace from "./LockWorkspace";
import audit from "../audit/audit.module.css";
import styles from "./lock.module.css";

export const metadata = { title: "Schedule lock", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// 09/24/26 · 10:45 PM, in the office's time whatever the server's is
const when = (dt) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" })
    .format(new Date(dt)).replace(",", " ·");

const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

// THE SCHEDULE LOCK HOME: every month with its lock and the uploads checked
// against it, newest first - the audit's list, one lock per month.
export default async function ScheduleLockPage() {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");

  const uploads = await prisma.scheduleLockUpload.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, monthKey: true, lockId: true, fromDate: true, toDate: true, summary: true, presentIds: true, uploadedByName: true, createdAt: true },
  });
  const locks = uploads.filter((u) => !u.lockId);
  // what is still waiting on a decision, live, for each upload's changes
  const decisions = new Map(
    (await prisma.scheduleLockChange.findMany({
      where: { lockId: { in: locks.map((l) => l.id) } },
      select: { id: true, decision: true },
    })).map((c) => [c.id, c.decision]),
  );

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  const months = [...new Set([...locks.map((l) => l.monthKey), today])].sort().reverse();

  const tile = (u) => {
    const [m, d1] = u.fromDate.split("/");
    const d2 = u.toDate.split("/")[1];
    return (
      <span className={`${audit.calendar} ${audit.calendarData}`} aria-hidden="true">
        <small>{SHORT[Number(m) - 1]}</small>
        <strong>{Number(d1) === Number(d2) ? Number(d1) : `${Number(d1)}–${Number(d2)}`}</strong>
        <span>20{u.toDate.split("/")[2]}</span>
      </span>
    );
  };
  const range = (u) => `${u.fromDate.slice(0, 5)} to ${u.toDate.slice(0, 5)}`;

  return (
    <LockWorkspace page="home">
      <header className={audit.heading}>
        <div><h1>Schedule lock</h1><p className={audit.subtitle}>Every change to a locked schedule, approved or marked unauthorized.</p></div>
        <Link href="/portal/admin/schedule-lock/new" className={audit.primary}>New upload</Link>
      </header>
      {months.map((key) => {
        const lock = locks.find((l) => l.monthKey === key);
        const checks = lock ? uploads.filter((u) => u.lockId === lock.id) : [];
        const count = (lock ? 1 : 0) + checks.length;
        return (
          <section key={key} style={{ marginBottom: 34 }}>
            <div className={audit.sectionHeading}><h2>{monthLabel(key)}</h2><span>{plural(count, "upload")}</span></div>
            {!lock ? (
              <div className={audit.empty}>
                <p>Nothing locked for {MONTHS[Number(key.slice(5)) - 1]} yet.</p>
                <p className={audit.subtitle} style={{ margin: "8px auto 0" }}>Upload the schedule once it is final. The days you pick are locked from that upload.</p>
              </div>
            ) : (
              <ul className={audit.periodList}>
                {checks.map((u) => {
                  const s = u.summary || {};
                  const ids = Array.isArray(u.presentIds) ? u.presentIds : [];
                  const open = ids.filter((id) => decisions.has(id) && decisions.get(id) == null).length;
                  return (
                    <li key={u.id}>
                      <Link href={`/portal/admin/schedule-lock/${u.id}`} className={audit.periodRow}>
                        {tile(u)}
                        <span>
                          <span className={audit.periodTitle}>
                            Checked {range(u)}{" "}
                            {ids.length === 0
                              ? <span className={`${audit.statusChip} ${styles.chipDone}`}>● No changes</span>
                              : open > 0
                                ? <span className={`${audit.statusChip} ${styles.chipWarn}`}>● {open.toLocaleString()} not decided</span>
                                : <span className={`${audit.statusChip} ${styles.chipDone}`}>● All decided</span>}
                          </span>
                          <span className={audit.periodMeta}>
                            {plural(ids.length, "change")}
                            {s.fresh ? ` · ${s.fresh.toLocaleString()} new` : ""}
                            {s.matchesClock ? ` · ${s.matchesClock.toLocaleString()} ${s.matchesClock === 1 ? "matches" : "match"} the clock` : ""}
                            {s.awayFromClock ? ` · ${s.awayFromClock.toLocaleString()} away from the clock` : ""}
                            {` · uploaded ${when(u.createdAt)}`}
                            {u.uploadedByName ? ` · ${u.uploadedByName}` : ""}
                          </span>
                        </span>
                        <span className={audit.periodArrow} aria-hidden="true">›</span>
                      </Link>
                    </li>
                  );
                })}
                <li>
                  <Link href={`/portal/admin/schedule-lock/${lock.id}`} className={audit.periodRow}>
                    {tile(lock)}
                    <span>
                      <span className={audit.periodTitle}>
                        Locked {range(lock)}{" "}
                        <span className={`${audit.statusChip} ${styles.chipLock}`}><LockKeyhole size={11} aria-hidden="true" /> Locked</span>
                      </span>
                      <span className={audit.periodMeta}>
                        {plural(lock.summary?.lock?.calendars || 0, "calendar")} · {plural(lock.summary?.lock?.bookings || 0, "booking")}
                        {` · uploaded ${when(lock.createdAt)}`}
                        {lock.uploadedByName ? ` · ${lock.uploadedByName}` : ""}
                      </span>
                    </span>
                    <span className={audit.periodArrow} aria-hidden="true">›</span>
                  </Link>
                </li>
              </ul>
            )}
          </section>
        );
      })}
    </LockWorkspace>
  );
}
