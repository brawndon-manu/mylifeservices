"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import DatePicker from "@/components/DatePicker";
import { roleBadgeClass, ROLE_LABELS } from "@/lib/roles";
import { OFFICE_LABELS, OFFICE_FULL } from "@/lib/positions";
import PositionPicker from "./PositionPicker";
import { updateUser, deactivateUser, reactivateUser, inviteUser } from "../actions";

// the People admin: one searchable/filterable/groupable list that leads with the
// person (avatar + name), shows every column without a horizontal scroll, reflows
// to cards on mobile, and edits inline in a right-side drawer.

function OfficePills({ offices }) {
  if (!offices?.length) return <span className="text-faint">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {offices.map((o) => (
        <span
          key={o}
          title={OFFICE_FULL[o] || o}
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
            o === "DP" ? "border-brand-light/50 text-brand-light" : "border-border-strong text-muted"
          }`}
        >
          {OFFICE_LABELS[o] || o}
        </span>
      ))}
    </span>
  );
}

function RoleBadge({ role }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${roleBadgeClass(role)}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function StatusPill({ active }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${active ? "text-emerald-500" : "text-faint"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-faint"}`} />
      {active ? "Active" : "Deactivated"}
    </span>
  );
}

const GRID = "sm:grid sm:grid-cols-[minmax(0,1fr)_205px_90px_104px_92px_96px_56px] sm:items-center sm:gap-3";

