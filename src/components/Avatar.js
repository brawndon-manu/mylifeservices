import Image from "next/image";
import { initialsFor } from "@/lib/contacts";

// round avatar that shows a user's photo, or their initials on a tinted
// circle when no photo is set. size is the pixel diameter.
export default function Avatar({ name, email, image, size = 56 }) {
  const dim = { width: size, height: size };
  if (image) {
    return (
      <Image
        src={image}
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
