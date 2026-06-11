"use server";

// handles public contact-form submissions: validate -> rate-limit ->
// email the office via resend. recipient is env-driven (CONTACT_INBOX)
// so it can change without a code edit. sends FROM the verified resend
// sender and sets reply-to to the visitor so staff can just hit reply.

import { headers } from "next/headers";
import { Resend } from "resend";
import { cleanEmail, cleanDisplayName, checkRateLimit } from "@/lib/security";
import { cleanBody } from "@/lib/hub";
import { cleanPhone } from "@/lib/contacts";

const REASONS = ["General", "Services", "Employment", "Partnership", "Other"];
const MESSAGE_MAX = 4000;

export async function submitContact(_prevState, formData) {
  // honeypot: a hidden field real users never see. if it's filled, it's a
  // bot - return a fake success so it doesn't learn to adapt.
  if (formData.get("company")) {
    return { ok: true };
  }

  // rate limit per IP (5/min, shared via upstash) so nobody can spam the inbox
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok: underLimit } = await checkRateLimit(`contact:${ip}`);
  if (!underLimit) {
    return {
      ok: false,
      error: "Too many messages in a short time. Please wait a minute and try again.",
    };
  }

  const name = cleanDisplayName(formData.get("name"), 80);
  const email = cleanEmail(formData.get("email"));
  const phoneRaw = formData.get("phone");
  const phone = phoneRaw ? cleanPhone(phoneRaw) : null;
  const reasonRaw = formData.get("reason");
  const reason = REASONS.includes(reasonRaw) ? reasonRaw : "General";
  const message = cleanBody(formData.get("message"), MESSAGE_MAX);

  if (!name) return { ok: false, error: "Please enter your name." };
  if (!email) return { ok: false, error: "Please enter a valid email address." };
  if (!message) return { ok: false, error: "Please enter a message." };

  // CONTACT_INBOX can be one address or a comma-separated list - everyone
  // listed gets a copy.
  const to = (process.env.CONTACT_INBOX || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // dedicated sender so inquiries are filterable; any @mylifeservicesinc.com
  // address works (domain is verified in resend). falls back to the default
  // sender if CONTACT_FROM isn't set.
  const from = process.env.CONTACT_FROM || process.env.AUTH_RESEND_FROM;
  if (!to.length || !from || !process.env.RESEND_API_KEY) {
    console.error(
      "contact form misconfigured - missing CONTACT_INBOX / AUTH_RESEND_FROM / RESEND_API_KEY",
    );
    return {
      ok: false,
      error: "Something went wrong on our end. Please call or email us directly.",
    };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    `Reason: ${reason}`,
    "",
    message,
  ]
    .filter((line) => line !== null)
    .join("\n");

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: email,
      subject: `New contact form: ${reason} — ${name}`,
      text,
    });
    if (error) {
      console.error("resend contact send error:", error);
      return {
        ok: false,
        error: "We couldn't send your message. Please try again, or email us directly.",
      };
    }
  } catch (err) {
    console.error("contact send threw:", err);
    return {
      ok: false,
      error: "We couldn't send your message. Please try again, or email us directly.",
    };
  }

  return { ok: true };
}