function PersonRow({ u, showRoles, onEdit }) {
  return (
    <div className={`border-t border-border first:border-t-0 ${u.active ? "" : "opacity-60"}`}>
      {/* desktop */}
      <div className={`hidden px-4 py-2.5 ${GRID}`}>
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={u.displayName} email={u.email} image={u.image} size={34} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{u.displayName}</div>
            <div className="truncate text-xs text-faint">{u.email}</div>
          </div>
        </div>
        <div className="truncate text-[13px] text-muted">{u.title || <span className="text-faint">—</span>}</div>
        <OfficePills offices={u.offices} />
        <div className="text-[13px] leading-tight text-muted">
          {u.hired ? (
            <>
              <div className="whitespace-nowrap">{u.hired}</div>
              {u.tenure && <div className="whitespace-nowrap text-[11px] text-faint">{u.tenure}</div>}
            </>
          ) : (
            <span className="text-faint">—</span>
          )}
        </div>
        <div>{showRoles ? <RoleBadge role={u.role} /> : <span className="text-faint">—</span>}</div>
        <StatusPill active={u.active} />
        <div className="text-right">
          {u.canManage && (
            <button
              type="button"
              onClick={() => onEdit(u)}
              className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-muted transition hover:border-brand hover:text-brand"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* mobile card */}
      <div className="px-3.5 py-3 sm:hidden">
        <div className="flex items-center gap-3">
          <Avatar name={u.displayName} email={u.email} image={u.image} size={40} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">{u.displayName}</div>
            <div className="truncate text-xs text-faint">{u.email}</div>
          </div>
          {u.canManage && (
            <button
              type="button"
              onClick={() => onEdit(u)}
              className="flex-none rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-muted"
            >
              Edit
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
          <span><span className="mr-1.5 text-[11px] uppercase tracking-wide text-faint">Title</span>{u.title || "—"}</span>
          <span className="inline-flex items-center gap-1.5"><span className="text-[11px] uppercase tracking-wide text-faint">Office</span><OfficePills offices={u.offices} /></span>
          {showRoles && <span className="inline-flex items-center gap-1.5"><span className="text-[11px] uppercase tracking-wide text-faint">Role</span><RoleBadge role={u.role} /></span>}
          {u.hired && <span><span className="mr-1.5 text-[11px] uppercase tracking-wide text-faint">Hired</span>{u.hired}</span>}
          <span className="inline-flex items-center gap-1.5"><span className="text-[11px] uppercase tracking-wide text-faint">Status</span><StatusPill active={u.active} /></span>
        </div>
      </div>
    </div>
  );
}

const GROUPS = [
  { key: "none", label: "None" },
  { key: "title", label: "Title" },
  { key: "office", label: "Office" },
  { key: "role", label: "Role" },
];

export default function PeopleManager({
  users, showRoles, canEditRole, canEditHire, roleOptions, activeCount, totalCount, flash,
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState("all");
  const [groupBy, setGroupBy] = useState("none");
  const [editing, setEditing] = useState(null); // user being edited
  const [inviting, setInviting] = useState(false);
  const [toast, setToast] = useState(null);

  // pop a transient message. we refresh server data in place (router.refresh)
  // instead of navigating, so the current search / filter / group stays put.
  const flashToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  };
  const saveEdit = async (formData) => {
    const r = await updateUser(editing.id, formData);
    if (r?.ok) { setEditing(null); flashToast("Changes saved"); router.refresh(); }
  };
  const deact = async () => {
    const r = await deactivateUser(editing.id);
    if (r?.ok) { setEditing(null); flashToast(`${r.email} deactivated`); router.refresh(); }
    else if (r?.error === "locked") flashToast("That account can't be deactivated");
  };
  const react = async () => {
    const r = await reactivateUser(editing.id);
    if (r?.ok) { setEditing(null); flashToast(`${r.email} reactivated`); router.refresh(); }
  };
  const sendInvite = async (formData) => {
    const r = await inviteUser(formData);
    if (r?.ok) { setInviting(false); flashToast(`Invited ${r.email}`); router.refresh(); }
  };

  const CHIPS = [
    { key: "all", label: `All ${totalCount}`, test: () => true },
    { key: "leadership", label: "Leadership", test: (u) => u.role !== "STAFF" },
    { key: "instructors", label: "Instructors", test: (u) => /independent living instructor/i.test(u.title) },
    { key: "mls", label: "MLS", test: (u) => u.offices.includes("MLS") },
    { key: "dp", label: "DP", test: (u) => u.offices.includes("DP") },
    { key: "needstitle", label: "Needs a title", test: (u) => !u.title || u.title === "Unknown Job Title" },
    { key: "deactivated", label: "Deactivated", test: (u) => !u.active },
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chipTest = (CHIPS.find((c) => c.key === chip) || CHIPS[0]).test;
    return users.filter((u) => {
      if (!chipTest(u)) return false;
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.title.toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, query, chip]);

  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const keyOf = (u) =>
      groupBy === "role" ? ROLE_LABELS[u.role] || u.role
        : groupBy === "title" ? (u.title || "Needs a title")
        : (u.offices.length ? u.offices.map((o) => OFFICE_LABELS[o]).join(" + ") : "No office");
    const map = new Map();
    for (const u of filtered) {
      const k = keyOf(u);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(u);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered, groupBy]);

  const flashBanner = () => {
    const f = flash || {};
    if (f.invited) return ["success", `${f.invited} can now sign in at /login.`];
    if (f.updated) return ["success", "Changes saved."];
    if (f.deactivated) return ["warning", `${f.deactivated} can no longer sign in. Their data is kept.`];
    if (f.reactivated) return ["success", `${f.reactivated} can sign in again.`];
    if (f.error) return ["error", { self: "You can't edit your own account here.", exists: "That email already has portal access.", forbidden: "You can't manage that account.", locked: "That permanent superuser can't be changed.", name: "Name must be 1-30 characters.", role: "Pick a valid role.", email: "That email doesn't look valid." }[f.error] || "Something went wrong."];
    return null;
  };
  const banner = flashBanner();

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">People</h1>
          <p className="mt-2 text-sm text-muted">
            {totalCount} people · {activeCount} active · sign-in is invite-only
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInviting(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-light px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand"
        >
          <PlusIcon /> Invite people
        </button>
      </div>

      {banner && (
        <div className={`mt-4 rounded-lg border px-4 py-2.5 text-sm ${
          banner[0] === "error" ? "border-rose-300/40 bg-rose-500/10 text-rose-300"
          : banner[0] === "warning" ? "border-amber-300/40 bg-amber-500/10 text-amber-300"
          : "border-emerald-300/40 bg-emerald-500/10 text-emerald-300"}`}>
          {banner[1]}
        </div>
      )}

      {/* toolbar */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, or title…"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-faint focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Group by</span>
          <div className="inline-flex overflow-hidden rounded-lg border border-border bg-background">
            {GROUPS.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setGroupBy(g.key)}
                className={`border-l border-border px-2.5 py-1.5 text-xs font-semibold transition first:border-l-0 ${
                  groupBy === g.key ? "bg-brand-light/15 text-brand-dark" : "text-muted hover:text-foreground"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setChip(c.key)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              chip === c.key ? "border-brand bg-brand-light/10 text-brand-dark" : "border-border bg-background text-muted hover:text-foreground"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* header (desktop) */}
      <div className="mt-4 rounded-xl border border-border bg-surface">
        <div className={`hidden px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-faint ${GRID} border-b border-border`}>
          <span>Person</span><span>Title</span><span>Office</span><span>Hired</span>
          <span>{showRoles ? "Role" : ""}</span><span>Status</span><span></span>
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-faint">No one matches.</p>
        ) : groups ? (
          groups.map(([label, list]) => (
            <details key={label} open className="border-t border-border first:border-t-0">
              <summary className="flex cursor-pointer list-none items-center gap-2.5 bg-surface-2/40 px-4 py-2.5">
                <ChevronIcon />
                <span className="text-sm font-bold text-foreground">{label}</span>
                <span className="text-xs text-faint">{list.length}</span>
                <span className="ml-auto flex">
                  {list.slice(0, 6).map((u) => (
                    <span key={u.id} className="-ml-2 rounded-full ring-2 ring-surface first:ml-0">
                      <Avatar name={u.displayName} email={u.email} image={u.image} size={22} />
                    </span>
                  ))}
                </span>
              </summary>
              <div>
                {list.map((u) => <PersonRow key={u.id} u={u} showRoles={showRoles} onEdit={setEditing} />)}
              </div>
            </details>
          ))
        ) : (
          filtered.map((u) => <PersonRow key={u.id} u={u} showRoles={showRoles} onEdit={setEditing} />)
        )}
      </div>

      {editing && (
        <EditDrawer
          key={editing.id}
          u={editing}
          showRoles={showRoles}
          canEditRole={canEditRole}
          canEditHire={canEditHire}
          roleOptions={roleOptions}
          onSave={saveEdit}
          onDeactivate={deact}
          onReactivate={react}
          onClose={() => setEditing(null)}
        />
      )}
      {inviting && (
        <InviteModal
          canEditRole={canEditRole}
          canEditHire={canEditHire}
          roleOptions={roleOptions}
          onInvite={sendInvite}
          onClose={() => setInviting(false)}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="mt-4">
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-faint">
        {label}
        {hint && <span className="ml-1.5 font-normal normal-case tracking-normal text-faint">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT = "w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none";

function OfficeToggles({ defaultOffices = [] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {["MLS", "DP"].map((o) => (
        <label key={o} className="cursor-pointer">
          <input type="checkbox" name="offices" value={o} defaultChecked={defaultOffices.includes(o)} className="peer sr-only" />
          <span className="inline-flex rounded-full border border-border-strong px-4 py-1.5 text-sm font-semibold text-muted transition peer-checked:border-brand peer-checked:bg-brand-light/15 peer-checked:text-brand-dark">
            {o}
          </span>
        </label>
      ))}
      <span className="inline-flex items-center rounded-full border border-dashed border-border-strong px-3 py-1.5 text-xs font-medium text-faint">＋ more later</span>
    </div>
  );
}

function RoleSelect({ roleOptions, defaultRole }) {
  return (
    <select name="role" defaultValue={defaultRole} className={INPUT}>
      {roleOptions.map((r) => (
        <option key={r.value} value={r.value}>{r.label}</option>
      ))}
    </select>
  );
}

function EditDrawer({ u, showRoles, canEditRole, canEditHire, roleOptions, onSave, onDeactivate, onReactivate, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 h-full w-[440px] max-w-[92vw] overflow-y-auto border-l border-border-strong bg-surface p-6">
        <div className="flex items-center gap-3">
          <Avatar name={u.displayName} email={u.email} image={u.image} size={56} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold text-foreground">{u.displayName}</div>
            <div className="truncate text-xs text-muted">{u.email}</div>
          </div>
          <button type="button" onClick={onClose} className="text-xl text-faint transition hover:text-foreground">✕</button>
        </div>

        <form action={onSave}>
          <Field label="Full name">
            <input name="name" defaultValue={u.name} maxLength={30} required className={INPUT} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preferred first"><input name="preferredFirstName" defaultValue={u.preferredFirstName} maxLength={30} className={INPUT} /></Field>
            <Field label="Preferred last"><input name="preferredLastName" defaultValue={u.preferredLastName} maxLength={30} className={INPUT} /></Field>
          </div>
          <Field label="Job title">
            <PositionPicker currentTitle={u.title} fieldName="titlePositions" />
          </Field>
          <Field label="Office" hint="· pick any, more can be added">
            <OfficeToggles defaultOffices={u.offices} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {canEditHire && (
              <Field label="Hire date"><DatePicker name="hireDate" defaultValue={u.hireDateValue} inputClassName={`${INPUT} pr-10`} /></Field>
            )}
            <Field label="Phone"><input name="phone" defaultValue={u.phone} className={INPUT} placeholder="(909) 555-0123" /></Field>
          </div>
          <Field label="Working hours" hint="(optional)">
            <input name="workingHours" defaultValue={u.workingHours} className={INPUT} placeholder="Mon-Fri 9am-5pm" />
          </Field>
          {canEditRole ? (
            <Field label="Privilege role">
              <RoleSelect roleOptions={roleOptions} defaultRole={u.role} />
            </Field>
          ) : showRoles ? (
            <Field label="Privilege role"><div className="py-1"><RoleBadge role={u.role} /> <span className="text-xs text-faint">· set by IT</span></div></Field>
          ) : null}

          <div className="mt-6 flex items-center gap-2">
            <button type="submit" className="rounded-lg bg-brand-light px-4 py-2 text-sm font-bold text-white transition hover:bg-brand">Save</button>
            <button type="button" onClick={onClose} className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-muted">Cancel</button>
          </div>
        </form>

        {!u.locked && (
          <div className="mt-5 border-t border-border pt-4">
            {u.active ? (
              <form action={onDeactivate}>
                <button type="submit" className="rounded-lg border border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-400 transition hover:bg-rose-500/10">Deactivate user</button>
                <p className="mt-1.5 text-xs text-faint">Blocks sign-in. Data is kept; reactivate anytime.</p>
              </form>
            ) : (
              <form action={onReactivate}>
                <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700">Reactivate user</button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InviteModal({ canEditRole, canEditHire, roleOptions, onInvite, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-[480px] max-w-full overflow-y-auto rounded-2xl border border-border-strong bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Invite people</h2>
          <button type="button" onClick={onClose} className="text-xl text-faint transition hover:text-foreground">✕</button>
        </div>
        <p className="mt-1 text-sm text-muted">They can sign in with a one-time email link once added.</p>
        <form action={onInvite}>
          <Field label="Email"><input name="email" type="email" required className={INPUT} placeholder="name.mylifeservices@gmail.com" /></Field>
          <Field label="Full name" hint="(optional)"><input name="name" maxLength={30} className={INPUT} placeholder="First Last" /></Field>
          <Field label="Job title" hint="(optional)">
            <PositionPicker fieldName="titlePositions" />
          </Field>
          <Field label="Office"><OfficeToggles defaultOffices={["MLS"]} /></Field>
          <div className="grid grid-cols-2 gap-3">
            {canEditHire && <Field label="Hire date" hint="(optional)"><DatePicker name="hireDate" inputClassName={`${INPUT} pr-10`} /></Field>}
            {canEditRole && <Field label="Role"><RoleSelect roleOptions={roleOptions} defaultRole="STAFF" /></Field>}
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-muted">Cancel</button>
            <button type="submit" className="rounded-lg bg-brand-light px-4 py-2 text-sm font-bold text-white transition hover:bg-brand">Send invite</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PlusIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-4 w-4"><path d="M12 5v14M5 12h14" /></svg>;
}
function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4 text-faint"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>;
}
function ChevronIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5 text-faint"><path d="m6 9 6 6 6-6" /></svg>;
}
