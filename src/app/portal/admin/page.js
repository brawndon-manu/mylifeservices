import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import {
  isElevated,
  isAdminUp,
  isIT,
  canEnterAdmin,
  canViewFormRecords,
  canManageTimesheets,
  canManageClientAttestations,
} from "@/lib/roles";
import { getMaintenanceState } from "@/lib/maintenance";
import { toggleMaintenance } from "./maintenance-actions";
import AdminTools from "./AdminTools";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// admin landing - the management tools grouped by task, rendered by the
// AdminTools client component (it owns the search filter and the maintenance
// disclosure). gated to the oversight tier plus field supervisors (proxy
// already gates /portal/admin/*; re-checked here). a supervisor sees exactly
// three rows: client attestations, the satisfaction survey, and a read-only
// People.
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!canEnterAdmin(user?.role)) {
    redirect("/portal");
  }
  const role = user.role;

  // maintenance switch is IT / SUPER only; skip the redis read for others.
  const canMaintain = isIT(role);
  const maintenanceOn = canMaintain ? await getMaintenanceState() : false;

  // every tool with the same role gate it had as a card. two packed columns,
  // matching the approved layout; an empty group never renders its heading.
  const left = [
    {
      label: "Payroll & review",
      rows: [
        {
          show: canManageTimesheets(role),
          href: "/portal/admin/timesheets",
          icon: "clock",
          title: "Timesheets",
          body: "Agency payroll and staff signatures.",
        },
        {
          show: canManageTimesheets(role),
          href: "/portal/admin/day-program",
          icon: "calendar",
          title: "Day program",
          body: "Separate payroll for the day program.",
        },
        {
          show: isAdminUp(role),
          href: "/portal/admin/audit",
          icon: "listChecks",
          title: "Audit",
          body: "Compare billed time, punches, and notes.",
        },
      ],
    },
    {
      label: "Client services",
      rows: [
        {
          show: canManageClientAttestations(role),
          href: "/portal/admin/client-attestations",
          icon: "penLine",
          title: "Client attestations",
          body: "Monthly schedules and client signatures.",
        },
        {
          show: canManageClientAttestations(role),
          href: "/portal/admin/satisfaction",
          icon: "messageSquare",
          title: "Annual satisfaction survey",
          body: "Collect and review client feedback.",
        },
      ],
    },
    {
      label: "Website tools",
      rows: [
        {
          show: isAdminUp(role),
          href: "/portal/site-photos",
          icon: "image",
          title: "Site photos",
          body: "Photos, captions, and visibility.",
        },
        {
          show: canManageTimesheets(role),
          href: "/portal/admin/tests",
          icon: "flask",
          title: "Tests",
          body: "Preview emails and employee screens.",
        },
      ],
    },
  ];
  const right = [
    {
      label: "People & equipment",
      rows: [
        {
          show: true,
          href: "/portal/admin/users",
          icon: "users",
          title: "User management",
          body: "Accounts, roles, and contact details.",
        },
        {
          show: isElevated(role),
          href: "/portal/admin/applications",
          icon: "briefcase",
          title: "Applications",
          body: "Job applications and résumés.",
        },
        {
          show: isElevated(role),
          href: "/portal/devices",
          icon: "laptop",
          title: "Devices",
          body: "Company hardware and assignments.",
        },
      ],
    },
    {
      label: "Company records",
      rows: [
        {
          show: isAdminUp(role),
          href: "/portal/admin/acknowledgments",
          icon: "circleCheck",
          title: "Acknowledgments",
          body: "Announcement read receipts.",
        },
        {
          show: isAdminUp(role),
          href: "/portal/admin/meeting-attendance",
          icon: "calendarDays",
          title: "Meeting attendance",
          body: "RSVPs and meeting roll-call.",
        },
        {
          show: canViewFormRecords(role),
          href: "/portal/admin/forms",
          icon: "files",
          title: "Form submissions",
          body: "Signed forms and attribution.",
        },
      ],
    },
  ];
  const columns = [left, right].map((groups) =>
    groups
      .map((g) => ({ ...g, rows: g.rows.filter((r) => r.show).map(({ show, ...r }) => r) }))
      .filter((g) => g.rows.length > 0),
  );

  return (
    <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
      <AdminTools
        columns={columns}
        maintenance={canMaintain ? { on: maintenanceOn } : null}
        toggleMaintenance={toggleMaintenance}
      />
    </section>
  );
}
