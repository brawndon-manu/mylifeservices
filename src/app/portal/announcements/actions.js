"use server";

// Announcements actions - one-for-one with the Hub (src/app/portal/hub/
// actions.js) but on the Announcement models, and with the single caveat that
// only Supervisor+ (isSupervisorUp) can create a post. everyone can comment,
// like, edit/delete their own; moderators can delete others + pin.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { sendSlotAlert } from "@/lib/slot-alert-email";
import {
  addedSessions, canTake, sortSessionOptions } from "@/lib/meeting-slots";
import { getCurrentUser } from "@/lib/current-user";
import {
  isModerator,
  isElevated,
  isSupervisorUp,
  isAdminUp,
  isIT,
  isSuper,
} from "@/lib/roles";
import { firstNameOf, preferredName } from "@/lib/contacts";
import { signAckToken } from "@/lib/ack-token";
import { recordAnnouncementAck } from "@/lib/announcement-ack";
import { formEmailRoute } from "@/lib/forms";
import { signRsvpToken } from "@/lib/rsvp-token";
import { renderMarkdown } from "@/lib/markdown";
import {
  buildAnnouncementEmailHtml,
  buildMeetingBlockHtml,
  buildRsvpButtons,
  postButton,
  EMAIL_TZ,
} from "@/lib/announcement-email";
import {
  cleanBody,
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  COMMENT_CONTENT_MAX,
} from "@/lib/hub";
import { resolveAnnouncementRecipients } from "@/lib/timesheet-mode";
import {
  emailAnnouncement,
  emailAudienceWhere,
  EMAIL_AUTHOR_SELECT,
  EMAIL_MEETING_SELECT,
} from "@/lib/announce-send";
import {
  isValidAnnouncementTag,
  isChangelog,
  isCompanyMeeting,
  ATTACH_ACCEPT,
  ATTACH_MAX_BYTES,
  ATTACH_MAX_COUNT,
  cleanAttachment,
  attachmentsOf,
  emailAttachmentsOf,
  inlineImageUrlsIn,
  isEvent,
  isValidEventAudience,
  isValidMeetingKind,
  isValidMeetingFormat,
  formatHasOnline,
  formatHasAddress,
  ANNOUNCEMENT_TITLE_MAX,
  ANNOUNCEMENT_CONTENT_MAX,
  CHANGELOG_CONTENT_MAX,
  ackAudienceWhere,
  titleSegmentMatch,
  isAckExempt,
  computeMeetingLocks,
} from "@/lib/announcements";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

function parseDateField(raw) {
  if (typeof raw !== "string" || !raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// the acknowledgment audience from the form: Everyone (the whole expected-ack
// staff set) or a list of job titles / specific people. only meaningful when
// active (requireAck or a meeting). NO empty-fallback to Everyone anymore - an
// empty pick stays empty so the action can reject it (the author must choose).
function parseAckAudience(formData, active) {
  if (!active) return { ackEveryone: true, ackTitles: [], ackUserIds: [] };
  const everyone = formData.get("ackEveryone") === "on";
  if (everyone) return { ackEveryone: true, ackTitles: [], ackUserIds: [] };
  const titles = formData
    .getAll("ackTitles")
    .filter((t) => typeof t === "string" && t);
  const userIds = formData
    .getAll("ackUserIds")
    .filter((t) => typeof t === "string" && t);
  return { ackEveryone: false, ackTitles: titles, ackUserIds: userIds };
}

// true when an ack audience came back empty (nobody chosen). used to block a
// post that requires acknowledgment but didn't pick who.
function ackAudienceEmpty({ ackEveryone, ackTitles, ackUserIds }) {
  return !ackEveryone && !ackTitles.length && !ackUserIds.length;
}

// the optional form attached to an ack-required post - completing it is what
// records the acknowledgment (see AnnouncementForm's "Attach a form" picker).
// only meaningful when requireAck is on; never trust the posted id blindly -
// it has to be a real, fillable form with somewhere to send it.
async function resolveFormId(formData, requireAck) {
  if (!requireAck) return null;
  const raw = formData.get("formId");
  if (typeof raw !== "string" || !raw) return null;
  const form = await prisma.form.findUnique({
    where: { id: raw },
    select: { id: true, title: true, fillable: true },
  });
  if (!form || !form.fillable) return null;
  if (!formEmailRoute(form.title)?.recipientTitle) return null;
  return form.id;
}

// the Company Meeting fields. only meaningful when tag = "Company Meeting";
// other types store nulls/defaults so the columns stay clean.
// event fields (used when tag = "Event"). blank otherwise so switching a post
// off Event clears them.
function parseEventFields(formData, tag) {
  const blank = {
    eventAudience: null,
    eventAt: null,
    eventTimezone: null,
    eventEndAt: null,
    eventLocationName: null,
    eventAddress: null,
  };
  if (!isEvent(tag)) return blank;
  const trim = (s, max) => {
    const v = typeof s === "string" ? s.trim() : "";
    return v ? v.slice(0, max) : null;
  };
  const toDate = (s) => {
    if (typeof s !== "string" || !s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const audience = formData.get("eventAudience");
  const eventAt = toDate(formData.get("eventAt"));
  return {
    eventAudience: isValidEventAudience(audience) ? audience : "employee",
    eventAt,
    eventTimezone: eventAt ? trim(formData.get("eventTimezone"), 60) : null,
    eventEndAt: toDate(formData.get("eventEndAt")),
    eventLocationName: trim(formData.get("eventLocationName"), 200),
    eventAddress: trim(formData.get("eventAddress"), 300),
  };
}

function parseMeetingFields(formData, tag) {
  const blank = {
    meetingKind: null,
    meetingFormat: null,
    meetingMandatory: false,
    zoomLink: null,
    zoomCode: null,
    meetingAddress: null,
    meetingOptions: null,
    meetingMultiPick: false,
    meetingAt: null,
    meetingTimezone: null,
    meetingDurationFromMin: null,
    meetingDurationToMin: null,
    meetingResponseDueAt: null,
    meetingResponseDueTz: null,
    zoomLinkTbd: false,
    meetingNightBefore: true,
    meetingReminderLeadMin: 10,
    meetingAttestationFormId: null,
    meetingAttestationSubject: null,
    meetingAttestationBody: null,
  };
  if (!isCompanyMeeting(tag)) return blank;

  const trim = (s, max) => {
    const v = typeof s === "string" ? s.trim() : "";
    return v ? v.slice(0, max) : null;
  };
  const kind = formData.get("meetingKind");
  const format = formData.get("meetingFormat");
  const online = formatHasOnline(format);
  const addr = formatHasAddress(format);

  let meetingOptions = null;
  let meetingMultiPick = false;
  const raw = formData.get("meetingOptions");
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const posInt = (v) => {
          const n = parseInt(v, 10);
          return Number.isFinite(n) && n > 0 ? n : null;
        };
        const opts = arr
          .filter((o) => o && typeof o.label === "string" && o.label.trim())
          .map((o, i) => {
            // each session carries its own absolute start + timezone + duration.
            let at = null;
            if (typeof o.at === "string" && o.at) {
              const dt = new Date(o.at);
              if (!Number.isNaN(dt.getTime())) at = dt.toISOString();
            }
            // each online session can carry its own Zoom link + passcode.
            const sLink =
              online && typeof o.zoomLink === "string" && o.zoomLink.trim()
                ? o.zoomLink.trim().slice(0, 500)
                : null;
            const sCode =
              online && typeof o.zoomCode === "string" && o.zoomCode.trim()
                ? o.zoomCode.trim().slice(0, 60)
                : null;
            // series mode: an option belongs to a named series (attendees pick
            // one option from each series). null when it's a plain session list.
            const seriesId =
              typeof o.seriesId === "string" && o.seriesId
                ? o.seriesId.slice(0, 60)
                : null;
            const seriesLabel =
              seriesId && typeof o.seriesLabel === "string" && o.seriesLabel.trim()
                ? o.seriesLabel.trim().slice(0, 80)
                : null;
            return {
              id: String(o.id || `opt${i}`),
              label: o.label.trim().slice(0, 140),
              // HOW MANY THIS SESSION HOLDS, added 2026-08-22 for in-person
              // slots. posInt already reads 0 and rubbish as null, which is
              // exactly right here: null holds everybody, and every meeting
              // written before this keeps meaning that.
              capacity: posInt(o.capacity),
              at,
              tz: at && typeof o.tz === "string" ? o.tz.slice(0, 60) : null,
              durationFromMin: posInt(o.durationFromMin),
              durationToMin: posInt(o.durationToMin),
              zoomLink: sLink,
              zoomCode: sCode,
              seriesId,
              seriesLabel,
            };
          });
        if (opts.length) {
          // in the order they happen, not the order they were typed - a week
          // added later can fall before the ones already there
          meetingOptions = sortSessionOptions(opts);
          meetingMultiPick = formData.get("meetingMultiPick") === "on";
        }
      }
    } catch {
      // ignore bad json - just no options
    }
  }

  // single-meeting start instant (only when not offering session options).
  let meetingAt = null;
  const meetingAtRaw = formData.get("meetingAt");
  if (!meetingOptions && typeof meetingAtRaw === "string" && meetingAtRaw) {
    const dt = new Date(meetingAtRaw);
    if (!Number.isNaN(dt.getTime())) meetingAt = dt;
  }
  const durMin = (hKey, mKey) => {
    const h = parseInt(formData.get(hKey) || "0", 10) || 0;
    const m = parseInt(formData.get(mKey) || "0", 10) || 0;
    const t = h * 60 + m;
    return t > 0 ? t : null;
  };

  return {
    meetingKind: isValidMeetingKind(kind) ? kind : "Other",
    meetingFormat: isValidMeetingFormat(format) ? format : "zoom",
    meetingMandatory: formData.get("meetingMandatory") === "on",
    zoomLink: online ? trim(formData.get("zoomLink"), 500) : null,
    zoomCode: online ? trim(formData.get("zoomCode"), 60) : null,
    meetingAddress: addr ? trim(formData.get("meetingAddress"), 300) : null,
    meetingOptions,
    meetingMultiPick,
    meetingAt,
    meetingTimezone: meetingAt ? trim(formData.get("meetingTimezone"), 60) : null,
    meetingDurationFromMin: durMin("meetingDurFromHrs", "meetingDurFromMin"),
    meetingDurationToMin: durMin("meetingDurToHrs", "meetingDurToMin"),
    meetingResponseDueAt: parseDateField(formData.get("meetingResponseDueAt")),
    meetingResponseDueTz:
      trim(formData.get("meetingResponseDueTz"), 60) || null,
    zoomLinkTbd: online ? formData.get("zoomLinkTbd") === "on" : false,
    meetingNightBefore: formData.get("meetingNightBefore") === "on",
    meetingReminderLeadMin: (() => {
      const n = parseInt(formData.get("meetingReminderLeadMin"), 10);
      return Number.isFinite(n) && n >= 0 && n <= 1440 ? n : 10;
    })(),
    // the wording for the attestation mail. the form ID itself is resolved
    // separately and asynchronously - see resolveAttestationFormId - because a
    // posted id has to be checked against the database before it is trusted.
    meetingAttestationSubject: trim(formData.get("meetingAttestationSubject"), 200),
    meetingAttestationBody: trim(formData.get("meetingAttestationBody"), 4000),
  };
}

// the attestation a meeting asks for once it has concluded. same rule as
// resolveFormId: never trust the posted id, it has to be a real fillable form.
//
// DELIBERATELY NOT REQUIRING AN EMAIL ROUTE, which is where this parts company
// with resolveFormId. That check exists because an acknowledgment is completed
// by submitting the form to a review team, so a form with nowhere to send is
// useless there. An attestation is signed through its own /a/attest link and
// filed against the meeting, so it needs no review team at all.
async function resolveAttestationFormId(formData, tag) {
  if (!isCompanyMeeting(tag)) return null;
  const raw = formData.get("meetingAttestationFormId");
  if (typeof raw !== "string" || !raw) return null;
  const form = await prisma.form.findUnique({
    where: { id: raw },
    select: { id: true, fillable: true },
  });
  if (!form || !form.fillable) return null;
  return form.id;
}

// PDFs UPLOADED STRAIGHT ONTO A POST. Same store and same cleanup as the image,
// a different prefix so the two are tellable apart in the bucket.
async function uploadAttachment(file) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Attachments arent configured yet. Create a Blob store in Vercel.");
  }
  const key = `announcements/docs/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pdf`;
  const blob = await put(key, file, { access: "public", contentType: "application/pdf" });
  return blob.url;
}

