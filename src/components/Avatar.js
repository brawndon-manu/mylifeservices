import Image from "next/image";
import { initialsFor } from "@/lib/contacts";
import { fileHref } from "@/lib/blob-paths";

// round avatar that shows a user's photo, or their initials on a tinted
// circle when no photo is set. size is the pixel diameter. a photo in the
// private store comes through the /portal/files gate (fileHref), which is why
// this stays unoptimized: the optimizer would fetch it without the cookies.
export default function Avatar({ name, email, image, size = 56 }) {
  const dim = { width: size, height: size };
  if (image) {
    return (
      <Image
        src={fileHref(image)}
        alt=""
        width={size}
        height={size}
        unoptimized
        className="flex-none rounded-full object-cover"
        style={dim}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex flex-none items-center justify-center rounded-full bg-sky-100 font-semibold text-brand"
      style={{ ...dim, fontSize: Math.round(size * 0.36) }}
    >
      {initialsFor(name, email)}
    </span>
  );
}
