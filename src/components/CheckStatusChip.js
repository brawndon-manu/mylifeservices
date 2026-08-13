import Avatar from "@/components/Avatar";
import ContactViaIcon from "@/components/ContactViaIcon";
import { checkStatus } from "@/lib/timesheet/check-status";

// WHERE THIS PERSON IS, as a label rather than a button.
//
// The state and the way to change it used to be one control: the chip WAS the
// button. Mánu 2026-08-13: "leave where it says contacted on the left, though.
// and the ability to mark should stay. even if they've selected something? so
// they can put the options. Again, you can put contact again or change it."
//
// He is right that they are two things. A chip that is also the only way to act
// means the act is hidden behind the state, and once something is selected there
// is nowhere obvious to press to contact them a SECOND time - which is the whole
// point of keeping a log. So this says where they are and does nothing, and
// `FlagButton` does the acting.
//
// Renders nothing when unmarked. An empty slot is the honest picture of "not
// started"; the row says so in words elsewhere and does not need it twice.
export default function CheckStatusChip({ flag, size = 18 }) {
  const meta = checkStatus(flag?.status);
  if (!meta) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${meta.chip}`}
    >
      {/* the face of whoever put it there, which is the half that answers "who
          has contacted who" on a worklist two people share */}
      {(flag.flaggedName || flag.flaggedImage) && (
        <span className="-ml-1 rounded-full ring-2 ring-surface">
          <Avatar name={flag.flaggedName} image={flag.flaggedImage} size={size} />
        </span>
      )}
      <ContactViaIcon via={flag.via} />
      {meta.label}
    </span>
  );
}