// WHAT ENDS UP ON THE POST, from both sources.
//
// A library pick arrives as a Form id and is LOOKED UP - the url and the name
// come from the row, never from the posted value, or a crafted form could
// attach any url it liked under a friendly name. An upload is checked for type
// and size before it reaches the store.
//
// `redirectOn` is the page to bounce back to, so create and edit report their
// errors in the right place.
async function resolveAttachments(formData, redirectOn) {
  const out = [];

  // ALREADY ON THE POST, and not ticked for removal. An uploaded PDF exists
  // only here, so an edit that silently dropped it would lose the file - the
  // library picks below can always be re-picked, these cannot.
  for (const raw of formData.getAll("keepAttachments")) {
    if (typeof raw !== "string" || !raw) continue;
    try {
      const a = cleanAttachment(JSON.parse(raw));
      if (a) out.push(a);
    } catch {
      // a mangled hidden field drops that one attachment rather than the post
    }
  }

  const ids = formData
    .getAll("attachFormIds")
    .filter((v) => typeof v === "string" && v);
  if (ids.length) {
    const rows = await prisma.form.findMany({
      where: { id: { in: ids.slice(0, ATTACH_MAX_COUNT) } },
      select: { id: true, title: true, fileUrl: true },
    });
    // keep the order the picker showed them in rather than the database's
    for (const id of ids) {
      const f = rows.find((r) => r.id === id);
      if (f) out.push({ name: f.title, url: f.fileUrl, formId: f.id, bytes: null });
    }
  }

  const files = formData
    .getAll("attachments")
    .filter((f) => f && typeof f === "object" && "size" in f && f.size > 0);
  for (const file of files) {
    if (!ATTACH_ACCEPT.includes(file.type)) redirect(`${redirectOn}?error=attachType`);
    if (file.size > ATTACH_MAX_BYTES) redirect(`${redirectOn}?error=attachSize`);
    if (out.length >= ATTACH_MAX_COUNT) redirect(`${redirectOn}?error=attachCount`);
    let url;
    try {
      url = await uploadAttachment(file);
    } catch {
      redirect(`${redirectOn}?error=attachUpload`);
    }
    out.push({
      name: (file.name || "Document").replace(/\.pdf$/i, "").slice(0, 120),
      url,
      formId: null,
      bytes: file.size,
    });
  }

  if (out.length > ATTACH_MAX_COUNT) redirect(`${redirectOn}?error=attachCount`);
  return out.length ? out.map(cleanAttachment).filter(Boolean) : null;
}

async function uploadImage(file) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "Image upload isnt configured yet. Create a Blob store in Vercel.",
    );
  }
  const ext = (file.name?.split(".").pop() || "bin").toLowerCase().slice(0, 8);
  const key = `announcements/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const blob = await put(key, file, {
    access: "public",
    contentType: file.type,
  });
  return blob.url;
}

// the uploaded PDFs on a post. A library attachment points at a file the forms
// library owns, so deleting the post must NOT delete that one.
async function tryDeleteAttachments(post) {
  for (const a of attachmentsOf(post)) {
    if (!a.formId) await tryDeleteBlob(a.url);
  }
}

// pictures the author dropped into the body. same cleanup as the hero image, and
// deliberately narrow: only urls under our own inline prefix come back from
// inlineImageUrlsIn, so a link to anywhere else is left alone.
async function tryDeleteInlineImages(content) {
  for (const url of inlineImageUrlsIn(content)) await tryDeleteBlob(url);
}

async function tryDeleteBlob(url) {
  if (!url) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    await del(url);
  } catch {
    // ignore - blob may already be gone or token missing in dev
  }
}

// ----------- POSTS -----------

export async function createPost(formData) {
  const user = await requireUser();
  // the one caveat vs the Hub: only Supervisor+ may post an announcement.
  if (!isSupervisorUp(user.role)) {
    redirect("/portal/announcements?error=forbidden");
  }

  const tag = formData.get("tag");
  if (!isValidAnnouncementTag(tag)) {
    redirect("/portal/announcements/new?error=tag");
  }
  // every type needs a title now (the new layout is built around it).
  const title = cleanBody(formData.get("title"), ANNOUNCEMENT_TITLE_MAX);
  if (!title) {
    redirect("/portal/announcements/new?error=title");
  }
  // Changelog stays IT/Super only + gets a much larger content limit.
  if (isChangelog(tag) && !isIT(user.role)) {
    redirect("/portal/announcements?error=forbidden");
  }

  const content = cleanBody(
    formData.get("content"),
    isChangelog(tag) ? CHANGELOG_CONTENT_MAX : ANNOUNCEMENT_CONTENT_MAX,
  );
  if (!content) {
    redirect("/portal/announcements/new?error=content");
  }

  const expiresAt = parseDateField(formData.get("expiresAt"));

  // proxy posting: an IT/admin can post on behalf of another employee.
  let authorId = user.id;
  let postedById = null;
  const postAs = formData.get("postAs");
  if (
    typeof postAs === "string" &&
    postAs &&
    postAs !== user.id &&
    isElevated(user.role)
  ) {
    const target = await prisma.user.findFirst({
      where: { id: postAs, deactivatedAt: null },
      select: { id: true },
    });
    if (!target) {
      redirect("/portal/announcements/new?error=postAs");
    }
    authorId = target.id;
    postedById = user.id;
  }

  const requireAck = formData.get("requireAck") === "on";
  // ack/invite audience (stored, drives the roster). validate before uploading
  // the image so a rejected post doesn't orphan a blob. email is decided later,
  // at Publish time - creating just makes a draft.
  const ackAudience = parseAckAudience(
    formData,
    requireAck || isCompanyMeeting(tag),
  );
  // meetings need an invite list, and require-ack needs an ack audience - the
  // same picker drives both. empty isn't allowed for either (no silent Everyone).
  if ((requireAck || isCompanyMeeting(tag)) && ackAudienceEmpty(ackAudience)) {
    const err = isCompanyMeeting(tag) && !requireAck ? "meetingAudience" : "ackAudience";
    redirect(`/portal/announcements/new?error=${err}`);
  }
  const { ackEveryone, ackTitles, ackUserIds } = ackAudience;
  const formId = await resolveFormId(formData, requireAck);
  const meetingAttestationFormId = await resolveAttestationFormId(formData, tag);

  // DOCUMENTS THAT RIDE ALONG. Two sources, both validated here: ids picked
  // from the forms library (looked up, never trusted as posted) and PDFs
  // uploaded straight onto the post. Resolved before the image so a rejected
  // attachment does not orphan an uploaded blob.
  const attachments = await resolveAttachments(formData, "/portal/announcements/new");

  let imageUrl = null;
  const file = formData.get("image");
  if (file && typeof file === "object" && "size" in file && file.size > 0) {
    if (!IMAGE_ACCEPT.includes(file.type)) {
      redirect("/portal/announcements/new?error=imageType");
    }
    if (file.size > IMAGE_MAX_BYTES) {
      redirect("/portal/announcements/new?error=imageSize");
    }
    try {
      imageUrl = await uploadImage(file);
    } catch {
      redirect("/portal/announcements/new?error=imageUpload");
    }
  }

  const post = await prisma.announcement.create({
    data: {
      authorId,
      postedById,
      title,
      content,
      tag,
      expiresAt,
      imageUrl,
      attachments,
      requireAck,
      ackEveryone,
      ackTitles,
      ackUserIds,
      formId,
      ...parseMeetingFields(formData, tag),
      meetingAttestationFormId,
      ...parseEventFields(formData, tag),
    },
  });

  // created as a DRAFT (publishedAt stays null). it isn't in the feed and no
  // email goes out yet - the author lands on the preview and publishes from there.
  revalidatePath("/portal/announcements");
  redirect(`/portal/announcements/${post.id}`);
}

// publish a draft: stamp publishedAt (it enters the feed), and - per the publish
// dialog - email the audience now. v1 emails "same as invitees" (the invite/ack
// audience) for meetings + ack posts; a plain post can opt to email everyone.
export async function publishAnnouncement(postId, formData) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: {
      id: true,
      authorId: true,
      deletedAt: true,
      publishedAt: true,
      tag: true,
      title: true,
      content: true,
      // the PDFs the post carries, so the email can attach them
      attachments: true,
      // and whether a signature is wanted, which changes the button
      formId: true,
      requireAck: true,
      createdAt: true,
      ackEveryone: true,
      ackTitles: true,
      ackUserIds: true,
      ...EMAIL_MEETING_SELECT,
      author: { select: EMAIL_AUTHOR_SELECT },
    },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  if (post.authorId !== user.id && !isModerator(user.role)) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  if (post.publishedAt) redirect(`/portal/announcements/${postId}`); // already live

  // SEND LATER. The same dialog, one more choice: a real future instant means
  // the draft is scheduled rather than published, and the cron fires it - and
  // its email - when the clock passes. The email decision is captured NOW,
  // because the dialog holding it is about to close and the send happens with
  // nobody in the room. Precision is the cron's five-minute pass.
  const laterIso = String(formData?.get("publishAtIso") || "");
  if (formData?.get("sendLater") === "on" && laterIso) {
    const at = new Date(laterIso);
    if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
      redirect(`/portal/announcements/${postId}?error=publishAt`);
    }
    await prisma.announcement.update({
      where: { id: postId },
      data: {
        publishAt: at,
        publishEmail: {
          doEmail: formData.get("doEmail") === "on",
          everyone: formData.get("emailEveryone") === "on",
          titles: formData.getAll("emailTitles").filter((t) => typeof t === "string" && t),
          userIds: formData.getAll("emailUserIds").filter((t) => typeof t === "string" && t),
        },
      },
    });
    revalidatePath("/portal/announcements");
    revalidatePath(`/portal/announcements/${postId}`);
    redirect(`/portal/announcements/${postId}?scheduled=1`);
  }

  await prisma.announcement.update({
    where: { id: postId },
    // publishing by hand also clears any schedule, so "publish now" on a
    // scheduled draft cannot fire a second time from the cron
    data: { publishedAt: new Date(), publishAt: null, publishEmail: null },
  });

  let res = { sent: 0 };
  if (formData?.get("doEmail") === "on") {
    const hasAudience = isCompanyMeeting(post.tag) || post.requireAck;
    // ack/meeting posts email their invited audience; a plain post emails whoever
    // the author picked in the publish dialog (Everyone or specific titles/people).
    const where = hasAudience
      ? ackAudienceWhere(post)
      : emailAudienceWhere({
          everyone: formData.get("emailEveryone") === "on",
          titles: formData.getAll("emailTitles").filter((t) => typeof t === "string" && t),
          userIds: formData.getAll("emailUserIds").filter((t) => typeof t === "string" && t),
        });
    if (where) res = await emailAnnouncement(post, where);
  }

  revalidatePath("/portal/announcements");
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(
    `/portal/announcements/${postId}?published=1${res.sent ? `&sent=${res.sent}` : ""}`,
  );
}

// take a scheduled draft off the clock. It stays a draft, untouched otherwise -
// unscheduling is not discarding, and the author may just be moving the time.
export async function cancelScheduledPublish(postId) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, deletedAt: true, publishedAt: true, publishAt: true },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  if (post.authorId !== user.id && !isModerator(user.role)) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  if (post.publishedAt || !post.publishAt) redirect(`/portal/announcements/${postId}`);
  await prisma.announcement.update({
    where: { id: postId },
    data: { publishAt: null, publishEmail: null },
  });
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}?unscheduled=1`);
}

