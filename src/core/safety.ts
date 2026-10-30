import type { Draft, Flag, ListingDraft, ReplyDraft } from "./types";

// Content checks that run on everything an AI reads from outside and everything
// it writes before the owner sees it. They are deliberately strict: a false
// alarm costs the owner a glance, a miss could cost the shop.

const ETSY_TITLE_MAX = 140;
const ETSY_TAGS_MAX = 13;
const ETSY_TAG_LEN_MAX = 20;
const DESCRIPTION_MAX = 5000;
const REPLY_MAX = 2000;

/** Phrases that try to steer an AI rather than inform it. */
const INJECTION_PATTERNS: RegExp[] = [
  /\bignore\b.{0,40}\b(previous|prior|above|earlier|all)\b.{0,40}\b(instructions?|rules?|prompts?|messages?)/i,
  /\bdisregard\b.{0,40}\b(instructions?|rules?|guidelines?|prompt)/i,
  /\bforget\b.{0,40}\b(instructions?|rules?|everything)/i,
  /\b(system|developer)\s*(prompt|message|instructions?)\b/i,
  /\byou are (now|no longer)\b/i,
  /\bnew instructions?\b/i,
  /\bact as\b.{0,30}\b(admin|developer|system|assistant|ai)\b/i,
  /\b(jailbreak|do anything now|DAN mode)\b/i,
  /<\/?\s*(system|assistant|user|instructions?|untrusted)[^>]*>/i,
  /\b(run|execute)\b.{0,30}\b(command|shell|terminal|script|code)\b/i,
  /\b(api[_ -]?key|password|token|credentials?|secret)\b.{0,40}\b(send|share|reveal|give|print|output|email)\b/i,
  /\b(send|share|reveal|give|print|output|email)\b.{0,40}\b(api[_ -]?key|password|token|credentials?|secret)\b/i,
  /\b(issue|process|give|send)\b.{0,30}\b(full )?refunds?\b.{0,30}\b(all|every|everyone|immediately)\b/i,
];

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co|me|ly|xyz|shop|store|app|link|info|biz)\b/i;
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_PATTERN = /\+?\(?\d(?:[\s().-]{0,2}\d){8,}/;
const OFF_PLATFORM_PATTERN = /\b(paypal|venmo|cash\s?app|zelle|western union|bitcoin|crypto|usdt|whatsapp|telegram|signal app|wechat|wire transfer|gift ?cards?)\b/i;
const MONEY_PROMISE_PATTERN = /\b(refund|discount|coupon|promo code|free of charge|for free|money back|compensat|% ?off)\b/i;
// Zero-width and bidirectional control characters can hide text from a human reviewer.
const HIDDEN_CHARS = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]/;
const AI_DISCLOSURE = /\b(AI|artificial intelligence)\b.{0,60}\b(assist|generat|help|creat|made|design|tool)/i;

function flag(level: Flag["level"], code: string, message: string): Flag {
  return { level, code, message };
}

/** Findings about text that came from outside the facility (a buyer, a web page). */
export function scanUntrusted(text: string): Flag[] {
  const flags: Flag[] = [];
  if (INJECTION_PATTERNS.some((p) => p.test(text))) {
    flags.push(flag("warn", "possible-injection", "The incoming message contains wording aimed at an AI rather than a person. Treat it with suspicion."));
  }
  if (HIDDEN_CHARS.test(text)) {
    flags.push(flag("warn", "hidden-characters", "The incoming message contains invisible characters that can hide content."));
  }
  return flags;
}

/** Shared checks for anything an AI wrote that could reach a customer. */
function checkOutgoingText(text: string, field: string): Flag[] {
  const flags: Flag[] = [];
  if (HIDDEN_CHARS.test(text)) flags.push(flag("block", "hidden-characters", `The ${field} contains invisible characters.`));
  if (INJECTION_PATTERNS.some((p) => p.test(text))) {
    flags.push(flag("block", "instruction-text", `The ${field} contains wording aimed at an AI. It may have been manipulated.`));
  }
  if (URL_PATTERN.test(text)) flags.push(flag("block", "link", `The ${field} contains a web link or domain.`));
  if (EMAIL_PATTERN.test(text)) flags.push(flag("block", "email", `The ${field} contains an email address.`));
  if (PHONE_PATTERN.test(text)) flags.push(flag("block", "phone", `The ${field} contains what looks like a phone number.`));
  if (OFF_PLATFORM_PATTERN.test(text)) {
    flags.push(flag("block", "off-platform", `The ${field} mentions paying or talking outside Etsy, which Etsy forbids.`));
  }
  if (MONEY_PROMISE_PATTERN.test(text)) {
    flags.push(flag("warn", "money-promise", `The ${field} mentions a refund, discount or something free. Check you mean to offer it.`));
  }
  return flags;
}

export function checkListing(d: ListingDraft): Flag[] {
  const flags: Flag[] = [];
  if (!d.title.trim()) flags.push(flag("block", "title-missing", "The listing has no title."));
  if (d.title.length > ETSY_TITLE_MAX) flags.push(flag("block", "title-long", `The title is over Etsy's ${ETSY_TITLE_MAX} characters.`));
  if (d.description.length > DESCRIPTION_MAX) flags.push(flag("block", "description-long", "The description is unusually long."));
  if (d.tags.length > ETSY_TAGS_MAX) flags.push(flag("block", "tags-count", `Etsy allows at most ${ETSY_TAGS_MAX} tags.`));
  if (d.tags.some((t) => t.length > ETSY_TAG_LEN_MAX)) {
    flags.push(flag("block", "tag-long", `Each Etsy tag must be ${ETSY_TAG_LEN_MAX} characters or fewer.`));
  }
  if (!Number.isFinite(d.priceUsd) || d.priceUsd < 1 || d.priceUsd > 1000) {
    flags.push(flag("block", "price", "The price is missing or outside $1 to $1,000."));
  }
  if (!AI_DISCLOSURE.test(d.description)) {
    flags.push(flag("block", "ai-disclosure", "Etsy requires the description to say how AI was used."));
  }
  flags.push(...checkOutgoingText(d.title, "title"));
  flags.push(...checkOutgoingText(d.description, "description"));
  for (const tag of d.tags) flags.push(...checkOutgoingText(tag, "tags"));
  return dedupe(flags);
}

export function checkReply(d: ReplyDraft): Flag[] {
  const flags: Flag[] = [];
  if (!d.message.trim()) flags.push(flag("block", "reply-empty", "The reply is empty."));
  if (d.message.length > REPLY_MAX) flags.push(flag("block", "reply-long", "The reply is unusually long."));
  flags.push(...checkOutgoingText(d.message, "reply"));
  return dedupe(flags);
}

export function checkDraft(d: Draft): Flag[] {
  return d.kind === "listing" ? checkListing(d) : checkReply(d);
}

export function hasBlockingFlag(flags: Flag[]) {
  return flags.some((f) => f.level === "block");
}

/** Canonical form of a draft. Approval binds to this exact string. */
export function serializeDraft(d: Draft | undefined): string {
  if (!d) return "null";
  return d.kind === "listing"
    ? JSON.stringify({ kind: d.kind, title: d.title, description: d.description, tags: d.tags, priceUsd: d.priceUsd, design: d.design ?? null })
    : JSON.stringify({ kind: d.kind, message: d.message });
}

function dedupe(flags: Flag[]) {
  const seen = new Set<string>();
  return flags.filter((f) => {
    const key = `${f.level}:${f.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
