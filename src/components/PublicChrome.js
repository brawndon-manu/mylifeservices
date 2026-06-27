"use client";

// renders the public brochure header/footer everywhere EXCEPT the employee
// portal, which has its own header. portal pages shouldn't show the public
// nav + "Get in touch" footer.
import { usePathname } from "next/navigation";

export default function PublicChrome({ children }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/portal")) return null;
  return children;
}