// discard a draft entirely (it was never published, so nothing is saved). hard
// delete; cascades take care of any rows. drafts only.
export async function discardDraft(postId) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: {
      id: true, authorId: true, postedById: true, deletedAt: true,
      publishedAt: true, imageUrl: true, attachments: true, content: true,
    },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  const canDiscard =
    post.authorId === user.id || post.postedById === user.id || isModerator(user.role);
  if (post.publishedAt || !canDiscard) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  await tryDeleteBlob(post.imageUrl);
  await tryDeleteAttachments(post);
  await tryDeleteInlineImages(post.content);
  await prisma.announcement.delete({ where: { id: postId } });
  revalidatePath("/portal/announcements");
  redirect("/portal/announcements?discarded=1");
}

export async function deletePost(postId) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: {
      id: true, authorId: true, imageUrl: true, attachments: true,
      deletedAt: true, content: true,
    },
  });
  if (!post || post.deletedAt) {
    redirect("/portal/announcements");
  }

  const canDelete = post.authorId === user.id || isModerator(user.role);
  if (!canDelete) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }

  await prisma.announcement.update({
    where: { id: postId },
    data: { deletedAt: new Date(), imageUrl: null, attachments: null },
  });
  await tryDeleteBlob(post.imageUrl);
  await tryDeleteAttachments(post);
  await tryDeleteInlineImages(post.content);

  revalidatePath("/portal/announcements");
  redirect("/portal/announcements?deleted=1");
}

export async function editPost(postId, formData) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: {
      id: true,
      authorId: true,
      postedById: true,
      deletedAt: true,
      publishedAt: true,
      tag: true,
      // needed to work out which uploaded files the author removed
      attachments: true,
      meetingOptions: true,
      meetingAt: true,
    },
  });
  if (!post || post.deletedAt) {
    redirect("/portal/announcements");
  }
  const isDraft = !post.publishedAt;
  // the author can edit; Super can edit anyone's; for a draft posted on someone's
  // behalf, the actual poster (postedBy) can edit too.
  if (
    post.authorId !== user.id &&
    !isSuper(user.role) &&
    !(isDraft && post.postedById === user.id)
  ) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }

  // "Post as" re-attribution is allowed only while it's still a draft.
  let authorUpdate = {};
  const postAs = formData.get("postAs");
  if (isDraft && isElevated(user.role) && typeof postAs === "string" && postAs) {
    if (postAs === user.id) {
      authorUpdate = { authorId: user.id, postedById: null };
    } else {
      const target = await prisma.user.findFirst({
        where: { id: postAs, deactivatedAt: null },
        select: { id: true },
      });
      if (!target) redirect(`/portal/announcements/${postId}/edit?error=postAs`);
      authorUpdate = { authorId: target.id, postedById: user.id };
    }
  }

  const tag = formData.get("tag");
  if (!isValidAnnouncementTag(tag)) {
    redirect(`/portal/announcements/${postId}/edit?error=tag`);
  }
  const title = cleanBody(formData.get("title"), ANNOUNCEMENT_TITLE_MAX);
  if (!title) {
    redirect(`/portal/announcements/${postId}/edit?error=title`);
  }
  if (isChangelog(tag) && !isIT(user.role)) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  const content = cleanBody(
    formData.get("content"),
    isChangelog(tag) ? CHANGELOG_CONTENT_MAX : ANNOUNCEMENT_CONTENT_MAX,
  );
  if (!content) {
    redirect(`/portal/announcements/${postId}/edit?error=content`);
  }
  const expiresAt = parseDateField(formData.get("expiresAt"));
  const requireAck = formData.get("requireAck") === "on";
  const ackAudience = parseAckAudience(
    formData,
    requireAck || isCompanyMeeting(tag),
  );
  if ((requireAck || isCompanyMeeting(tag)) && ackAudienceEmpty(ackAudience)) {
    const err = isCompanyMeeting(tag) && !requireAck ? "meetingAudience" : "ackAudience";
    redirect(`/portal/announcements/${postId}/edit?error=${err}`);
  }
  const { ackEveryone, ackTitles, ackUserIds } = ackAudience;
  const formId = await resolveFormId(formData, requireAck);
  const meetingAttestationFormId = await resolveAttestationFormId(formData, tag);

  const meetingFields = parseMeetingFields(formData, tag);
  meetingFields.meetingAttestationFormId = meetingAttestationFormId;
  // the kept ones come back as hidden fields, so an edit that touches nothing
  // else leaves the documents exactly as they were. Anything the author removed
  // is simply absent from the post and its blob goes below.
  const attachments = await resolveAttachments(formData, `/portal/announcements/${postId}/edit`);
  const dropped = attachmentsOf(post).filter(
    (a) => !a.formId && !(attachments || []).some((k) => k.url === a.url),
  );

  await prisma.announcement.update({
    where: { id: postId },
    data: {
      title,
      content,
      tag,
      expiresAt,
      attachments,
      requireAck,
      ackEveryone,
      ackTitles,
      ackUserIds,
      formId,
      ...authorUpdate,
      ...meetingFields,
      ...parseEventFields(formData, tag),
      editedAt: new Date(),
    },
  });
  // only AFTER the row no longer points at them, so a failed update cannot
  // leave the post referencing a file that has been deleted
  for (const a of dropped) await tryDeleteBlob(a.url);

  // if this is a published meeting and any session's start time moved, reset the
  // picks for just those sessions (attendees re-RSVP) and, per the author's
  // choice, email the affected people or everyone invited about the change.
  let reset = 0;
  let emailed = 0;
  if (isCompanyMeeting(tag) && post.publishedAt) {
    const affected = await resetChangedMeetingSessions(post, meetingFields);
    reset = affected.length;
    const notify = formData.get("timeChangeNotify");
    if (affected.length && (notify === "affected" || notify === "everyone")) {
      const emailPost = await prisma.announcement.findUnique({
        where: { id: postId },
        select: {
          id: true,
          title: true,
          content: true,
          // the PDFs the post carries, so the email can attach them
          attachments: true,
          // and whether a signature is wanted, which changes the button
          formId: true,
          requireAck: true,
          createdAt: true,
          ackEveryone: true,
          ackTitles: true,
          ackUserIds: true,
          ...EMAIL_MEETING_SELECT,
          author: { select: EMAIL_AUTHOR_SELECT },
        },
      });
      const where =
        notify === "everyone"
          ? ackAudienceWhere(emailPost)
          : { id: { in: affected } };
      const res = await emailAnnouncement(emailPost, where);
      emailed = res?.sent || 0;
    }
  }

  revalidatePath("/portal/announcements");
  revalidatePath(`/portal/announcements/${postId}`);
  const q = reset
    ? `?reset=${reset}${emailed ? `&emailed=${emailed}` : ""}`
    : "";
  redirect(`/portal/announcements/${postId}${q}`);
}

