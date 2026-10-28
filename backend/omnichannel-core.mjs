/**
 * COMVERXA Omnichannel Core (prototype; not wired to production).
 * External HTTP boundary MUST authenticate webhooks and resolve channels server-side.
 * No real send, file download, or access to production database happens here.
 */
export const MAX_WHATSAPP_LINES = 3;
const ROLES = new Set(["master", "admin", "manager", "operator"]);
const ADMIN_ROLES = new Set(["master", "admin", "manager"]);
const MEDIA_TYPES = ["image", "audio", "document", "video"];

const fail = (message) => { throw new Error(message); };
const nonEmpty = (value, name) => {
  if (typeof value !== "string" || !value.trim()) fail("Invalid " + name);
  return value.trim();
};
const sanitizeText = (value, max = 4000) => String(value ?? "").slice(0, max);
const safePhone = (value) => {
  const raw = String(value ?? "");
  if (raw.includes("@g.us") || raw.includes("@broadcast") || raw.includes("@newsletter")) return null;
  const number = raw.split("@")[0].replace(/\D/g, "");
  return /^\d{10,15}$/.test(number) ? number : null;
};
function actorFrom(session) {
  if (!session || !ROLES.has(session.role)) fail("Unauthorized");
  return { tenantId: nonEmpty(session.tenantId, "tenant"), userId: nonEmpty(session.userId, "user"), role: session.role };
}
const admin = (actor) => { if (!ADMIN_ROLES.has(actor.role)) fail("Forbidden"); };
const asTimestamp = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0
    ? new Date(numeric < 1e12 ? numeric * 1000 : numeric).toISOString()
    : new Date(0).toISOString();
};
function fromEvolution(payload) {
  const raw = payload?.data;
  const list = Array.isArray(raw) ? raw : [raw ?? payload];
  const output = [];
  for (const item of list) {
    const key = item?.key;
    const id = key?.id;
    const phone = safePhone(key?.remoteJid);
    const message = item?.message;
    if (!id || !phone || !message) continue;
    const type = MEDIA_TYPES.find((t) => message[t + "Message"]);
    const media = type ? message[type + "Message"] : null;
    const text = message.conversation ?? message.extendedTextMessage?.text ??
      media?.caption ?? "";
    output.push({
      providerId: sanitizeText(id, 200), phone,
      direction: key.fromMe ? "out" : "in", kind: type ?? "text",
      text: sanitizeText(text),
      attachment: media ? {
        mimeType: sanitizeText(media.mimetype, 150),
        fileName: sanitizeText(media.fileName, 180),
        // Do not persist signed media URLs or raw binary in the message record.
      } : null,
      at: asTimestamp(item.messageTimestamp),
    });
  }
  return output;
}
function fromMeta(payload, configuredPhoneNumberId) {
  const output = [];
  for (const entry of payload?.entry ?? []) for (const change of entry?.changes ?? []) {
    const value = change?.value;
    if (String(value?.metadata?.phone_number_id ?? "") !== configuredPhoneNumberId) continue;
    for (const item of value?.messages ?? []) {
      const phone = safePhone(item.from);
      if (!phone || !item.id) continue;
      const kind = MEDIA_TYPES.includes(item.type) ? item.type : "text";
      const media = kind !== "text" ? item[kind] : null;
      output.push({
        providerId: sanitizeText(item.id, 200), phone,
        direction: "in", kind,
        text: sanitizeText(item.text?.body ?? media?.caption ?? ""),
        attachment: media ? {
          mimeType: sanitizeText(media.mime_type, 150),
          fileName: sanitizeText(media.filename, 180),
        } : null,
        at: asTimestamp(item.timestamp),
      });
    }
  }
  return output;
}
const copy = (value) => structuredClone(value);

/**
 * Reference store intentionally in-memory. Replace with durable, transactional
 * tenant-scoped repository before deployment. All writes remain synchronous
 * to prevent duplicate events from racing in this reference implementation.
 */
