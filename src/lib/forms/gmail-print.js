// READING GMAIL'S OWN PRINT OF A THREAD.
//
// Mánu 2026-09-12: "would it be worthwile to attatch this straight from
// printing the page on gmail". It is worth far more than that - it is a better
// SOURCE than the list view anyone can paste, measured on the SB-294 thread:
//
//   90 messages from 73 senders in the print, against 80 acknowledgments from
//   68 people in the paste. The paste was missing about ten replies and five
//   people, and nothing about it said so.
//
//   EVERY MESSAGE CARRIES ITS SENDER'S ADDRESS. The list view almost never
//   does (2 of 81), which is why matching a paste has to fall back on display
//   names and the words inside the reply. Here the identity is exact.
//
//   THE YEAR IS ON EVERY TIMESTAMP, so nobody has to be asked which year a
//   thread belongs to, and the times are the real ones - Joseph Hernandez is
//   2:54 PM here against 2:55 in the list view.
//
// The print is also the primary source. Everything else this feature makes is
// a transcription of it.

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// "<addr>  Sat, May 23, 2026 at 2:50 PM" - one per message, and the only
// reliable landmark in text pulled out of a PDF, where every line runs into
// the next.
//
// THE NAME IS DELIBERATELY NOT PART OF THIS. Capturing the words before the
// address makes the match start earlier, and the previous message's body ends
// where the next match starts - so a greedy name capture eats the reply above
// it. The name is read backwards from the address instead, and the body ends
// where the name began.
const HEADER =
  /<([\w.+-]+@[\w.-]+)>\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\w{3}) (\d{1,2}), (\d{4}) at (\d{1,2}):(\d{2})\s?(AM|PM)/g;

// Gmail's page furniture, the recipient lists, and the quoted message under
// each reply - none of it is what the person wrote.
const FOOTER = /\d{1,2}\/\d{1,2}\/\d{2},\s*\d{1,2}:\d{2}\s*(?:AM|PM)\s*Gmail - .*?\d+\/\d+/gs;
const QUOTED = /\[Q(?:u(?:o(?:t(?:e(?:d(?:[^\]]*\]?)?)?)?)?)?)?\s*$|\[Quoted[^\]]*\]/g;
// THE QUOTED MESSAGE IS ALWAYS LAST, so this cuts from "On <date>" to the end
// rather than trying to find where it stops. Matching up to "wrote:" missed
// every variant where the address inside it came out of the PDF with spaces in
// it ("jsalgado.mylifeservices@ gmail.com").
const ON_WROTE = /\bOn\s+(?:\w{3},?\s+)?\w{3}\s+\d{1,2},\s+\d{4}[\s\S]*$/;
// and the print's own URL, which wraps across lines in the page footer
const GMAIL_URL = /https?:\/\/mail\.google\.com[\s\S]*$/;
const ADDRESSED = /\b(?:To|Cc|Bcc):/g;
const ANY_ADDRESS = /"?[^",<>\n]{0,60}"?\s*<[\w.+-]+@[\w.-]+>|\b[\w.+-]+@[\w.-]+\b/g;
const ATTACHMENTS = /\d+\s+attachments?\b/gi;

// THE SENDER'S NAME, read backwards from the address. What comes before it is
// the tail of the previous message, so only the last couple of words are the
// name - and a leading scrap ("K", "messages", the end of somebody's reply) is
// dropped when the word after it is capitalised.
function nameBefore(src, at) {
  const back = src.slice(Math.max(0, at - 70), at)
    .replace(FOOTER, " ")
    .replace(/\[Quoted text hidden\]/g, " ")
    .replace(/"/g, " ");
  // TWO WORDS. Three reaches back into the previous reply ("Aranda Haili
  // Plancarte"); one loses the surname. A three-word name loses its first
  // word, which is cosmetic - the match is made on the address.
  const words = back.trim().split(/\s+/).filter(Boolean).slice(-2);
  while (words.length > 1) {
    const [first, second] = words;
    // a scrap is a stray letter, something carrying digits (a file size, a page
    // number), or a lowercase tail of the sentence above a capitalised name
    const scrap = first.length <= 1
      || /\d/.test(first)
      || (/^[a-z]/.test(first) && /^[A-Z]/.test(second));
    if (!scrap) break;
    words.shift();
  }
  const name = words.join(" ").replace(/^[^A-Za-z]+/, "").trim();
  return { name, consumed: name ? back.lastIndexOf(words[0]) : back.length };
}

function cleanBody(raw) {
  return String(raw || "")
    .replace(FOOTER, " ")
    .replace(ON_WROTE, " ")
    .replace(GMAIL_URL, " ")
    .replace(QUOTED, " ")
    .replace(ATTACHMENTS, " ")
    .replace(ANY_ADDRESS, " ")
    .replace(ADDRESSED, " ")
    // a stripped recipient list leaves nothing but its commas
    .replace(/(?:\s*,)+/g, ",")
    .replace(/,\s*(?=,|$)/g, " ")
    .replace(/^[\s,;:-]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseGmailPrint(text) {
  const src = String(text || "");
  const heads = [];
  HEADER.lastIndex = 0;
  let m;
  while ((m = HEADER.exec(src))) {
    const twelve = Number(m[5]) % 12;
    const { name, consumed } = nameBefore(src, m.index);
    heads.push({
      nameAt: m.index - consumed,
      end: HEADER.lastIndex,
      name,
      email: m[1].toLowerCase(),
      parts: {
        year: Number(m[4]),
        month: MONTHS[m[2].toLowerCase()],
        day: Number(m[3]),
        hour: /pm/i.test(m[7]) ? twelve + 12 : twelve,
        minute: Number(m[6]),
      },
    });
  }
  const out = [];
  for (let i = 0; i < heads.length; i += 1) {
    const h = heads[i];
    const stop = heads[i + 1]?.nameAt ?? src.length;
    out.push({
      displayName: h.name || h.email.split("@")[0],
      senderEmail: h.email,
      // the print carries the year, so nothing has to be supplied
      parts: h.parts,
      body: cleanBody(src.slice(h.end, stop)),
    });
  }
  return out;
}

// the print's text, pages joined by a space. Deliberately no separators: the
// parser's only landmark is the message header, and anything inserted between
// pages lands in the middle of somebody's reply.
export async function readPrintText(buffer) {
  const { getPdfjs } = await import("../pdf-globals.js");
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((x) => x.str).join(" "));
  }
  return pages.join(" ");
}