// after a meeting edit, find which sessions changed start time and reset just
// those picks (attendees re-RSVP). returns the affected user ids for the optional
// notify email. compares stored vs new instants, so an unchanged session (same
// time round-tripped) isn't touched.
async function resetChangedMeetingSessions(post, newFields) {
  const oldOpts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  const newOpts = Array.isArray(newFields.meetingOptions) ? newFields.meetingOptions : [];
  const oldById = new Map(oldOpts.filter((o) => o && o.id).map((o) => [o.id, o]));
  const instant = (v) => (v ? new Date(v).getTime() : null);

  const changedIds = [];
  for (const o of newOpts) {
    if (!o || !o.id) continue;
    const old = oldById.get(o.id);
    if (old && instant(old.at) !== instant(o.at)) changedIds.push(o.id);
  }
  const singleChanged =
    oldOpts.length === 0 &&
    newOpts.length === 0 &&
    Boolean(post.meetingAt || newFields.meetingAt) &&
    instant(post.meetingAt) !== instant(newFields.meetingAt);

  if (!changedIds.length && !singleChanged) return [];

  if (changedIds.length) {
    const choices = await prisma.announcementMeetingChoice.findMany({
      where: { announcementId: post.id, optionId: { in: changedIds } },
      select: { userId: true },
    });
    const affected = [...new Set(choices.map((c) => c.userId))];
    await prisma.announcementMeetingChoice.deleteMany({
      where: { announcementId: post.id, optionId: { in: changedIds } },
    });
    // anyone left with no real pick goes back to no-response (must re-RSVP).
    for (const uid of affected) {
      const remaining = await prisma.announcementMeetingChoice.findMany({
        where: { announcementId: post.id, userId: uid },
        select: { optionId: true },
      });
      const realLeft = remaining.filter((c) => !String(c.optionId).startsWith("cant:"));
      if (realLeft.length === 0) {
        await prisma.announcementMeetingResponse.deleteMany({
          where: { announcementId: post.id, userId: uid },
        });
        await clearMeetingResponseAck(post.id, uid);
      }
    }
    return affected;
  }
  // single-session time moved: reset everyone who was going.
  const going = await prisma.announcementMeetingResponse.findMany({
    where: { announcementId: post.id, cantMakeIt: false },
    select: { userId: true },
  });
  const affected = going.map((r) => r.userId);
  await prisma.announcementMeetingResponse.deleteMany({
    where: { announcementId: post.id, cantMakeIt: false },
  });
  for (const uid of affected) await clearMeetingResponseAck(post.id, uid);
  return affected;
}

// EMAIL-ME-AS-SLOTS-ARE-PICKED, flipped from the announcement page. Author,
// whoever posted on their behalf, or a moderator - the same people the roster
// answers to. Not part of the edit form on purpose: it has to be flippable on
// a meeting that is already posted or scheduled without opening an edit.
export async function setSlotAlerts(postId, on) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, postedById: true, deletedAt: true },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  const allowed =
    post.authorId === user.id || post.postedById === user.id || isModerator(user.role);
  if (!allowed) redirect(`/portal/announcements/${postId}`);
  await prisma.announcement.update({
    where: { id: postId },
    data: { meetingSlotAlerts: !!on },
  });
  revalidatePath(`/portal/announcements/${postId}`);
}

export async function togglePin(postId) {
  const user = await requireUser();
  if (!isModerator(user.role)) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, pinnedAt: true, deletedAt: true },
  });
  if (!post || post.deletedAt) {
    redirect("/portal/announcements");
  }

  if (post.pinnedAt) {
    await prisma.announcement.update({
      where: { id: postId },
      data: { pinnedAt: null, pinnedById: null },
    });
  } else {
    await prisma.announcement.update({
      where: { id: postId },
      data: { pinnedAt: new Date(), pinnedById: user.id },
    });
  }

  revalidatePath("/portal/announcements");
  revalidatePath(`/portal/announcements/${postId}`);
}

export async function toggleLike(postId) {
  const user = await requireUser();
  const existing = await prisma.announcementLike.findUnique({
    where: { announcementId_userId: { announcementId: postId, userId: user.id } },
  });
  if (existing) {
    await prisma.announcementLike.delete({
      where: { announcementId_userId: { announcementId: postId, userId: user.id } },
    });
  } else {
    const post = await prisma.announcement.findUnique({
      where: { id: postId },
      select: { id: true, deletedAt: true },
    });
    if (!post || post.deletedAt) {
      redirect("/portal/announcements");
    }
    await prisma.announcementLike.create({
      data: { announcementId: postId, userId: user.id },
    });
  }
  revalidatePath("/portal/announcements");
  revalidatePath(`/portal/announcements/${postId}`);
}

// ----------- COMMENTS -----------

export async function addComment(postId, formData) {
  const user = await requireUser();
  const content = cleanBody(formData.get("content"), COMMENT_CONTENT_MAX);
  if (!content) {
    redirect(`/portal/announcements/${postId}?error=comment`);
  }
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, deletedAt: true },
  });
  if (!post || post.deletedAt) {
    redirect("/portal/announcements");
  }

  await prisma.announcementComment.create({
    data: { announcementId: postId, authorId: user.id, content },
  });
  revalidatePath(`/portal/announcements/${postId}`);
  revalidatePath("/portal/announcements");
}

export async function editComment(commentId, formData) {
  const user = await requireUser();
  const comment = await prisma.announcementComment.findUnique({
    where: { id: commentId },
    select: { id: true, announcementId: true, authorId: true, deletedAt: true },
  });
  if (!comment || comment.deletedAt) {
    redirect("/portal/announcements");
  }
  if (comment.authorId !== user.id) {
    redirect(`/portal/announcements/${comment.announcementId}?error=forbidden`);
  }
  const content = cleanBody(formData.get("content"), COMMENT_CONTENT_MAX);
  if (!content) {
    redirect(`/portal/announcements/${comment.announcementId}?error=comment`);
  }
  await prisma.announcementComment.update({
    where: { id: commentId },
    data: { content, editedAt: new Date() },
  });
  revalidatePath(`/portal/announcements/${comment.announcementId}`);
}

