"use client";

import { useRef, useState } from "react";

// the identity row's photo machinery: the avatar (or a live preview of a
// freshly picked file), the who-block passed in as children, and the
// Change photo / Remove buttons. the real file input is visually hidden and
// nothing here writes anywhere - the pick and the remove both ride the
// surrounding form's Save, same names the action has always read
// (photo, removePhoto).
export default function PhotoControl({ hasImage, accept, initials, avatar, hint, children }) {
  const [preview, setPreview] = useState(null);
  const [removed, setRemoved] = useState(false);
  const fileRef = useRef(null);

  function onPick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
    setRemoved(false);
  }

  function onRemove() {
    if (!removed) {
      // dropping the pending pick too, so Undo returns to the stored photo
      if (fileRef.current) fileRef.current.value = "";
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
    }
    setRemoved((v) => !v);
  }

  return (
    <div className="border-b border-sep pb-6 pt-5">
      <div className="flex flex-wrap items-center gap-4">
        {preview && !removed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-14 w-14 flex-none rounded-full object-cover" />
        ) : removed ? (
          <span
            aria-hidden="true"
            className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-light text-[19px] font-semibold text-white"
          >
            {initials || "?"}
          </span>
        ) : (
          avatar
        )}
        {/* basis keeps the name readable on a phone - the buttons wrap under
            it instead of squeezing it to an ellipsis */}
        <div className="min-w-0 flex-1 basis-40">{children}</div>
        <input
          ref={fileRef}
          id="photo"
          name="photo"
          type="file"
          accept={accept}
          onChange={onPick}
          className="sr-only"
          aria-label="Change photo"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-lg bg-fill px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-fill-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Change photo
        </button>
        {hasImage && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg px-2 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {removed ? "Undo" : "Remove"}
          </button>
        )}
        {removed && <input type="hidden" name="removePhoto" value="on" />}
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-faint">{hint}</p>
    </div>
  );
}
