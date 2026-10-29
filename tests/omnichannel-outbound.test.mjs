import test from "node:test";
import assert from "node:assert/strict";
import { createOmnichannelOutbound } from "../backend/omnichannel-outbound.mjs";

const manager = { tenantId: "a", userId: "manager-a", role: "manager" };
const operator = { tenantId: "a", userId: "operator-a", role: "operator" };
const outsider = { tenantId: "b", userId: "manager-b", role: "manager" };
const conversation = { tenantId: "a", channelId: "wa-a", phone: "5531999999999", assignedTo: "operator-a" };
function setup({ enabled = true, transport = async () => ({ id: "provider-msg-1" }) } = {}) {
  const calls = [];
  const outbound = createOmnichannelOutbound({
    enabled,
    resolveConversation: async (tenant, id) => tenant === "a" && id === "c1" ? conversation : null,
    resolveChannel: async (tenant, id) => tenant === "a" && id === "wa-a"
      ? { id: "wa-a", tenantId: "a", provider: "evolution" } : null,
    transport: async (payload) => { calls.push(payload); return transport(payload); },
  });
  return { outbound, calls };
}
const message = { conversationId: "c1", text: "Olá, sobre sua proposta", requestId: "request-0001" };

test("outbound is off unless explicitly enabled", async () => {
  const { outbound, calls } = setup({ enabled: false });
  await assert.rejects(() => outbound.sendText(manager, message), /not configured/);
  assert.equal(calls.length, 0);
});

test("sends only via tenant-scoped line with explicit trusted transport", async () => {
  const { outbound, calls } = setup();
  const outcome = await outbound.sendText(operator, message);
  assert.equal(outcome.status, "accepted-by-transport");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tenantId, "a");
  assert.equal(calls[0].channelId, "wa-a");
  assert.equal(calls[0].phone, "5531999999999");
});

test("blocks other company and unauthorized operator", async () => {
  const { outbound, calls } = setup();
  await assert.rejects(() => outbound.sendText(outsider, message), /Not found/);
  await assert.rejects(() => outbound.sendText({ ...operator, userId: "another-operator" }, message), /Forbidden/);
  assert.equal(calls.length, 0);
});

test("same request id cannot send twice within the instance", async () => {
  const { outbound, calls } = setup();
  await outbound.sendText(manager, message);
  const replay = await outbound.sendText(manager, message);
  assert.equal(replay.duplicate, true);
  assert.equal(calls.length, 1);
});

test("uncertain provider outcome never automatically resends", async () => {
  const { outbound, calls } = setup({ transport: async () => { throw new Error("network timeout"); } });
  const result = await outbound.sendText(manager, message);
  assert.equal(result.status, "unknown-outcome");
  assert.equal((await outbound.sendText(manager, message)).duplicate, true);
  assert.equal(calls.length, 1);
});

test("invalid and empty text are refused", async () => {
  const { outbound, calls } = setup();
  await assert.rejects(() => outbound.sendText(manager, { ...message, text: " " }), /Invalid message/);
  await assert.rejects(() => outbound.sendText(manager, { ...message, requestId: "1" }), /Invalid request/);
  assert.equal(calls.length, 0);
});