export async function deleteComment(commentId) {
  const user = await requireUser();
  const comment = await prisma.announcementComment.findUnique({
    where: { id: commentId },
    select: { id: true, announcementId: true, authorId: true, deletedAt: true },
  });
  if (!comment || comment.deletedAt) {
    redirect("/portal/announcements");
  }
  const canDelete = comment.authorId === user.id || isModerator(user.role);
  if (!canDelete) {
    redirect(`/portal/announcements/${comment.announcementId}?error=forbidden`);
  }
  await prisma.announcementComment.update({
    where: { id: commentId },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/portal/announcements/${comment.announcementId}`);
}

// ----------- ACKNOWLEDGMENTS -----------

// staff "I read this" from inside the portal. idempotent (upsert on the
// composite PK). only people on the expected list (mustAcknowledge) can ack -
// managers+ dont get a box.
export async function acknowledge(postId) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, requireAck: true, deletedAt: true },
  });
  if (!post || post.deletedAt || !post.requireAck) {
    redirect(`/portal/announcements/${postId}`);
  }
  if (!isAckExempt(user)) {
    await recordAnnouncementAck({ announcementId: postId, userId: user.id });
  }
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// is this user in the meeting's audience (who's invited)?
function meetingInAudience(post, user) {
  return post.ackEveryone
    ? !isAckExempt(user)
    : (post.ackTitles || []).some((t) =>
        (user.title || "").toLowerCase().includes(t.toLowerCase()),
      ) || (post.ackUserIds || []).includes(user.id);
}

// a meeting response (going or cant make it) also records the acknowledgment,
// so a meeting that requires ack is satisfied by responding.
async function markMeetingAck(postId, user, requireAck) {
  if (requireAck && !isAckExempt(user)) {
    await recordAnnouncementAck({ announcementId: postId, userId: user.id });
  }
}

// retracting a meeting response also clears the auto-ack that responding created
// (viaEmail=false, since for a meeting "responding counts as acknowledgment"). a
// real one-click email ack (viaEmail=true) is left intact.
async function clearMeetingResponseAck(postId, userId) {
  await prisma.announcementAck.deleteMany({
    where: { announcementId: postId, userId, viaEmail: false },
  });
}

const MEETING_RESPONSE_SELECT = {
  id: true,
  deletedAt: true,
  meetingOptions: true,
  meetingMultiPick: true,
  meetingAt: true,
  requireAck: true,
  ackEveryone: true,
  ackTitles: true,
  ackUserIds: true,
};

// the attendee's current picks + response mark, for computing what's locked.
async function loadMyMeetingState(postId, userId) {
  const [myChoices, resp] = await Promise.all([
    prisma.announcementMeetingChoice.findMany({
      where: { announcementId: postId, userId },
      select: { optionId: true, attended: true },
    }),
    prisma.announcementMeetingResponse.findUnique({
      where: { announcementId_userId: { announcementId: postId, userId } },
      select: { attended: true },
    }),
  ]);
  return { myChoices, myAttended: resp?.attended || null };
}

// pick or unpick a meeting session option. single-pick replaces any prior
// choice (clicking the same one clears it); multi-pick toggles just that one.
// only people in the meeting audience may pick. picking marks them "going"
// (clears any "cant make it"); unpicking the last one drops the response.
export async function chooseMeetingOption(postId, optionId) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: MEETING_RESPONSE_SELECT,
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  const opts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  if (!opts.some((o) => o && o.id === optionId)) {
    redirect(`/portal/announcements/${postId}`);
  }
  if (!meetingInAudience(post, user)) redirect(`/portal/announcements/${postId}`);

  const key = {
    announcementId_userId_optionId: {
      announcementId: postId,
      userId: user.id,
      optionId,
    },
  };
  const existing = await prisma.announcementMeetingChoice.findUnique({ where: key });

  // THE SLOT'S CAP, CHECKED ON THE SERVER. The picker greys a full session out,
  // and a greyed control is a suggestion: two people can press the last seat in
  // the same second, and one of them has to be told no. Counted here rather
  // than trusted from the page.
  //
  // Somebody already in the slot is never turned away from it - re-confirming a
  // pick they hold must not fail because the slot filled around them. Only a
  // new pick can be refused, which is why `existing` is passed in.
  const chosen = opts.find((o) => o && o.id === optionId);
  if (!existing) {
    const taken = await prisma.announcementMeetingChoice.count({
      where: { announcementId: postId, optionId },
    });
    if (!canTake(chosen, taken, false)) {
      return { ok: false, error: "full", say: "That time is full. Please pick another." };
    }
  }

  if (post.meetingMultiPick) {
    if (existing) {
      await prisma.announcementMeetingChoice.delete({ where: key });
    } else {
      await prisma.announcementMeetingChoice.create({
        data: { announcementId: postId, userId: user.id, optionId },
      });
    }
  } else {
    await prisma.announcementMeetingChoice.deleteMany({
      where: { announcementId: postId, userId: user.id },
    });
    if (!existing) {
      await prisma.announcementMeetingChoice.create({
        data: { announcementId: postId, userId: user.id, optionId },
      });
    }
  }

  // a NEW pick tells the author, when the announcement asked to be told. Best
  // effort: the pick is already saved and a failed email must not undo it.
  if (!existing) {
    try {
      await sendSlotAlert(postId, user, [optionId]);
    } catch (e) {
      console.error("slot alert failed:", e?.message || e);
    }
  }

  // sync the response: going if any pick remains, otherwise back to no-response.
  const respKey = {
    announcementId_userId: { announcementId: postId, userId: user.id },
  };
  const remaining = await prisma.announcementMeetingChoice.count({
    where: { announcementId: postId, userId: user.id },
  });
  if (remaining > 0) {
    await prisma.announcementMeetingResponse.upsert({
      where: respKey,
      create: { announcementId: postId, userId: user.id, cantMakeIt: false },
      update: { cantMakeIt: false, reason: null },
    });
    await markMeetingAck(postId, user, post.requireAck);
  } else {
    await prisma.announcementMeetingResponse.deleteMany({
      where: { announcementId: postId, userId: user.id },
    });
    await clearMeetingResponseAck(postId, user.id);
  }
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// set the user's whole session pick-set at once (the "Confirm attendance" flow).
// replaces any existing picks with the submitted optionIds (capped to 1 unless
// the meeting allows multi-pick), then syncs the going/no-response state.
export async function setMeetingChoices(postId, formData) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: MEETING_RESPONSE_SELECT,
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  if (!meetingInAudience(post, user)) redirect(`/portal/announcements/${postId}`);
  const opts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  const optById = new Map(opts.map((o) => [o.id, o]));
  const isSeries = opts.some((o) => o && o.seriesId);
  const seriesIds = new Set(opts.map((o) => o && o.seriesId).filter(Boolean));
  // valid = real option ids, plus a "cant:<seriesId>" decline per series.
  const isCant = (id) => String(id).startsWith("cant:");
  const seriesOf = (id) => (isCant(id) ? id.slice(5) : optById.get(id)?.seriesId);
  const valid = (id) =>
    isCant(id) ? seriesIds.has(id.slice(5)) : optById.has(id);
  // what's already locked for this attendee (started sessions / marked picks).
  const { myChoices } = await loadMyMeetingState(postId, user.id);
  const locks = computeMeetingLocks({
    options: opts,
    myChoices,
    meetingAt: post.meetingAt,
    now: Date.now(),
  });

  let ids = [...new Set(formData.getAll("optionId").map(String))].filter(valid);

  // THE CAP, ON THE OTHER WAY IN. This path takes the whole response at once -
  // it is the one the emailed link posts through - so a full slot has to be
  // refused here too, or the cap only holds for people who happened to use the
  // portal. Counted per option they are NOT already in; a pick they already
  // hold is theirs to keep.
  //
  // The whole submission is refused rather than quietly dropping the full ones:
  // somebody who picked Tuesday 10:00 and got a confirmation with no Tuesday on
  // it would have no idea what happened.
  {
    const mine = new Set(myChoices.map((c) => c.optionId));
    const wanted = ids.filter((id) => !isCant(id) && !mine.has(id));
    if (wanted.length) {
      const counts = await prisma.announcementMeetingChoice.groupBy({
        by: ["optionId"],
        where: { announcementId: postId, optionId: { in: wanted } },
        _count: { _all: true },
      });
      const takenBy = new Map(counts.map((c) => [c.optionId, c._count._all]));
      const full = wanted.filter((id) => !canTake(optById.get(id), takenBy.get(id) || 0, false));
      if (full.length) {
        const names = full.map((id) => optById.get(id)?.label).filter(Boolean).join(", ");
        return {
          ok: false,
          error: "full",
          say: names
            ? `${names} ${full.length === 1 ? "is" : "are"} full now. Please pick another time.`
            : "That time is full. Please pick another.",
        };
      }
    }
  }

  if (isSeries) {
    const lockedSeries = new Set(locks.lockedSeriesIds);
    // one decision per series; ignore any change to a locked series.
    const bySeries = new Map();
    for (const id of ids) {
      const sid = seriesOf(id);
      if (lockedSeries.has(sid)) continue;
      bySeries.set(sid, id);
    }
    ids = [...bySeries.values()];
    // replace only the unlocked-series picks; keep the locked ones untouched.
    const toDelete = myChoices
      .map((c) => c.optionId)
      .filter((oid) => !lockedSeries.has(seriesOf(oid)));
    if (toDelete.length) {
      await prisma.announcementMeetingChoice.deleteMany({
        where: { announcementId: postId, userId: user.id, optionId: { in: toDelete } },
      });
    }
    if (ids.length) {
      await prisma.announcementMeetingChoice.createMany({
        data: ids.map((optionId) => ({ announcementId: postId, userId: user.id, optionId })),
        skipDuplicates: true,
      });
    }
  } else {
    // single / flat multi: the whole response is locked once it starts or is marked.
    if (locks.lockedAll) redirect(`/portal/announcements/${postId}?error=locked`);
    if (!post.meetingMultiPick) ids = ids.slice(0, 1);
    await prisma.announcementMeetingChoice.deleteMany({
      where: { announcementId: postId, userId: user.id },
    });
    if (ids.length) {
      await prisma.announcementMeetingChoice.createMany({
        data: ids.map((optionId) => ({ announcementId: postId, userId: user.id, optionId })),
        skipDuplicates: true,
      });
    }
  }

  // a NEW pick tells the author, when the announcement asked to be told. New =
  // held now and not held when the form opened; re-confirming an existing pick
  // says nothing. Best effort: the picks are saved and a failed email must not
  // undo them.
  {
    const before = new Set(myChoices.map((c) => c.optionId));
    const fresh = ids.filter((oid) => !before.has(oid));
    if (fresh.length) {
      try {
        await sendSlotAlert(postId, user, fresh);
      } catch (e) {
        console.error("slot alert failed:", e?.message || e);
      }
    }
  }

  // recompute the response from the FULL resulting pick set (kept + new).
  const finalChoices = await prisma.announcementMeetingChoice.findMany({
    where: { announcementId: postId, userId: user.id },
    select: { optionId: true },
  });
  const finalIds = finalChoices.map((c) => c.optionId);
  const respKey = {
    announcementId_userId: { announcementId: postId, userId: user.id },
  };
  // attending at least one real date = going; only can't-attend picks = can't make it.
  const realPicks = finalIds.filter((id) => !isCant(id));
  // a reason only applies when they declined at least one series.
  const hasCant = finalIds.some(isCant);
  const reason = hasCant
    ? (formData.get("reason") || "").toString().trim().slice(0, 300) || null
    : null;
  if (finalIds.length > 0) {
    await prisma.announcementMeetingResponse.upsert({
      where: respKey,
      create: { announcementId: postId, userId: user.id, cantMakeIt: realPicks.length === 0, reason },
      update: { cantMakeIt: realPicks.length === 0, reason },
    });
    await markMeetingAck(postId, user, post.requireAck);
  } else {
    await prisma.announcementMeetingResponse.deleteMany({
      where: { announcementId: postId, userId: user.id },
    });
    await clearMeetingResponseAck(postId, user.id);
  }
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// single-session "I'll be there" toggle (no session options to pick). sets the
// response to going, or clears it if they were already going.
export async function attendMeeting(postId) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: MEETING_RESPONSE_SELECT,
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  if (!meetingInAudience(post, user)) redirect(`/portal/announcements/${postId}`);
  const respKey = {
    announcementId_userId: { announcementId: postId, userId: user.id },
  };
  const existing = await prisma.announcementMeetingResponse.findUnique({
    where: respKey,
  });
  // single-session: once it starts or you're marked present/absent, it's locked.
  const locks = computeMeetingLocks({
    options: [],
    myChoices: [],
    meetingAt: post.meetingAt,
    myAttended: existing?.attended || null,
    now: Date.now(),
  });
  if (locks.lockedAll) redirect(`/portal/announcements/${postId}?error=locked`);
  if (existing && !existing.cantMakeIt) {
    await prisma.announcementMeetingResponse.delete({ where: respKey });
    await clearMeetingResponseAck(postId, user.id);
  } else {
    await prisma.announcementMeetingResponse.upsert({
      where: respKey,
      create: { announcementId: postId, userId: user.id, cantMakeIt: false },
      update: { cantMakeIt: false, reason: null },
    });
    await markMeetingAck(postId, user, post.requireAck);
  }
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// "I can't make it / can't make any of these" + an optional reason. clears any
// session picks and marks the response as cant make it.
export async function cantMakeMeeting(postId, formData) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: MEETING_RESPONSE_SELECT,
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  if (!meetingInAudience(post, user)) redirect(`/portal/announcements/${postId}`);
  // this "can't make any of these" path clears every pick, so refuse it if
  // anything is already locked (a started/marked session or series) - those can't
  // be retracted by the attendee.
  const { myChoices, myAttended } = await loadMyMeetingState(postId, user.id);
  const opts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  const locks = computeMeetingLocks({
    options: opts,
    myChoices,
    meetingAt: post.meetingAt,
    myAttended,
    now: Date.now(),
  });
  if (locks.lockedAll || locks.lockedSeriesIds.length) {
    redirect(`/portal/announcements/${postId}?error=locked`);
  }
  const reason =
    (formData.get("reason") || "").toString().trim().slice(0, 300) || null;
  await prisma.announcementMeetingChoice.deleteMany({
    where: { announcementId: postId, userId: user.id },
  });
  await prisma.announcementMeetingResponse.upsert({
    where: {
      announcementId_userId: { announcementId: postId, userId: user.id },
    },
    create: { announcementId: postId, userId: user.id, cantMakeIt: true, reason },
    update: { cantMakeIt: true, reason },
  });
  await markMeetingAck(postId, user, post.requireAck);
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// add / update the Zoom link + passcode on an existing meeting (e.g. it was
// created "link provided later"). author or a moderator. adding a link clears
// the "provided later" flag; clearing the link leaves that flag as-is.
export async function setMeetingLink(postId, formData) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, deletedAt: true, meetingFormat: true },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  // the Zoom link + passcode are admin-only.
  if (!isAdminUp(user.role)) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  if (!formatHasOnline(post.meetingFormat)) {
    redirect(`/portal/announcements/${postId}`);
  }
  const link =
    (formData.get("zoomLink") || "").toString().trim().slice(0, 500) || null;
  const code =
    (formData.get("zoomCode") || "").toString().trim().slice(0, 60) || null;
  await prisma.announcement.update({
    where: { id: postId },
    data: { zoomLink: link, zoomCode: code, ...(link ? { zoomLinkTbd: false } : {}) },
  });
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// set the meeting's Zoom link(s) from the "Edit Zoom links" dialog. handles the
// "same for every session" case (one default link) and the per-session case
// (each session its own link, stored in meetingOptions). admin only.
export async function setMeetingZoomLinks(postId, formData) {
  const user = await requireUser();
  if (!isAdminUp(user.role)) redirect(`/portal/announcements/${postId}?error=forbidden`);
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, deletedAt: true, meetingFormat: true, meetingOptions: true },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  if (!formatHasOnline(post.meetingFormat)) redirect(`/portal/announcements/${postId}`);

  const clean = (v, max) => (v || "").toString().trim().slice(0, max) || null;
  const defLink = clean(formData.get("zoomLink"), 500);
  const defCode = clean(formData.get("zoomCode"), 60);
  const sameForAll = formData.get("sameForAll") === "on";

  const opts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  let newOpts = opts;
  if (opts.length && !sameForAll) {
    // each session carries its own link/passcode; blank = fall back to default.
    newOpts = opts.map((o) =>
      o && o.id
        ? {
            ...o,
            zoomLink: clean(formData.get(`optZoomLink_${o.id}`), 500),
            zoomCode: clean(formData.get(`optZoomCode_${o.id}`), 60),
          }
        : o,
    );
  } else if (opts.length && sameForAll) {
    // "same for all": clear the per-session overrides so everyone uses default.
    newOpts = opts.map((o) => (o && o.id ? { ...o, zoomLink: null, zoomCode: null } : o));
  }

  await prisma.announcement.update({
    where: { id: postId },
    data: {
      zoomLink: defLink,
      zoomCode: defCode,
      ...(opts.length ? { meetingOptions: newOpts } : {}),
      ...(defLink ? { zoomLinkTbd: false } : {}),
    },
  });
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// write a present/absent/null mark. for a multi-session or series meeting the
// mark lives per session on the chosen option row; for a single-session meeting
// (no optionId) it stays on the response. shared by both roll-call actions.
async function writeAttendance(postId, userId, status, optionId) {
  const value = status === "present" || status === "absent" ? status : null;
  if (optionId) {
    await prisma.announcementMeetingChoice.updateMany({
      where: { announcementId: postId, userId, optionId },
      data: { attended: value },
    });
  } else {
    await prisma.announcementMeetingResponse.updateMany({
      where: { announcementId: postId, userId, cantMakeIt: false },
      data: { attended: value },
    });
  }
}

// roll-call: mark a going attendee present / absent for a session, or clear it.
// admin-and-up only. optionId set = per-session (multi/series); null = single.
export async function setAttendance(postId, userId, status, optionId = null) {
  const user = await requireUser();
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, deletedAt: true },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  // roll-call (attendance) is admin-and-up only, matching who can see the roster.
  if (!isAdminUp(user.role)) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  await writeAttendance(postId, userId, status, optionId);
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

// like setAttendance but RETURNS instead of redirecting, so the admin meeting-
// attendance card can mark roll-call inline without a full navigation (which would
// collapse the drill-down). status "" / anything else = back to neutral (unmarked).
export async function markAttendance(postId, userId, status, optionId = null) {
  const user = await requireUser();
  if (!isAdminUp(user.role)) return { ok: false };
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, deletedAt: true },
  });
  if (!post || post.deletedAt) return { ok: false };
  await writeAttendance(postId, userId, status, optionId);
  revalidatePath("/portal/admin/meeting-attendance");
  revalidatePath(`/portal/announcements/${postId}`);
  return { ok: true };
}

// ---- admin overrides on the roster (all Admin/IT/Super, all bypass locks) ----
// these don't redirect - they revalidate the detail page AND the meeting-attendance
// report and return, so the admin can run them from either place without getting
// bounced away (same idea as markAttendance / markAckFor).

// record an acknowledgment on someone's behalf. keeps an existing self/email ack
// as-is (only stamps recordedById when creating a fresh one).
async function recordAckFor(postId, userId, adminId) {
  await recordAnnouncementAck({ announcementId: postId, userId, recordedById: adminId });
}

// gate an admin roster action + load the meeting. returns the post or redirects.
async function requireAdminMeeting(postId) {
  const user = await requireUser();
  if (!isAdminUp(user.role)) redirect(`/portal/announcements/${postId}?error=forbidden`);
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: {
      id: true,
      deletedAt: true,
      meetingOptions: true,
      meetingMultiPick: true,
      requireAck: true,
    },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  return { user, post };
}

// ensure a person is "going" to optionId, clearing conflicting picks: the same
// series (series) or their single pick (single-pick meeting). shared by add +
// move. records the ack if the meeting requires one.
async function ensureGoingChoice(post, userId, optionId, adminId) {
  const opts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  const target = opts.find((o) => o && o.id === optionId);
  if (!target) return false;
  if (target.seriesId) {
    const sameSeries = opts
      .filter((o) => o.seriesId === target.seriesId)
      .map((o) => o.id);
    await prisma.announcementMeetingChoice.deleteMany({
      where: {
        announcementId: post.id,
        userId,
        optionId: { in: [...sameSeries, `cant:${target.seriesId}`] },
      },
    });
  } else if (!post.meetingMultiPick) {
    await prisma.announcementMeetingChoice.deleteMany({
      where: { announcementId: post.id, userId },
    });
  }
  await prisma.announcementMeetingChoice.upsert({
    where: {
      announcementId_userId_optionId: { announcementId: post.id, userId, optionId },
    },
    create: { announcementId: post.id, userId, optionId },
    update: {},
  });
  await prisma.announcementMeetingResponse.upsert({
    where: { announcementId_userId: { announcementId: post.id, userId } },
    create: { announcementId: post.id, userId, cantMakeIt: false },
    update: { cantMakeIt: false, reason: null },
  });
  if (post.requireAck) await recordAckFor(post.id, userId, adminId);
  return true;
}

// record a whole response for someone (used by the series "Record response"
// picker: one date per series at once). replaces their pick-set with the
// submitted optionIds (one per series), sets going, records the ack.
export async function adminRecordChoices(postId, userId, formData) {
  const { user, post } = await requireAdminMeeting(postId);
  const opts = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  const optById = new Map(opts.filter((o) => o && o.id).map((o) => [o.id, o]));
  const isSeries = opts.some((o) => o && o.seriesId);
  const seriesIds = new Set(opts.map((o) => o && o.seriesId).filter(Boolean));
  const isCant = (id) => String(id).startsWith("cant:");
  const seriesOf = (id) => (isCant(id) ? id.slice(5) : optById.get(id)?.seriesId);
  const valid = (id) => (isCant(id) ? seriesIds.has(id.slice(5)) : optById.has(id));

  let ids = [...new Set(formData.getAll("optionId").map(String))].filter(valid);
  if (isSeries) {
    const bySeries = new Map();
    for (const id of ids) bySeries.set(seriesOf(id), id);
    ids = [...bySeries.values()];
  } else if (!post.meetingMultiPick) {
    ids = ids.slice(0, 1);
  }

  await prisma.announcementMeetingChoice.deleteMany({
    where: { announcementId: postId, userId },
  });
  if (ids.length) {
    await prisma.announcementMeetingChoice.createMany({
      data: ids.map((optionId) => ({ announcementId: postId, userId, optionId })),
      skipDuplicates: true,
    });
  }
  const realPicks = ids.filter((id) => !isCant(id));
  if (ids.length) {
    await prisma.announcementMeetingResponse.upsert({
      where: { announcementId_userId: { announcementId: postId, userId } },
      create: { announcementId: postId, userId, cantMakeIt: realPicks.length === 0 },
      update: { cantMakeIt: realPicks.length === 0, reason: null },
    });
    if (post.requireAck) await recordAckFor(postId, userId, user.id);
  } else {
    await prisma.announcementMeetingResponse.deleteMany({
      where: { announcementId: postId, userId },
    });
  }
  revalidatePath(`/portal/announcements/${postId}`);
  revalidatePath("/portal/admin/meeting-attendance");
}

// walk-in / record-going: add someone to a session (used by "+ Add to this
// session" and by recording a no-response person as going).
export async function adminAddToSession(postId, userId, optionId) {
  const { user, post } = await requireAdminMeeting(postId);
  await ensureGoingChoice(post, userId, optionId, user.id);
  revalidatePath(`/portal/announcements/${postId}`);
  revalidatePath("/portal/admin/meeting-attendance");
}

// move a pick from one session to another (kebab "Move to another session").
export async function adminMoveSession(postId, userId, fromOptionId, toOptionId) {
  const { user, post } = await requireAdminMeeting(postId);
  if (fromOptionId) {
    await prisma.announcementMeetingChoice.deleteMany({
      where: { announcementId: postId, userId, optionId: fromOptionId },
    });
  }
  await ensureGoingChoice(post, userId, toOptionId, user.id);
  revalidatePath(`/portal/announcements/${postId}`);
  revalidatePath("/portal/admin/meeting-attendance");
}

// single-session: record a no-response person as going ("I'll be there" on their
// behalf).
export async function adminSetGoing(postId, userId) {
  const { user, post } = await requireAdminMeeting(postId);
  await prisma.announcementMeetingResponse.upsert({
    where: { announcementId_userId: { announcementId: postId, userId } },
    create: { announcementId: postId, userId, cantMakeIt: false },
    update: { cantMakeIt: false, reason: null },
  });
  if (post.requireAck) await recordAckFor(postId, userId, user.id);
  revalidatePath(`/portal/announcements/${postId}`);
  revalidatePath("/portal/admin/meeting-attendance");
}

// record a person as can't-make-it (clears any picks).
export async function adminSetCantMake(postId, userId) {
  const { user, post } = await requireAdminMeeting(postId);
  await prisma.announcementMeetingChoice.deleteMany({
    where: { announcementId: postId, userId },
  });
  await prisma.announcementMeetingResponse.upsert({
    where: { announcementId_userId: { announcementId: postId, userId } },
    create: { announcementId: postId, userId, cantMakeIt: true },
    update: { cantMakeIt: true },
  });
  if (post.requireAck) await recordAckFor(postId, userId, user.id);
  revalidatePath(`/portal/announcements/${postId}`);
  revalidatePath("/portal/admin/meeting-attendance");
}

// remove someone from the meeting entirely (response + picks + the auto-ack that
// responding created; a real one-click email ack is left intact).
export async function adminRemoveFromMeeting(postId, userId) {
  await requireAdminMeeting(postId);
  await prisma.announcementMeetingChoice.deleteMany({
    where: { announcementId: postId, userId },
  });
  await prisma.announcementMeetingResponse.deleteMany({
    where: { announcementId: postId, userId },
  });
  await prisma.announcementAck.deleteMany({
    where: { announcementId: postId, userId, viaEmail: false },
  });
  revalidatePath(`/portal/announcements/${postId}`);
  revalidatePath("/portal/admin/meeting-attendance");
}

// add someone to the invite/ack audience without editing the whole post (appends
// to the specific-people list). optionally emails just that new person. admin
// only. works on a meeting or an ack-required announcement.
export async function adminAddInvitee(postId, userId, formData) {
  const user = await requireUser();
  if (!isAdminUp(user.role)) redirect(`/portal/announcements/${postId}?error=forbidden`);
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: {
      id: true,
      deletedAt: true,
      tag: true,
      requireAck: true,
      ackUserIds: true,
      title: true,
      content: true,
      // the PDFs the post carries, so the email can attach them
      attachments: true,
      // and whether a signature is wanted, which changes the button
      formId: true,
      createdAt: true,
      ackEveryone: true,
      ackTitles: true,
      ...EMAIL_MEETING_SELECT,
      author: { select: EMAIL_AUTHOR_SELECT },
    },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  if (!isCompanyMeeting(post.tag) && !post.requireAck) {
    redirect(`/portal/announcements/${postId}`);
  }
  const target = await prisma.user.findFirst({
    where: { id: userId, deactivatedAt: null },
    select: { id: true },
  });
  if (!target) redirect(`/portal/announcements/${postId}`);

  const ids = new Set(post.ackUserIds || []);
  if (!ids.has(userId)) {
    await prisma.announcement.update({
      where: { id: postId },
      data: { ackUserIds: [...ids, userId] },
    });
  }
  if (formData?.get("email") === "on") {
    await emailAnnouncement(post, { id: { in: [userId] } });
  }
  revalidatePath(`/portal/announcements/${postId}`);
  revalidatePath("/portal/admin/meeting-attendance");
  revalidatePath("/portal/admin/acknowledgments");
}

// remove an individually-added invitee (drops them from the specific-people
// list). someone invited via Everyone or a role can't be removed this way.
export async function adminRemoveInvitee(postId, userId) {
  const user = await requireUser();
  if (!isAdminUp(user.role)) redirect(`/portal/announcements/${postId}?error=forbidden`);
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, deletedAt: true, ackUserIds: true },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  await prisma.announcement.update({
    where: { id: postId },
    data: { ackUserIds: (post.ackUserIds || []).filter((id) => id !== userId) },
  });
  revalidatePath(`/portal/announcements/${postId}`);
  revalidatePath("/portal/admin/meeting-attendance");
  revalidatePath("/portal/admin/acknowledgments");
}

// mark / unmark an acknowledgment on someone's behalf. works for a plain ack
// announcement or a meeting. admin only.
export async function markAckFor(postId, userId) {
  const user = await requireUser();
  if (!isAdminUp(user.role)) redirect(`/portal/announcements/${postId}?error=forbidden`);
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, deletedAt: true },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  await recordAckFor(postId, userId, user.id);
  // no redirect - stays on whichever page called it (detail roster OR the admin
  // acknowledgments report), re-rendering with the fresh ack.
  revalidatePath(`/portal/announcements/${postId}`);
  revalidatePath("/portal/admin/acknowledgments");
}

export async function unmarkAckFor(postId, userId) {
  const user = await requireUser();
  if (!isAdminUp(user.role)) redirect(`/portal/announcements/${postId}?error=forbidden`);
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, deletedAt: true },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");
  await prisma.announcementAck.deleteMany({
    where: { announcementId: postId, userId },
  });
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}`);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ackEmailHtml({ firstName, title, snippet, url }) {
  // simple inline-styled email - trusted internal content, but escaped anyway.
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1f2937;">
    <p style="font-size: 15px;">Hi ${escapeHtml(firstName)},</p>
    <p style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">${escapeHtml(title)}</p>
    <p style="font-size: 14px; line-height: 1.6; color: #4b5563; white-space: pre-wrap;">${escapeHtml(snippet)}</p>
    <p style="font-size: 14px; line-height: 1.6; color: #374151;">By clicking below, you acknowledge that you have read and understood the contents of this announcement.</p>
    <p style="margin: 22px 0;">
      <a href="${url}" style="display: inline-block; background: #2f6f4f; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-size: 15px; font-weight: 600;">Acknowledge that I've read this</a>
    </p>
    <p style="font-size: 12px; color: #6b7280;">One click confirms it, no login needed. If the button doesnt work, paste this into your browser:<br /><a href="${url}" style="color: #2f6f4f;">${url}</a></p>
  </div>`;
}

// "Send to staff by email" - emails an individualized one-click ack link to
// every active person on the expected list who hasnt acknowledged yet (so a
// re-send only nudges the stragglers). Supervisor+ only. best-effort: a send
// failure is logged, not fatal. stamps ackEmailSentAt when at least one went.
export async function sendAckEmails(postId) {
  const user = await requireUser();
  if (!isSupervisorUp(user.role)) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      content: true,
      // the PDFs the post carries, so the email can attach them
      attachments: true,
      // and whether a signature is wanted, which changes the button
      formId: true,
      requireAck: true,
      deletedAt: true,
      ackEveryone: true,
      ackTitles: true,
      ackUserIds: true,
    },
  });
  if (!post || post.deletedAt || !post.requireAck) {
    redirect(`/portal/announcements/${postId}`);
  }

  const from = process.env.ANNOUNCEMENTS_FROM || process.env.AUTH_RESEND_FROM;
  const base = (process.env.AUTH_URL || "").replace(/\/$/, "");
  if (!from || !base || !process.env.RESEND_API_KEY) {
    console.error(
      "ack email misconfigured - missing ANNOUNCEMENTS_FROM/AUTH_RESEND_FROM, AUTH_URL, or RESEND_API_KEY",
    );
    redirect(`/portal/announcements/${postId}?error=emailConfig`);
  }

  // recipients = this announcement's audience (NOT every staffer) who hasn't
  // acked yet, so the roster button can only nudge the people it's actually for.
  const recipients = await prisma.user.findMany({
    where: {
      ...ackAudienceWhere(post),
      announcementAcks: { none: { announcementId: postId } },
    },
    select: {
      id: true,
      email: true,
      name: true,
      preferredFirstName: true,
      preferredLastName: true,
    },
  });

  if (!recipients.length) {
    redirect(`/portal/announcements/${postId}?sent=0`);
  }

  const title = post.title || "New announcement";
  const snippet = (post.content || "").slice(0, 240);
  const subject = `Please acknowledge: ${title}`;
  const messages = recipients.map((r) => {
    const url = `${base}/a/ack/${signAckToken(postId, r.id)}`;
    const firstName = firstNameOf(r) || "there";
    // AND THE LOCK. This was the last sender in this file without one: pressed
    // from a laptop it mailed real staff for real, with every acknowledge link
    // pointing at localhost - the exact incident the guard was written for after
    // a timesheet reached an employee from a dev server. Every other announcement
    // path has been redirected off the real deployment since; this one was
    // missed, and being the roster's nudge button it is easy to press by
    // accident while testing.
    const route = resolveAnnouncementRecipients(r.email);
    return {
      from,
      to: route.to,
      subject: route.redirected
        ? `[TEST - would have gone to ${route.intendedEmail}] ${subject}`
        : subject,
      html: ackEmailHtml({ firstName, title, snippet, url }),
      text: `Hi ${firstName},\n\n${snippet}\n\nAcknowledge that you've read this: ${url}\n\nOne click confirms it, no login needed.`,
    };
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  try {
    // resend.batch.send takes up to 100 messages per call; chunk for safety.
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const { error } = await resend.batch.send(chunk);
      if (error) {
        console.error("ack email batch error:", error);
      } else {
        sent += chunk.length;
      }
    }
  } catch (e) {
    console.error("ack email send threw:", e);
  }

  if (sent > 0) {
    await prisma.announcement.update({
      where: { id: postId },
      data: { ackEmailSentAt: new Date() },
    });
  }

  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}?sent=${sent}`);
}

// meeting version of the roster nudge: email the invited people who haven't
// responded yet the meeting announcement (with the "Respond now" button).
// Supervisor+.
export async function emailMeetingNoResponse(postId) {
  const user = await requireUser();
  if (!isSupervisorUp(user.role)) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      content: true,
      // the PDFs the post carries, so the email can attach them
      attachments: true,
      // and whether a signature is wanted, which changes the button
      formId: true,
      requireAck: true,
      createdAt: true,
      deletedAt: true,
      ackEveryone: true,
      ackTitles: true,
      ackUserIds: true,
      ...EMAIL_MEETING_SELECT,
      author: { select: EMAIL_AUTHOR_SELECT },
    },
  });
  if (!post || post.deletedAt || !isCompanyMeeting(post.tag)) {
    redirect(`/portal/announcements/${postId}`);
  }
  // invited people minus anyone who already responded.
  const audience = await prisma.user.findMany({
    where: ackAudienceWhere(post),
    select: { id: true },
  });
  const responders = await prisma.announcementMeetingResponse.findMany({
    where: { announcementId: postId },
    select: { userId: true },
  });
  const responded = new Set(responders.map((r) => r.userId));
  const noRespIds = audience.map((u) => u.id).filter((id) => !responded.has(id));
  if (!noRespIds.length) {
    redirect(`/portal/announcements/${postId}?sent=0`);
  }
  // definitionally a chase-up: these are the people who did not respond first
  // time round, so say so in the subject rather than sending them a copy of a
  // mail they have already got and letting the client hide the body.
  const res = await emailAnnouncement(post, { id: { in: noRespIds } }, { reminder: true });
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}?sent=${res?.sent || 0}`);
}

