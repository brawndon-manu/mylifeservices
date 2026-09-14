"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownAZ, Search } from "lucide-react";
import { payoutDisplayName, visiblePayoutRows } from "@/lib/timesheet/payout-names";
import styles from "./PayoutReport.module.css";

const fmt = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);

export default function PayoutTable({ rows, totals, periodTitle }) {
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState("first");
  const shown = visiblePayoutRows(rows, query, order);
  return <>
      <div className={styles.tableHeading}>
        <h2>Employee payout <span>{rows.length}</span></h2>
        <p id="payout-search-status" role="status">{shown.length} of {rows.length} employees · Sorted by {order === "first" ? "first name" : "last name"}</p>
      </div>
      <div className={styles.tableControls}>
        <label className={styles.searchBox}>
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search employee names</span>
          <input type="search" placeholder="Search legal or preferred name" value={query} onChange={(event) => setQuery(event.target.value)} aria-describedby="payout-search-status" />
        </label>
        <p>Hours, unless shown as miles. Totals and downloads include all {rows.length} employees.</p>
      </div>
      <div className={styles.tableScroll} role="region" aria-label="Employee payout details, scroll for all columns" tabIndex={0}>
        <table className={styles.table}>
          <caption className="sr-only">Payout for {periodTitle}. All employees and pay categories.</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.left} aria-sort="ascending">
                <button type="button" className={styles.sortButton} onClick={() => setOrder(order === "first" ? "last" : "first")} aria-label={`Employee, sorted by ${order === "first" ? "first name" : "last name"}. Sort by ${order === "first" ? "last name" : "first name"}`}>
                  Employee<ArrowDownAZ size={14} aria-hidden="true" />
                  <small>{order === "first" ? "First name" : "Last, First"}</small>
                </button>
              </th>
              <Th>Regular</Th>
              <Th>OT</Th>
              <Th>Double time</Th>
              <Th>Hours worked</Th>
              <Th>Premiums</Th>
              <Th>PTO</Th>
              <Th>Sick pay</Th>
              <Th>Total payable</Th>
              <Th>Miles driven</Th>
              <Th align="left">Status</Th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={11} className={styles.empty}>No employees match “{query}”. Try another name.</td></tr>}
            {shown.map((r) => (
              <tr key={r.id}>
                <th scope="row" className={styles.employee}>
                  <Link href={`/portal/admin/timesheets/sheet/${r.id}/report`}>{payoutDisplayName(r, order)}</Link>
                  {!r.matched && (
                    <span className={styles.unmatched}>
                      unmatched
                    </span>
                  )}
                  {r.preferred && (
                    <span className={styles.rowNote}>{r.preferred}</span>
                  )}
                </th>
                <Td>{fmt(r.regularHours)}</Td>
                <Td>{fmt(r.otHours)}</Td>
                <Td>{fmt(r.doubleHours)}</Td>
                <Td strong>{fmt(r.paidHours)}</Td>
                <Td tone={r.premiumHours > 0 ? "prem" : undefined}>
                  {fmt(r.premiumHours)}
                </Td>
                <Td strong={r.ptoHours > 0}>{fmt(r.ptoHours)}</Td>
                <Td strong={r.sickHours > 0}>{fmt(r.sickHours)}</Td>
                <Td strong>{fmt(r.payable)}</Td>
                <Td>{fmt(r.miles || 0)}</Td>
                <td className={styles.rowStatus}>
                  <span data-status={r.disputed ? "issue" : r.approvedAt || r.signedAt ? "complete" : "pending"}>
                  {r.disputed
                    ? "Reported a problem"
                    : r.approvedAt
                      ? "Approved"
                      : r.signedAt
                        ? "Signed"
                        : "Not signed"}
                  </span>
                  {r.recomputed && <small>Corrected</small>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className={styles.employee}>
                Pay-period total<span className={styles.rowNote}>{rows.length} employees</span>
              </th>
              <Td>{fmt(totals.regularHours)}</Td>
              <Td>{fmt(totals.otHours)}</Td>
              <Td>{fmt(totals.doubleHours)}</Td>
              <Td strong>{fmt(totals.paidHours)}</Td>
              <Td tone="prem">{fmt(totals.premiumHours)}</Td>
              <Td>{fmt(totals.ptoHours)}</Td>
              <Td>{fmt(totals.sickHours)}</Td>
              <Td strong>{fmt(totals.payable)}</Td>
              <Td strong>{fmt(totals.miles)}</Td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

  </>;
}

function Th({ children, align }) {
  return <th scope="col" className={align === "left" ? styles.left : undefined}>{children}</th>;
}

function Td({ children, strong, tone }) {
  return <td className={`${styles.numeric} ${strong || tone === "prem" ? styles.emphasis : ""}`}>{children}</td>;
}
