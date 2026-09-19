// A TIME TYPED IN A HURRY, READ THE WAY THE REVIEW PAGE READS ONE.
//
// "7", "615", "6:15", "7p" all come off a phone keyboard. parseLooseTime is
// the reader every other typed time in this app goes through; the one thing
// it cannot know is whether a bare "7" means morning or evening. The review
// page answers that with the workday rule (7 to 11 is morning, 12 to 6 is
// afternoon), which is right for a punch but wrong for a shift that ends at
// 6:30 PM and is being amended to 7. Here the answer comes from the shift
// itself: the reading nearest the scheduled end for a clock-out, nearest the
// scheduled start for a clock-in. With no schedule to lean on it falls back to
// the workday rule.
//
// Written out the way the rest of the amendment writes a time ("7:00 PM"),
// not the padded form the review page uses in its boxes.
//
// no imports beyond import-free modules, so the phone form and the server
// read a typed time identically and the test runner can load this directly.
import { parseLooseTime } from "../loose-time.js";
import { noteMinute } from "../timesheet/note-minute.js";
import { ampmLabel } from "../timesheet/hours-label.js";

// "4:30 PM" -> 990, the anchor a schedule gives
export const anchorOf = (t) => noteMinute(t);

export function tidyTime(raw, anchor = null) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const p = parseLooseTime(s);
  // unreadable stays as typed, so the person sees what they wrote and the
  // server refuses it rather than guessing
  if (!p) return s;
  let [h, m] = p.split(":").map(Number);
  // am/pm was said, or the hour only makes sense on a 24-hour clock, or it
  // was typed with a leading zero the way a 24-hour time is
  const explicit = /[ap]/i.test(s) || h > 12 || h === 0 || /^0\d/.test(s);
  if (explicit) return ampmLabel(h * 60 + m);
  if (anchor != null) {
    const morning = (h % 12) * 60 + m;
    const evening = morning + 720;
    return ampmLabel(Math.abs(morning - anchor) <= Math.abs(evening - anchor) ? morning : evening);
  }
  const w = parseLooseTime(s, { assumeWorkday: true });
  [h, m] = w.split(":").map(Number);
  return ampmLabel(h * 60 + m);
}

// whether a tidied time can be read back at all
export const isTime = (t) => noteMinute(t) != null;
