// WHO ONE FORM CAN GO TO. The four answers on the send dialog:
//
//   supervisor  the field supervisor over this client's assigned staff
//   staff       the assigned staff member themselves
//   client      the client - always a typed address, because client emails are
//               not stored (Mánu 2026-08-24)
//   other       any other typed address
//
// ITS OWN MODULE because the actions file is "use server", and such a file may
// only export async functions - a plain array there is a build error.
export const SEND_TARGETS = ["supervisor", "staff", "client", "other"];
