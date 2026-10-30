import test from "node:test";
import assert from "node:assert/strict";
import { createOmnichannelSendHandler } from "../backend/omnichannel-send-http.mjs";

const url = "https://crm.example.test/api/omnichannel/messages/send";
const data = { conversationId: "conversation-1", text: "Olá", requestId: "request-12345" };
function setup({ enabled = true, authenticated = true, csrf = true } = {}) {
  const calls = [];
  const handler = createOmnichannelSendHandler({
    enabled,
    getSession: async () => authenticated ? { tenantId: "tenant-a", userId: "user-a", role: "operator" } : null,
    verifyCsrf: async () => csrf,
    outbound: { sendText: async (session, body) => {
      calls.push({ session, body });
      return { status: "accepted-by-transport", requestId: body.requestId, duplicate: false };
    } },
  });
  const send = (body = data, extra = {}) => handler(new Request(url, {
    method: "POST", headers: { "content-type": "application/json", ...extra }, body: JSON.stringify(body),
  }));
  return { handler, send, calls };
}
test("disabled sending fails closed and never invokes transport", async () => {
  const { send, calls } = setup({ enabled: false });
  assert.equal((await send()).status, 503);
  assert.equal(calls.length, 0);
});
test("requires server-authenticated session and valid CSRF", async () => {
  const missing = setup({ authenticated: false });
  assert.equal((await missing.send()).status, 401);
  const badCsrf = setup({ csrf: false });
  assert.equal((await badCsrf.send()).status, 403);
  assert.equal(missing.calls.length + badCsrf.calls.length, 0);
});
test("passes only message fields with trusted session to outbound service", async () => {
  const { send, calls } = setup();
  const res = await send({ ...data, tenantId: "forged-tenant", role: "master" });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].session.tenantId, "tenant-a");
  assert.deepEqual(calls[0].body, data);
});
test("rejects invalid content type and oversized body", async () => {
  const { handler, send, calls } = setup();
  assert.equal((await handler(new Request(url, { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" }))).status, 415);
  assert.equal((await send(data, { "content-length": "20000" })).status, 413);
  assert.equal(calls.length, 0);
});
test("does not expose route on unknown path and disallows GET", async () => {
  const { handler } = setup();
  assert.equal((await handler(new Request("https://crm.example.test/other", { method: "POST" }))).status, 404);
  assert.equal((await handler(new Request(url, { method: "GET" }))).status, 405);
});
