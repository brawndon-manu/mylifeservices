import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import {
  isElevated,
  isIT,
  isManagerUp,
  isSuper,
  canSeeRoles,
  canManageUser,
  canAssignRole,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
} from "@/lib/roles";
import { isLockedSuperEmail } from "@/lib/security";
import { preferredName } from "@/lib/contacts";
import PeopleManager from "./_components/PeopleManager";

export const metadata = {
  title: "People",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ROLE_ORDER = ["STAFF", "SUPERVISOR", "HR", "MANAGER", "ADMIN", "IT_ADMIN", "SUPER"];
const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

function tenureLabel(hireDate, now) {
  const months =
    (now.getFullYear() - hireDate.getFullYear()) * 12 + (now.getMonth() - hireDate.getMonth());
  if (months < 0) return "starts soon";
  if (months === 0) return "<1mo";
  const y = Math.floor(months / 12), m = months % 12;
  if (y === 0) return `${m}mo`;
  if (m === 0) return `${y}y`;
  return `${y}y ${m}mo`;
}

export default async function UsersPage({ searchParams }) {
  const current = await getCurrentUser();
  if (!isElevated(current?.role)) redirect("/portal");

  const showRoles = canSeeRoles(current.role);
  const canEditRole = isIT(current.role);
  const canEditHire = isManagerUp(current.role);

  const params = await searchParams;
  const flash = {
    invited: typeof params?.invited === "string" ? params.invited : null,
    updated: typeof params?.updated === "string" ? params.updated : null,
    deactivated: typeof params?.deactivated === "string" ? params.deactivated : null,
    reactivated: typeof params?.reactivated === "string" ? params.reactivated : null,
    error: typeof params?.error === "string" ? params.error : null,
  };

  const rows = await prisma.user.findMany({
    orderBy: [{ deactivatedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    select: {
      id: true, email: true, name: true, preferredFirstName: true, preferredLastName: true,
      image: true, role: true, title: true, offices: true, hireDate: true, phone: true,
      workingHours: true, deactivatedAt: true,
    },
  });

  const now = new Date();
  const users = rows.map((u) => ({
    id: u.id,
    email: u.email,
    image: u.image || null,
    displayName: preferredName(u) || u.email.split("@")[0],
    name: u.name || "",
    preferredFirstName: u.preferredFirstName || "",
    preferredLastName: u.preferredLastName || "",
    role: u.role,
    title: u.title || "",
    offices: u.offices || [],
    phone: u.phone || "",
    workingHours: u.workingHours || "",
    hired: u.hireDate ? MONTH_FMT.format(u.hireDate) : "",
    tenure: u.hireDate ? tenureLabel(u.hireDate, now) : "",
    hireDateValue: u.hireDate ? u.hireDate.toISOString().slice(0, 10) : "",
    active: !u.deactivatedAt,
    locked: isLockedSuperEmail(u.email),
    isSelf: u.id === current.id,
    // can this viewer open the editor for this row? (server re-checks on submit)
    canManage: canManageUser(current.role, u.role) && (u.id !== current.id || isSuper(current.role)),
  }));

  const roleOptions = ROLE_ORDER.filter((r) => canAssignRole(current.role, r)).map((r) => ({
    value: r, label: ROLE_LABELS[r], desc: ROLE_DESCRIPTIONS[r],
  }));

  const activeCount = users.filter((u) => u.active).length;

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/portal/admin" className="text-sm font-medium text-muted transition hover:text-brand">
        ← Back to admin dashboard
      </Link>
      <PeopleManager
        users={users}
        showRoles={showRoles}
        canEditRole={canEditRole}
        canEditHire={canEditHire}
        roleOptions={roleOptions}
        activeCount={activeCount}
        totalCount={users.length}
        flash={flash}
      />
    </section>
  );
}