// the prisma `where` for the "Who gets the email?" picker: Everyone = all active
// (incl. the Owner/Director), else the picked titles/people. null = nobody.
// emailAudienceWhere / emailAnnouncement moved to @/lib/announce-send on
// 2026-08-23 so the scheduled-publish cron sends through the same code.

// "Send by email" dialog action. Supervisor+ only.
export async function sendAnnouncementEmail(postId, formData) {
  const user = await requireUser();
  if (!isSupervisorUp(user.role)) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      content: true,
      // the PDFs the post carries, so the email can attach them
      attachments: true,
      // and whether a signature is wanted, which changes the button
      formId: true,
      requireAck: true,
      deletedAt: true,
      createdAt: true,
      ...EMAIL_MEETING_SELECT,
      author: { select: EMAIL_AUTHOR_SELECT },
    },
  });
  if (!post || post.deletedAt) redirect("/portal/announcements");

  const everyone = formData.get("everyone") === "on";
  const titles = formData
    .getAll("titles")
    .filter((t) => typeof t === "string" && t);
  const userIds = formData
    .getAll("userIds")
    .filter((t) => typeof t === "string" && t);
  if (!everyone && titles.length === 0 && userIds.length === 0) {
    redirect(`/portal/announcements/${postId}?error=recipients`);
  }
  const res = await emailAnnouncement(
    post,
    emailAudienceWhere({ everyone, titles, userIds }),
  );
  if (!res.ok && res.reason === "config") {
    redirect(`/portal/announcements/${postId}?error=emailConfig`);
  }
  revalidatePath(`/portal/announcements/${postId}`);
  redirect(`/portal/announcements/${postId}?sent=${res.sent}`);
}

