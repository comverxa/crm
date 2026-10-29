/**
 * COMVERXA outbound message boundary — development only, not connected to production.
 * Caller MUST supply authenticated session resolved server-side, tenant-scoped conversation,
 * and a trusted, configured transport. There is no default network transport.
 */
const FAIL = (message) => { throw new Error(message); };
export function createOmnichannelOutbound({ resolveConversation, resolveChannel, transport, enabled = false } = {}) {
  if (typeof resolveConversation !== "function" || typeof resolveChannel !== "function") FAIL("Tenant resolvers required");
  const requests = new Map();
  return {
    async sendText(session, { conversationId, text, requestId }) {
      if (!session || !session.tenantId || !session.userId ||
          !["master", "admin", "manager", "operator"].includes(session.role)) FAIL("Unauthorized");
      if (!enabled || typeof transport !== "function") FAIL("Outbound transport not configured");
      if (typeof conversationId !== "string" || !conversationId ||
          typeof requestId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) FAIL("Invalid request");
      if (typeof text !== "string" || !text.trim() || text.length > 4000) FAIL("Invalid message");
      const conversation = await resolveConversation(session.tenantId, conversationId);
      if (!conversation || conversation.tenantId !== session.tenantId) FAIL("Not found");
      if (session.role === "operator" && conversation.assignedTo !== null &&
          conversation.assignedTo !== session.userId) FAIL("Forbidden");
      const channel = await resolveChannel(session.tenantId, conversation.channelId);
      if (!channel || channel.tenantId !== session.tenantId ||
          !["evolution", "meta"].includes(channel.provider)) FAIL("Channel unavailable");
      // In-memory idempotency is only a development guard. For production use a durable
      // unique key (tenant_id, request_id), transactional outbox and retry reconciliation.
      const key = JSON.stringify([session.tenantId, requestId]);
      if (requests.has(key)) return { ...requests.get(key), duplicate: true };
      const payload = { tenantId: session.tenantId, channelId: channel.id,
        provider: channel.provider, phone: conversation.phone, text: text.trim(), requestId };
      // Hold the key before invoking transport to avoid duplicate concurrent sends.
      const pending = { status: "pending", requestId };
      requests.set(key, pending);
      try {
        const result = await transport(payload);
        const sent = { status: "accepted-by-transport", requestId, providerMessageId: String(result?.id ?? "").slice(0, 200) };
        requests.set(key, sent);
        return { ...sent, duplicate: false };
      } catch {
        // Unknown outcome must not trigger blind retransmission.
        const unknown = { status: "unknown-outcome", requestId };
        requests.set(key, unknown);
        return { ...unknown, duplicate: false };
      }
    },
  };
}
