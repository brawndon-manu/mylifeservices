// READING A ROSTERED BLOCK'S TEXT, and deciding whether two of them overlap.
//
// Moved out of the checks page verbatim on 2026-08-12, unchanged, so the new
// all-employees screen can ask the same question the checks list asks instead of
// answering it a second way. Every bug on 2026-08-11 was one fact stated in two
// places with one copy drifted.
//
// Two client bookings that overlap in time are not a punch error. QSP writes
// them as one run of punches, so the second booking's start lands before the
// first one's end. The engine calls any space between two work segments a break,
// so it computes that one as minus thirty minutes - which is arithmetic, not a
// break anybody took.
//
// On 07/16-07/31 EVERY punch issue in the batch was this - 17 of 17 - and every
// one of them offered a "repair" that cut hours, 23.59 in total. Delgado Pineda
// 07/19 proposed 7.28 down to 1.38 on a day the schedule confirms at 7.28.
// None was applied, because a repair has to be confirmed by the schedule first,
// but they were being shown as though they had been.
export const RANGE = /^(\d{1,2}(?::\d{2})?[ap])-(\d{1,2}(?::\d{2})?[ap])/i;

export function toMin(t) {
  const m = /^(\d{1,2})(?::(\d{2}))?([ap])$/i.exec(t);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "p") h += 12;
  return h * 60 + Number(m[2] || 0);
}

// What a scheduled block actually IS, read off the text QSP prints:
// "10:30a-2:06p Duff, E-ILS Service (3:36)" is a client visit, "2p-2:30p -ILS
// Travel(0:30)" is not.
//
// This matters because the row used to say "two client bookings overlap" on
// every one of these, and on 07/16-07/31 that was true of exactly 2 of 17. The
// other 15 are a client visit running over travel (12), training (2), admin (1)
// or misc. Telling somebody two clients were double-booked when one of them was
// the drive between them sends them looking for a scheduling problem that isn't
// there.
// THE SERVICE A BLOCK IS BILLED UNDER, exactly as QSP spells it: "ILS Service",
// "Self Determination Program", "ILS Travel", "Meal Break". Across 07/16-08/31
// the schedule prints eight of them and nothing else.
//
// Separate from `blockKind` below, which turns the same reading into a phrase
// for a sentence ("a client booking"). The compliance rules need the name, not
// the phrase - the 3.5 hour cap applies to two services by name and to no
// other - and one parser answering both is the point. A client whose surname
// carries a hyphen ("Conklin-Miller, E-ILS Service(3:00)") resolves correctly:
// the type may hold letters and spaces but no comma, so the earlier dash fails
// to match and the engine advances to the real one.
export function blockService(text) {
  const m = /-\s*([A-Za-z][A-Za-z ]*?)\s*\(/.exec(String(text || "").replace(RANGE, ""));
  return m ? m[1].trim() : null;
}

// the client a block is booked against, or "" on a block with none (travel,
// admin, training all print with an empty name before the dash).
export function blockClient(text) {
  const m = /^\s*(.*?)-\s*(?:[A-Za-z][A-Za-z ]*?)\s*\(/.exec(String(text || "").replace(RANGE, ""));
  return m ? m[1].trim() : null;
}

export function blockKind(text) {
  const service = blockService(text);
  if (service == null) return "another scheduled block";
  const client = blockClient(text) || "";
  // "ILS Service" and "Service" have always read the same here
  const type = service.replace(/^ILS\s+/i, "").trim().toLowerCase();
  if (type === "service") return client ? "a client booking" : "a service block";
  // Self Determination is a client service like ILS Service is, and read as
  // "another scheduled block" until 2026-08-22 - so an overlap between two of
  // them described itself as vaguely as an overlap with a training block. 33
  // of these are rostered across 07/16-08/31 and they carry the same 3.5 hour
  // cap, which is the whole reason the distinction started mattering.
  if (type === "self determination program") return client ? "a client booking" : "a service block";
  if (type === "travel") return "a travel block";
  if (type === "training") return "a training block";
  if (type === "admin") return "an admin block";
  if (type === "misc") return "a miscellaneous block";
  if (type === "meal break") return "a meal break";
  return "another scheduled block";
}

// null when nothing overlaps; otherwise the phrase naming the two blocks that do
export function overlapInfo(shifts) {
  const r = (shifts || [])
    .map((s) => {
      const m = RANGE.exec(String(s.text || "").trim());
      return m ? { a: toMin(m[1]), b: toMin(m[2]), text: s.text } : null;
    })
    .filter((x) => x && x.a != null && x.b != null)
    .sort((x, y) => x.a - y.a);

  // HOW MUCH OF IT THERE IS, not just that it happened. Mánu 2026-08-12: "A
  // client service block and a travel block are overlapping each other. and they
  // are getting billed. for both at the same time? And that is a violation."
  //
  // He is right and the card was saying the opposite. Both blocks bill in full,
  // so every overlapping minute is a minute paid twice - across the two live
  // batches that is 1071 minutes and 17.54 hours billed beyond the time anybody
  // was on site. A card reading "Nothing to do" in green over Mira 08/05, which
  // is four hours of two client services at once, is not a description of that.
  //
  // Every pair is measured, not just the first: Mira has four overlapping pairs
  // in one day and returning at the first one under-reported her by three hours.
  let overlapMin = 0;
  let subject = null;
  for (let i = 1; i < r.length; i++) {
    if (r[i].a >= r[i - 1].b) continue;
    overlapMin += Math.min(r[i].b, r[i - 1].b) - r[i].a;
    if (subject) continue;
    const one = blockKind(r[i - 1].text);
    const two = blockKind(r[i].text);
    if (one === two) {
      const plural =
        one === "another scheduled block" ? "scheduled blocks" : `${one.replace(/^an? /, "")}s`;
      subject = `Two ${plural}`;
    } else {
      subject = `${one.charAt(0).toUpperCase()}${one.slice(1)} and ${two}`;
    }
  }
  return subject ? { subject, overlapMin } : null;
}
