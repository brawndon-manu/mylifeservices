// WHAT A DECISION SAYS, IN ONE PLACE - Mánu 2026-09-12: "drop the name on auto
// flags... maybe auto flagged *bot emoticon* - blah blah blah."
//
// THE NAME WAS WRONG ON AN AUTO FLAG. 85 of the 120 flags on the current
// period are the engine's, and every one of them used to read "Flagged by
// Mánu Uribe" about a judgement he did not make - he pressed the button, the
// rules picked the shifts. Who ran it is still on the row in the database;
// it just stops being the thing the line claims.
//
// The robot is the lucide Bot rather than an emoji, at the size and stroke of
// the Flag beside it, because an emoji renders in whatever the device picks
// and sits at a different weight to everything around it.
//
// Three surfaces printed this line separately before: the card, a shift that
// has left the upload, and Focused review. One component so they cannot drift.
import { Bot } from "lucide-react";
import { isAutoFlag, flagReasonBody } from "@/lib/timesheet/auto-flag";

export default function DecisionLine({ review, decision = null }) {
  const settled = decision || review?.decision;
  // an approval never carries the engine's prefix - reviewShift only keeps a
  // reason on a flag - but the guard means an odd row cannot print
  // "Auto flagged" over the word Approved
  const auto = settled === "flagged" && isAutoFlag(review);
  const body = flagReasonBody(review?.reason);
  return (
    <>
      {settled === "approved" ? "Approved" : auto ? "Auto flagged" : "Flagged"}
      {auto ? (
        <>
          {" "}
          <span
            role="img"
            aria-label="flagged by the engine"
            title="Flagged by the engine"
            className="inline-block align-[-2px]"
          >
            <Bot size={13} aria-hidden="true" />
          </span>
        </>
      ) : review?.by ? ` by ${review.by}` : ""}
      {body ? ` - ${body}` : ""}
    </>
  );
}
