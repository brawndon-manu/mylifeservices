"use client";

// renders the public brochure header/footer everywhere EXCEPT the employee
// portal (which has its own header) and the maintenance page (which is a
// full-screen standalone splash, no nav + "Get in touch" footer).
import { usePathname } from "next/navigation";

export default function PublicChrome({ children }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/portal") || pathname === "/maintenance") return null;
  return children;
}