export class MemoryInboxStore {
  constructor() {
    this.channels = new Map();
    this.conversations = new Map();
    this.messages = new Map();
    this.messageKeys = new Set();
  }
  addChannel(channel) {
    if (this.channels.has(channel.id)) fail("Channel already exists");
    for (const value of this.channels.values()) {
      if (value.tenantId === channel.tenantId && value.slot === channel.slot) fail("Slot already in use");
      if (value.tenantId === channel.tenantId && value.provider === channel.provider &&
        value.externalId === channel.externalId) fail("Provider account already in use");
    }
    this.channels.set(channel.id, copy(channel));
  }
  findChannel(id) { return this.channels.get(id); }
  channelsFor(tenantId) { return [...this.channels.values()].filter((v) => v.tenantId === tenantId); }
  addMessage(channel, msg) {
    const key = JSON.stringify([channel.tenantId, channel.id, msg.providerId]);
    if (this.messageKeys.has(key)) return false;
    const conversationId = JSON.stringify([channel.tenantId, channel.id, msg.phone]);
    if (!this.conversations.has(conversationId)) {
      this.conversations.set(conversationId, {
        id: conversationId, tenantId: channel.tenantId, channelId: channel.id,
        slot: channel.slot, phone: msg.phone, assignedTo: null, labels: [], lastAt: msg.at,
      });
      this.messages.set(conversationId, []);
    }
    this.messages.get(conversationId).push({ ...copy(msg), conversationId });
    this.conversations.get(conversationId).lastAt = msg.at;
    this.messageKeys.add(key);
    return true;
  }
  conversation(tenantId, id) {
    const c = this.conversations.get(id);
    return c?.tenantId === tenantId ? c : null;
  }
  forTenant(tenantId) {
    return [...this.conversations.values()].filter((c) => c.tenantId === tenantId);
  }
  history(tenantId, id) {
    if (!this.conversation(tenantId, id)) return null;
    return this.messages.get(id) ?? [];
  }
}

/**
 * receiveWebhook requires explicit verifier injected by server, NEVER a
 * client-supplied 'verified' boolean. For Meta validate X-Hub-Signature-256
 * against the raw HTTP body; for Evolution validate an authenticated secret
 * using constant-time comparison at the HTTP adapter boundary.
 */
export function createOmnichannel({ store = new MemoryInboxStore(), verifyWebhook, userBelongsToTenant } = {}) {
  if (typeof verifyWebhook !== "function") fail("Webhook verifier is required");
  const getScoped = (actor, conversationId) => {
    const c = store.conversation(actor.tenantId, conversationId);
    if (!c) fail("Not found");
    if (actor.role === "operator" && c.assignedTo !== null && c.assignedTo !== actor.userId) fail("Forbidden");
    return c;
  };
  return {
    registerChannel(session, { id, slot, provider, externalId }) {
      const actor = actorFrom(session); admin(actor);
      const channelId = nonEmpty(id, "channel ID");
      const external = nonEmpty(externalId, "provider identifier");
      if (!Number.isInteger(slot) || slot < 1 || slot > MAX_WHATSAPP_LINES) fail("Line must be 1, 2 or 3");
      if (!["meta", "evolution"].includes(provider)) fail("Unsupported provider");
      if (store.channelsFor(actor.tenantId).length >= MAX_WHATSAPP_LINES) fail("Line limit reached");
      const channel = { id: channelId, tenantId: actor.tenantId, slot, provider, externalId: external };
      store.addChannel(channel);
      return copy(channel);
    },
    listChannels(session) {
      const actor = actorFrom(session);
      return copy(store.channelsFor(actor.tenantId));
    },
    async receiveWebhook({ channelId, credential, rawBody, payload }) {
      const channel = store.findChannel(nonEmpty(channelId, "channel ID"));
      if (!channel) fail("Unknown channel");
      // Verifier must validate raw bytes/signature or secret, not a JSON field.
      if (!(await verifyWebhook({ channel: copy(channel), credential, rawBody }))) fail("Invalid webhook authentication");
      const messages = channel.provider === "meta"
        ? fromMeta(payload, channel.externalId) : fromEvolution(payload);
      let inserted = 0, duplicates = 0;
      for (const message of messages) {
        if (store.addMessage(channel, message)) inserted++; else duplicates++;
      }
      return { inserted, duplicates, ignored: messages.length === 0 };
    },
    listConversations(session) {
      const actor = actorFrom(session);
      return copy(store.forTenant(actor.tenantId)
        .filter((c) => actor.role !== "operator" || c.assignedTo === null || c.assignedTo === actor.userId)
        .sort((a, b) => b.lastAt.localeCompare(a.lastAt)));
    },
    history(session, conversationId) {
      const actor = actorFrom(session);
      getScoped(actor, conversationId);
      return copy(store.history(actor.tenantId, conversationId));
    },
    async assign(session, conversationId, userId) {
      const actor = actorFrom(session); admin(actor);
      const c = getScoped(actor, conversationId);
      if (userId !== null) {
        const target = nonEmpty(userId, "assignee");
        if (typeof userBelongsToTenant !== "function" || !(await userBelongsToTenant(actor.tenantId, target)))
          fail("Assignee is not a verified tenant member");
      }
      c.assignedTo = userId;
      return copy(c);
    },
    setLabels(session, conversationId, labels) {
      const actor = actorFrom(session);
      const c = getScoped(actor, conversationId);
      if (!Array.isArray(labels) || labels.length > 12 ||
        labels.some((v) => typeof v !== "string" || !v.trim() || v.length > 40)) fail("Invalid labels");
      c.labels = [...new Set(labels.map((v) => v.trim()))];
      return copy(c);
    },
  };
}
