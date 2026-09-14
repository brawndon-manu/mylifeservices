import Link from "next/link";
import { CalendarDays } from "lucide-react";
import styles from "./BatchViews.module.css";

export default function BatchViews({ batchId, count, active = "employees" }) {
  const base = `/portal/admin/timesheets/${batchId}`;
  const views = [
    { key: "employees", label: "Employees", href: `${base}#employees` },
    { key: "days", label: "Day by day", href: `${base}/calendar` },
    { key: "checks", label: "Data checks", href: `${base}/checks` },
    { key: "scheduling", label: "Scheduling", href: `${base}/scheduling` },
    { key: "payout", label: "Payout report", href: `${base}/report` },
  ];
  return (
    <nav id={active === "employees" ? "employees" : undefined} className={styles.views} aria-label="Timesheet views">
      {views.map((view) => (
        <Link key={view.key} href={view.href} aria-current={active === view.key ? "page" : undefined} className={styles.view}>
          {view.key === "scheduling" && <CalendarDays size={16} aria-hidden="true" />}
          {view.label}
          {view.key === "employees" && <span className={styles.count}>{count}</span>}
        </Link>
      ))}
    </nav>
  );
}
