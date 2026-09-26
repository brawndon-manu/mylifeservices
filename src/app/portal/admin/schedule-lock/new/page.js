import { redirect } from "next/navigation";
import { hasBlobStorage } from "@/lib/blob";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import LockWorkspace from "../LockWorkspace";
import LockUpload from "./LockUpload";
import audit from "../../audit/audit.module.css";

export const metadata = { title: "New upload · Schedule lock", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const when = (dt) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" })
    .format(new Date(dt)).replace(",", " ·");

// THE SCHEDULE LOCK'S DOOR. The same drop of QSP exports the audit takes; the
// first upload of a month locks the days picked, every later one is checked
// against that lock. The form learns which it will be off the schedule's own
// file name, so it can say so before anything goes up.
export default async function NewLockUploadPage() {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");
  const locks = await prisma.scheduleLockUpload.findMany({
    where: { lockId: null },
    select: { id: true, monthKey: true, fromDate: true, toDate: true, createdAt: true },
  });
  // today in the office's time, so the form's default days are the office's
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return (
    <LockWorkspace page="new">
      <header className={audit.heading}><div><h1>New upload</h1><p className={audit.subtitle}>The schedule exports, and the days to check.</p></div></header>
      <LockUpload
        today={today}
        blobUpload={hasBlobStorage()}
        locks={Object.fromEntries(locks.map((l) => [l.monthKey, { id: l.id, from: l.fromDate, to: l.toDate, at: when(l.createdAt) }]))}
      />
    </LockWorkspace>
  );
}
