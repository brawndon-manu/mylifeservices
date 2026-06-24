import { POSITIONS, TITLE_MAX_LEN, parseTitle } from "@/lib/positions";

// multi-select position picker shared by the invite + edit user forms.
// checkboxes for the preset positions (someone can hold more than one)
// plus a free-text field for anything not in the list. no client JS
// needed - the server action reads getAll(fieldName) + the custom field.
//
// props:
//   - currentTitle:    existing User.title string (for prefilling on edit)
//   - fieldName:       checkbox name (server reads with formData.getAll)
//   - customFieldName: text input name for custom positions
export default function PositionPicker({
  currentTitle = null,
  fieldName,
  customFieldName,
}) {
  const { selected, custom } = parseTitle(currentTitle);

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {POSITIONS.map((p) => (
          <label
            key={p}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface-2 p-2.5 transition hover:border-brand-light hover:bg-sky-50"
          >
            <input
              type="checkbox"
              name={fieldName}
              value={p}
              defaultChecked={selected.includes(p)}
              className="h-4 w-4 accent-brand"
            />
            <span className="text-sm text-foreground">{p}</span>
          </label>
        ))}
      </div>
      <div>
        <input
          type="text"
          name={customFieldName}
          maxLength={TITLE_MAX_LEN}
          defaultValue={custom}
          autoComplete="off"
          placeholder="Other / custom (e.g. IT / Web Developer)"
          className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <p className="mt-1 text-xs text-muted">
          Pick all that apply. Use the box for anything not listed. Leave
          everything blank for no title.
        </p>
      </div>
    </div>
  );
}
