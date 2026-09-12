// WHO A CLIENT'S PAPERWORK GOES TO, 2026-09-12.
//
// Mánu: "client with no staff should get option to assign to staff but for
// this we can give them to a supervisor too. i want option to send them to
// staff members or supervisors or both."
//
// THREE SOURCES, IN THIS ORDER, and the order is the whole point:
//
//   1. what somebody set by hand      ClientRouting, keyed by clientKey
//   2. what the roster matched        Client.staffUser, from the Case Worker column
//   3. who supervises that staff      User.supervisorId
//
// A hand-set value wins because it was typed by a person looking at the case;
// the roster is a monthly export that had 105 of 274 Case Worker cells blank
// when this was written. Falling back the other way would let a re-export
// silently overwrite an answer somebody gave.
//
// THE SUPERVISOR CAN BE SET WITHOUT THE STAFF. A client with nobody assigned
// still has paperwork that has to reach a person; before this, such a client
// resolved to nobody at all and was skipped by every send. 233 of 239 on the
// September month.
//
// Pure, so the tests run the real shapes through it without a database.

// one client's routing, from the three sources. `routing` and `client` may
// each be null - a client with neither is simply unroutable, which the screen
// says rather than hiding.
export function resolveRouting({ routing = null, client = null } = {}) {
  const staffUser = routing?.staffUser || client?.staffUser || null;
  const staffFrom = routing?.staffUser ? "manual" : client?.staffUser ? "roster" : null;

  // a hand-set supervisor stands on its own. Otherwise it is whoever
  // supervises the staff member we just resolved - which is where every
  // supervisor came from before this existed.
  const supervisor = routing?.supervisor || staffUser?.supervisor || null;
  const supervisorFrom = routing?.supervisor
    ? "manual"
    : staffUser?.supervisor
      ? staffFrom === "manual" ? "manual-staff" : "staff"
      : null;

  return { staffUser, staffFrom, supervisor, supervisorFrom };
}

// can this client be sent to at all, and if not, why the screen says so
export function routingGaps(resolved) {
  return {
    noStaff: !resolved.staffUser,
    noSupervisor: !resolved.supervisor,
    unroutable: !resolved.staffUser && !resolved.supervisor,
  };
}

// an empty assignment is no assignment: the screen deletes the row rather than
// storing one that says nothing, so "has a routing row" always means something
export function isEmptyRouting({ staffUserId = null, supervisorUserId = null } = {}) {
  return !staffUserId && !supervisorUserId;
}

// index a list of ClientRouting rows for lookup while walking clients
export function byClientKey(rows) {
  const m = new Map();
  for (const r of rows || []) m.set(r.clientKey, r);
  return m;
}