// staff RSVP to an Event (for a headcount). going = coming or not; on a client
// event they also say how many clients they're bringing. one row per person.
export async function rsvpEvent(postId, formData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: { id: true, tag: true, deletedAt: true, publishedAt: true, eventAudience: true },
  });
  if (!post || post.deletedAt || !post.publishedAt || !isEvent(post.tag)) {
    redirect("/portal/announcements");
  }

  const going = formData.get("going") !== "no";
  let clientCount = 0;
  if (going && post.eventAudience === "client") {
    const n = parseInt(formData.get("clientCount"), 10);
    clientCount = Number.isFinite(n) && n > 0 ? Math.min(n, 999) : 0;
  }

  await prisma.announcementEventRsvp.upsert({
    where: { announcementId_userId: { announcementId: postId, userId: user.id } },
    create: { announcementId: postId, userId: user.id, going, clientCount },
    update: { going, clientCount },
  });
  revalidatePath(`/portal/announcements/${postId}`);
}

// ---------------------------------------------------------------- concluding

// CLOSING THE ROLL CALL, and sending the attestation if this meeting asks for
// one. Admin/IT/Super only, the same gate as marking attendance.
//
// TWO THINGS IN ONE PRESS, so both are stamped separately:
//   meetingConcludedAt        the roll call closed. always set.
//   meetingAttestationSentAt  the mail actually left. only set if it did.
//
// Separate because a meeting with no attestation form concludes without sending
// anything, and because a send that fails should leave the absences recorded and
// the mail still owed rather than pretending it went.
//
// WHO GETS MARKED ABSENT: people who said they were going and were never marked
// either way. NOT everyone invited. Attendance hangs off the response row, so
// marking a no-reply absent would mean inventing a response they never gave, and
// "absent" would stop meaning "said they would come and did not".
export async function concludeMeeting(postId, formData) {
  const user = await requireUser();
  if (!isAdminUp(user.role)) {
    redirect(`/portal/announcements/${postId}?error=forbidden`);
  }
  const post = await prisma.announcement.findUnique({
    where: { id: postId },
    select: {
      id: true, title: true, tag: true, content: true, deletedAt: true,
      attachments: true, meetingOptions: true, meetingConcludedAt: true,
      meetingAttestationSubject: true, meetingAttestationBody: true,
      meetingAttestationForm: {
        select: { id: true, title: true, fileUrl: true, fillable: true },
      },
    },
  });
  if (!post || post.deletedAt || !isCompanyMeeting(post.tag)) {
    redirect("/portal/announcements");
  }
  // idempotent by refusal: the button is gone once pressed, and a stale tab
  // posting it a second time must not re-send to everybody.
  if (post.meetingConcludedAt) {
    redirect(`/portal/announcements/${postId}?error=alreadyConcluded`);
  }

  const hasOptions = Array.isArray(post.meetingOptions) && post.meetingOptions.length > 0;

  // 1. THE ROLL CALL. per-session for multi/series meetings, meeting-level for
  //    single ones - the same split writeAttendance uses.
  const absent = hasOptions
    ? await prisma.announcementMeetingChoice.updateMany({
        // "cant:<seriesId>" rows are not sessions - they are how somebody says
        // they cannot attend a series at all. Marking those absent would be
        // marking a refusal as a no-show.
        where: {
          announcementId: postId,
          attended: null,
          NOT: { optionId: { startsWith: "cant:" } },
        },
        data: { attended: "absent" },
      })
    : await prisma.announcementMeetingResponse.updateMany({
        where: { announcementId: postId, cantMakeIt: false, attended: null },
        data: { attended: "absent" },
      });

  // 2. WHO WAS PRESENT, and so who owes an attestation.
  const presentIds = hasOptions
    ? [...new Set(
        (await prisma.announcementMeetingChoice.findMany({
          where: { announcementId: postId, attended: "present" },
          select: { userId: true },
        })).map((r) => r.userId),
      )]
    : (await prisma.announcementMeetingResponse.findMany({
        where: { announcementId: postId, attended: "present" },
        select: { userId: true },
      })).map((r) => r.userId);

  const form = post.meetingAttestationForm;
  let sent = 0;
  let mailError = null;

  if (form?.fillable && presentIds.length) {
    const result = await sendAttestation({ post, form, presentIds, formData });
    sent = result.sent;
    mailError = result.error;
  }

  await prisma.announcement.update({
    where: { id: postId },
    data: {
      meetingConcludedAt: new Date(),
      ...(sent > 0 ? { meetingAttestationSentAt: new Date() } : {}),
    },
  });

  revalidatePath(`/portal/announcements/${postId}`);
  revalidatePath("/portal/admin/meeting-attendance");
  const q = new URLSearchParams({ concluded: String(absent.count), sent: String(sent) });
  if (mailError) q.set("mailError", "1");
  redirect(`/portal/announcements/${postId}?${q}`);
}

