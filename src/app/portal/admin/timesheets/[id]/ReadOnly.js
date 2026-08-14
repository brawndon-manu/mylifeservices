"use client";

// IS THIS UPLOAD STILL THE ONE BEING WORKED?
//
// A replaced export is read only - see superseded.js for why: a mark made from
// the 08/12 pull would be stamped with how far THAT data reached, so the current
// upload would show a fresh decision claiming to have seen days nobody had.
//
// The server already refuses every write. This is the other half: a control that
// looks pressable and then refuses is a worse screen than one that says up front
// it cannot be used. Enforcement stays on the server, where it cannot be got
// round; this only stops somebody wasting a click.
//
// Provided by the batch LAYOUT, so all fourteen screens under a batch get it
// without each remembering to ask. A control anywhere below just calls the hook.
import { createContext, useContext } from "react";

const ReadOnlyContext = createContext(null);

export function useReadOnly() {
  return useContext(ReadOnlyContext);
}

// what a greyed control should carry, so the reason is one tooltip away rather
// than a mystery
export function useReadOnlyProps() {
  const ro = useReadOnly();
  if (!ro) return {};
  return {
    disabled: true,
    title: "This upload has been replaced. Make the change on the current one.",
    className: "cursor-not-allowed opacity-45",
  };
}

export default function ReadOnlyProvider({ readOnly = false, children }) {
  return (
    <ReadOnlyContext.Provider value={readOnly ? true : null}>
      {children}
    </ReadOnlyContext.Provider>
  );
}
