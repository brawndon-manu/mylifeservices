import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const session = await auth();
  // double-check here even though proxy.js already gates this. if someone
  // ever messes with the proxy matcher or bypasses it some other way, this
  // is the backstop. cheap to run and worth the peace of mind.
  if (session?.user?.role !== "IT_ADMIN") {
    redirect("/portal");
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  return (
    <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-light">
        IT Admin
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        User management
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-700">
        Provisioned portal users. To grant someone access, add them to the
        database first — sign-in is invite-only.
      </p>

      <div className="mt-10 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
            <tr>
              <th className="px-6 py-3 font-semibold">Email</th>
              <th className="px-6 py-3 font-semibold">Name</th>
              <th className="px-6 py-3 font-semibold">Role</th>
              <th className="px-6 py-3 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-6 py-3">{u.email}</td>
                <td className="px-6 py-3">{u.name ?? "—"}</td>
                <td className="px-6 py-3">
                  <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-brand">
                    {u.role}
                  </span>
                </td>
                <td className="px-6 py-3 text-slate-500">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
