// WHICH DEVICE A SIGNATURE CAME FROM, in words a reviewer can read.
//
// a MAC address cannot be read by a web page: browsers never expose it, only
// the router on the signer's own network sees it. what a page can record is
// the network address, the browser and the kind of device it runs on, and a
// device id the page keeps in that phone's storage so the same phone reads
// the same next time. beside "on their own device" or "on the staff member's
// phone", that is what tells two signatures on one visit apart.
//
// dependency-free so node --test reads it.

// "Safari on iPhone", "Chrome on Android", "Chrome on Windows", "Safari on
// Mac", "Firefox on Linux"; null for nothing useful
export function deviceLabel(ua) {
  const s = String(ua || "");
  if (!s.trim()) return null;
  const os = /iPhone/.test(s) ? "iPhone"
    : /iPad/.test(s) ? "iPad"
      : /Android/.test(s) ? "Android"
        : /Windows/.test(s) ? "Windows"
          : /Macintosh|Mac OS/.test(s) ? "Mac"
            : /CrOS/.test(s) ? "Chromebook"
              : /Linux/.test(s) ? "Linux"
                : null;
  const browser = /Edg\//.test(s) ? "Edge"
    : /OPR\/|Opera/.test(s) ? "Opera"
      : /SamsungBrowser/.test(s) ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(s) ? "Firefox"
          : /CriOS/.test(s) ? "Chrome"
            : /Chrome\//.test(s) ? "Chrome"
              : /Safari\//.test(s) ? "Safari"
                : null;
  if (!browser && !os) return null;
  return browser && os ? `${browser} on ${os}` : browser || os;
}

// the sentence under a signature saying which way it was collected
export function viaLine(via) {
  if (via === "own") return "Signed on their own device";
  if (via === "staff") return "Signed on the staff member's phone";
  if (via === "email") return "Signed from an emailed link";
  return null;
}

// a device id is opaque; the document prints its tail so two signatures can
// be told apart without printing a token somebody could reuse
export const deviceTail = (id) => {
  const s = String(id || "").replace(/[^A-Za-z0-9]/g, "");
  return s ? `device …${s.slice(-6)}` : null;
};
