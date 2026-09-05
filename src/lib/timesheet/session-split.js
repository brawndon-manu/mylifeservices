// ONE PUNCH SESSION ACROSS SEVERAL BOOKINGS.
//
// Gutierrez 08/03: Christensen was booked 1:30-2:00 PM and again 2:00-3:30 PM,
// and he clocked ONCE, 1:30 to 3:30, across both. QSP's export prints one row.
// Attached to a single booking, that row made the other read "not in the clock
// export" - Mánu pasted the export row and asked, correctly, how that could be
// - while the claimed booking carried the whole two hours against its
// ninety-minute bill.
//
// So after every row has attached, a clocked booking whose punched window
// spans other STILL-UNCLOCKED bookings of the same person, day and client
// shares its session: each spanned booking takes its slice of the punches
// (boundaries at the bookings' own schedule edges; the first slice starts at
// the real clock-in, the last ends at the real clock-out), so the slices sum
// to what was clocked and nothing counts twice. The real punch marks and GPS
// stay where they physically happened - the session's two ends; an inherited
// boundary is a time, never a tick. Every member carries the whole session so
// the screens can say what actually happened.
//
// Pure: operates on the build's shift objects in place, returns how many
// sessions were split. The build hands it the same person-day index it
// already holds.

const overlapOf = (a1, a2, b1, b2) =>
  a1 == null || b1 == null ? 0 : Math.max(0, Math.min(a2 ?? 0, b2 ?? 0) - Math.max(a1, b1));

export function splitSharedSessions(byPersonDayShift, sameClient) {
  let sessions = 0;
  for (const dayShifts of byPersonDayShift.values()) {
    for (const shift of dayShifts) {
      if (!shift.clocked || shift.rosterMissing || shift.sharedSession) continue;
      if (shift.actualFrom == null || shift.actualTo == null) continue;
      const sibs = dayShifts.filter(
        (x) =>
          x !== shift &&
          !x.clocked &&
          sameClient(x.client, shift.client) &&
          overlapOf(x.schedFrom, x.schedTo, shift.actualFrom, shift.actualTo) > 0,
      );
      if (!sibs.length) continue;

      const group = [shift, ...sibs].sort((a, b) => (a.schedFrom ?? 0) - (b.schedFrom ?? 0));
      const session = { from: shift.actualFrom, to: shift.actualTo, parts: group.length };
      // the attached row's stamps, held before any member is rewritten
      const src = {
        clientFull: shift.clientFull, originalFrom: shift.originalFrom, originalTo: shift.originalTo,
        noIn: shift.noIn, noOut: shift.noOut, gpsIn: shift.gpsIn, gpsOut: shift.gpsOut,
        startDelta: shift.startDelta, endDelta: shift.endDelta,
        selfCreated: shift.selfCreated, reason: shift.reason, says: shift.says,
      };
      // QSP's own schedule columns describe ONE booking - they go to the member
      // whose booked start matches them, else to the session's first
      const originalHolder =
        group.find((g) => g.schedFrom != null && g.schedFrom === src.originalFrom) || group[0];

      sessions++;
      for (let i = 0; i < group.length; i++) {
        const g = group[i];
        const first = i === 0;
        const last = i === group.length - 1;
        const sliceFrom = first ? session.from : Math.max(g.schedFrom ?? session.from, session.from);
        const sliceTo = last ? session.to : Math.min(g.schedTo ?? session.to, session.to);
        // a booking the session never actually reached keeps its own state
        if (sliceTo <= sliceFrom) continue;
        Object.assign(g, {
          clocked: true,
          clientFull: src.clientFull,
          actualFrom: sliceFrom,
          actualTo: sliceTo,
          workedMin: sliceTo - sliceFrom,
          sharedSession: session,
          // punches and GPS live where they happened; a boundary is not a tick
          noIn: first ? src.noIn : false,
          noOut: last ? src.noOut : false,
          gpsIn: first ? src.gpsIn : null,
          gpsOut: last ? src.gpsOut : null,
          inheritedIn: !first,
          inheritedOut: !last,
          startDelta: first ? src.startDelta : null,
          endDelta: last ? src.endDelta : null,
          // the row-level words ride once, with the session's opener
          selfCreated: first ? src.selfCreated : g.selfCreated,
          reason: first ? src.reason : undefined,
          says: first ? src.says : undefined,
          // QSP's schedule columns describe one booking - only the holder
          // shows them; the previously-attached member hands them back
          originalFrom: g === originalHolder ? src.originalFrom : null,
          originalTo: g === originalHolder ? src.originalTo : null,
        });
      }
    }
  }
  return sessions;
}
