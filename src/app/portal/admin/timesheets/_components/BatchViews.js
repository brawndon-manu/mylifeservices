import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { REPORT_ROWS } from "@/lib/timesheet/reported-issues";
import styles from "./BatchViews.module.css";

export default async function BatchViews({ batchId, count, active = "employees" }) {
  const base = `/portal/admin/timesheets/${batchId}`;
  // reports still waiting on a decision, counted with the reported problems
  // page's own filter so the number here is its "waiting on you". the tab is
  // there either way, a period whose reports are all decided still has them.
  const waiting = await prisma.timesheetCorrection.count({
    where: { ...REPORT_ROWS, status: "open", timesheet: { batchId } },
  });
  const views = [
    { key: "employees", label: "Employees", href: `${base}#employees` },
    { key: "days", label: "Day by day", href: `${base}/calendar` },
    { key: "checks", label: "Data checks", href: `${base}/checks` },
    { key: "scheduling", label: "Scheduling", href: `${base}/scheduling` },
    { key: "payout", label: "Payout report", href: `${base}/report` },
    { key: "reported", label: "Reported problems", href: `${base}/corrections` },
  ];
  return (
    <nav id={active === "employees" ? "employees" : undefined} className={styles.views} aria-label="Timesheet views">
      {views.map((view) => (
        <Link key={view.key} href={view.href} aria-current={active === view.key ? "page" : undefined} className={styles.view}>
          {view.key === "scheduling" && <CalendarDays size={16} aria-hidden="true" />}
          {view.label}
          {view.key === "employees" && <span className={styles.count}>{count}</span>}
          {view.key === "reported" && waiting > 0 && <span className={`${styles.count} ${styles.waiting}`}>{waiting}</span>}
        </Link>
      ))}
    </nav>
  );
}
