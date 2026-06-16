import Link from "next/link";
import PhoneInput from "@/components/PhoneInput";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated } from "@/lib/roles";
import {
  RESOURCE_NAME_MAX,
  RESOURCE_NOTES_MAX,
  RESOURCE_ADDRESS_MAX,
  RESOURCE_CATEGORIES,
} from "@/lib/contacts";
import { submitResource } from "../../actions";

export const metadata = {
  title: "Add resource · MLS Portal",
  robots: { index: false, follow: false },
};

const ERRORS = {
  name: "Please give the resource a name.",
};

export default async function NewResourcePage({ searchParams }) {
  const params = await searchParams;
  const errorMessage = params?.error ? ERRORS[params.error] : null;
  const user = await getCurrentUser();
  const elevated = isElevated(user.role);

  return (
    <section className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <Link
        href="/portal/contacts"
        className="text-sm font-medium text-slate-600 transition hover:text-brand"
      >
        ← Back to Team Contacts
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Add a resource
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        A community partner or service the team uses, like a housing
        provider, food bank, or clinic.{" "}
        {elevated
          ? "As management, yours is added right away."
          : "Management reviews it before it shows on the directory."}
      </p>

      {errorMessage && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          {errorMessage}
        </div>
      )}

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <form action={submitResource} className="space-y-6">
          <Field
            id="name"
            label="Name"
            required
            maxLength={RESOURCE_NAME_MAX}
            placeholder="e.g. Integrity Cottages"
          />
          <div>
            <label
              htmlFor="category"
              className="block text-sm font-medium text-slate-700"
            >
              Category <span className="text-rose-600">*</span>
            </label>
            <select
              id="category"
              name="category"
              defaultValue="Housing"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              {RESOURCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Groups the resource on the contacts page.
            </p>
          </div>
          <Field
            id="phone"
            label="Phone"
            optional
            type="tel"
            placeholder="(909) 555-0123"
          />
          <Field
            id="email"
            label="Email"
            optional
            type="email"
            placeholder="contact@example.org"
          />
          <Field
            id="website"
            label="Website"
            optional
            placeholder="example.org"
          />
          <Field
            id="address"
            label="Address"
            optional
            maxLength={RESOURCE_ADDRESS_MAX}
            placeholder="123 Main St, Orange, CA 92868"
          />
          <div>
            <label
              htmlFor="notes"
              className="block text-sm font-medium text-slate-700"
            >
              Notes <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              maxLength={RESOURCE_NOTES_MAX}
              placeholder="What they do, who to ask for, anything helpful."
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
            <Link
              href="/portal/contacts"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
            >
              {elevated ? "Add resource" : "Submit for review"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function Field({ id, label, optional, required, type = "text", maxLength, placeholder }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}{" "}
        {required && <span className="text-rose-600">*</span>}
        {optional && <span className="text-slate-400">(optional)</span>}
      </label>
      {type === "tel" ? (
        <PhoneInput
          id={id}
          name={id}
          required={required}
          maxLength={maxLength}
          placeholder={placeholder}
          autoComplete="off"
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      ) : (
        <input
          id={id}
          name={id}
          type={type}
          required={required}
          maxLength={maxLength}
          placeholder={placeholder}
          autoComplete="off"
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      )}
    </div>
  );
}
