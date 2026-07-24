import Link from "next/link";
import DatePicker from "@/components/DatePicker";
import {
  DEVICE_TYPES,
  DEVICE_STATUSES,
  DEVICE_NAME_MAX,
  DEVICE_SERIAL_MAX,
  DEVICE_ASSIGNED_MAX,
  DEVICE_NOTES_MAX,
  centsToInput,
} from "@/lib/devices";

// shared add/edit form. `action` is the bound server action, `device`
// prefills values on the edit page.
export default function DeviceForm({ action, device = null, submitLabel }) {
  const purchaseStr = device?.purchaseDate
    ? new Date(device.purchaseDate).toISOString().split("T")[0]
    : "";

  return (
    <form action={action} className="space-y-6">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-muted">
          Device name <span className="text-rose-600">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={DEVICE_NAME_MAX}
          defaultValue={device?.name ?? ""}
          placeholder='e.g. David&apos;s MacBook Pro 16"'
          className="mt-1 block w-full rounded-md border border-border-strong px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="type" className="block text-sm font-medium text-muted">
            Type
          </label>
          <select
            id="type"
            name="type"
            defaultValue={device?.type ?? "LAPTOP"}
            className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            {DEVICE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-muted">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={device?.status ?? "IN_USE"}
            className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            {DEVICE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="serialNumber"
            className="block text-sm font-medium text-muted"
          >
            Serial number <span className="text-faint">(optional)</span>
          </label>
          <input
            id="serialNumber"
            name="serialNumber"
            type="text"
            maxLength={DEVICE_SERIAL_MAX}
            defaultValue={device?.serialNumber ?? ""}
            autoComplete="off"
            className="mt-1 block w-full rounded-md border border-border-strong px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label htmlFor="price" className="block text-sm font-medium text-muted">
            Purchase price <span className="text-faint">(optional)</span>
          </label>
          <input
            id="price"
            name="price"
            type="text"
            inputMode="decimal"
            defaultValue={centsToInput(device?.priceCents)}
            placeholder="1299.99"
            className="mt-1 block w-full rounded-md border border-border-strong px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="purchaseDate"
            className="block text-sm font-medium text-muted"
          >
            Purchase date <span className="text-faint">(optional)</span>
          </label>
          <div className="mt-1">
            <DatePicker
              id="purchaseDate"
              name="purchaseDate"
              defaultValue={purchaseStr}
              inputClassName="block w-full rounded-md border border-border-strong px-3 py-2 pr-10 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="assignedTo"
            className="block text-sm font-medium text-muted"
          >
            Assigned to / location <span className="text-faint">(optional)</span>
          </label>
          <input
            id="assignedTo"
            name="assignedTo"
            type="text"
            maxLength={DEVICE_ASSIGNED_MAX}
            defaultValue={device?.assignedTo ?? ""}
            placeholder="e.g. David, home office"
            className="mt-1 block w-full rounded-md border border-border-strong px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-muted">
          Notes <span className="text-faint">(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={DEVICE_NOTES_MAX}
          defaultValue={device?.notes ?? ""}
          className="mt-1 block w-full rounded-md border border-border-strong px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
        <Link
          href="/portal/devices"
          className="text-sm font-medium text-muted transition hover:text-foreground"
        >
          Cancel
        </Link>
        <button
          type="submit"
          className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