// the attestation mail itself. Wording comes from the meeting, overridden by
// whatever was typed on the confirm step - that override applies to this send
// only and is never written back.
async function sendAttestation({ post, form, presentIds, formData }) {
  const from = process.env.ANNOUNCEMENTS_FROM || process.env.AUTH_RESEND_FROM;
  const base = (process.env.AUTH_URL || "").replace(/\/$/, "");
  if (!from || !base || !process.env.RESEND_API_KEY) {
    console.error("attestation email misconfigured");
    return { sent: 0, error: "config" };
  }
  const recipients = await prisma.user.findMany({
    where: { id: { in: presentIds }, deactivatedAt: null },
    select: { id: true, email: true, name: true, preferredFirstName: true, preferredLastName: true },
  });
  if (!recipients.length) return { sent: 0, error: null };

  const title = post.title || "Company meeting";
  const subject =
    (typeof formData?.get("subject") === "string" && formData.get("subject").trim()) ||
    post.meetingAttestationSubject ||
    `Please sign: ${title}`;
  const message =
    (typeof formData?.get("message") === "string" && formData.get("message").trim()) ||
    post.meetingAttestationBody ||
    "Thanks for attending. Please review and sign the attestation so we have your record on file.";

  // the attestation goes first, then whatever the post already carried - the
  // guides people were taken through ride along without being picked twice.
  const files = [];
  for (const a of emailAttachmentsOf(post, form)) {
    try {
      const url = a.url.startsWith("/") ? `${base}${a.url}` : a.url;
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      files.push({
        filename: `${a.name.replace(/[^\w .-]/g, "_").slice(0, 80)}.pdf`,
        content: Buffer.from(await res.arrayBuffer()).toString("base64"),
      });
    } catch (e) {
      console.error(`attestation attachment skipped (${a.url}):`, e?.message || e);
    }
  }

  const logoUrl = process.env.EMAIL_LOGO_URL || `${base}/logo/treelogo_gradient.png`;
  const messages = recipients.map((r) => {
    const url = `${base}/a/attest/${signAckToken(post.id, r.id)}`;
    const greeting = `Hi ${firstNameOf(r) || "there"},`;
    const html = buildAnnouncementEmailHtml({
      logoUrl,
      title,
      authorName: "My Life Services",
      authorTitle: null,
      dateStr: "",
      eyebrow: "Attestation",
      requireAck: false,
      bodyHtml: renderMarkdown(`${greeting}\n\n${message}`, { email: true }),
      ackUrl: null,
      meetingHtml: "",
      ctaHtml: postButton(url, "Review and sign"),
    });
    // AND THE LOCK. Off the real deployment this is redirected, same rule as
    // every other announcement mail - a laptop must not send staff a document
    // to sign with links pointing at localhost.
    const route = resolveAnnouncementRecipients(r.email);
    return {
      from,
      to: route.to,
      subject: route.redirected
        ? `[TEST - would have gone to ${route.intendedEmail}] ${subject}`
        : subject,
      html,
      text: `${greeting}\n\n${message}\n\nReview and sign: ${url}\n\nThe link is just for you, so please don't forward it. No login needed.`,
      attachments: files.length ? files : undefined,
    };
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  let error = null;
  try {
    if (files.length) {
      // ONE AT A TIME WHEN THERE ARE DOCUMENTS. Resend's BATCH endpoint does not
      // take attachments - "the attachments field is not supported yet" - and it
      // does NOT complain: the call succeeds and the PDFs are quietly dropped.
      // The whole point of this mail is the document it carries, so batching it
      // would send everyone a link to sign something they were never sent.
      //
      // The same trap already cost this codebase a week of announcements going
      // out with their documents missing. Same fix, same throttle.
      for (const m of messages) {
        // Resend allows 10 requests a second per team.
        if (sent > 0) await new Promise((r) => setTimeout(r, 120));
        const { error: e } = await resend.emails.send(m);
        if (e) { console.error(`attestation email failed (${m.to}):`, e); error = "send"; }
        else sent += 1;
      }
    } else {
      for (let i = 0; i < messages.length; i += 100) {
        const chunk = messages.slice(i, i + 100);
        const { error: e } = await resend.batch.send(chunk);
        if (e) { console.error("attestation batch error:", e); error = "send"; }
        else sent += chunk.length;
      }
    }
  } catch (e) {
    console.error("attestation send threw:", e);
    error = "send";
  }
  return { sent, error };
}
