import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createOmnichannel } from "../backend/omnichannel-core.mjs";
import { createWebhookVerifier, createWebhookHttpHandler } from "../backend/omnichannel-webhook.mjs";
const admin = { tenantId: "tenant-1", userId: "admin", role: "admin" };
function setup() {
  const inbox = createOmnichannel({ verifyWebhook: createWebhookVerifier({
    metaSecrets: { meta1: "test-only-meta-secret" },
    evolutionSecrets: { evo1: "test-only-evolution-secret" },
  }) });
  inbox.registerChannel(admin, { id: "meta1", slot: 1, provider: "meta", externalId: "100200" });
  inbox.registerChannel(admin, { id: "evo1", slot: 2, provider: "evolution", externalId: "instance-test" });
  return { inbox, handle: createWebhookHttpHandler({ inbox }) };
}
const url = (id) => "https://example.test/api/omnichannel/webhook/" + id;
const message = JSON.stringify({
  event: "messages.upsert",
  data: { key: { id: "test-message", remoteJid: "5511999999999@s.whatsapp.net", fromMe: false },
    message: { conversation: "Tenho interesse em um seguro" }, messageTimestamp: 1793210000 },
});
test("Evolution rejects absent/invalid secret and accepts configured secret", async () => {
  const { inbox, handle } = setup();
  for (const token of ["", "bad"]) {
    const response = await handle(new Request(url("evo1"), {
      method: "POST", body: message, headers: { "x-webhook-secret": token },
    }));
    assert.equal(response.status, 401);
  }
  const ok = await handle(new Request(url("evo1"), {
    method: "POST", body: message, headers: { "x-webhook-secret": "test-only-evolution-secret" },
  }));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).inserted, 1);
  assert.equal(inbox.listConversations(admin).length, 1);
});

test("Meta requires valid raw-body HMAC signature", async () => {
  const { inbox, handle } = setup();
  const raw = JSON.stringify({ entry: [{ changes: [{ value: {
    metadata: { phone_number_id: "100200" },
    messages: [{ id: "wamid-1", from: "5531999999999", timestamp: "1793210000",
      type: "text", text: { body: "Olá!" } }],
  } }] }] });
  const signature = "sha256=" + createHmac("sha256", "test-only-meta-secret").update(raw).digest("hex");
  const invalid = await handle(new Request(url("meta1"), { method: "POST", body: raw,
    headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) } }));
  assert.equal(invalid.status, 401);
  const response = await handle(new Request(url("meta1"), { method: "POST", body: raw,
    headers: { "x-hub-signature-256": signature } }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).inserted, 1);
  assert.equal(inbox.listConversations(admin).length, 1);
});

test("HTTP handler denies unknown channel and invalid requests", async () => {
  const { handle } = setup();
  assert.equal((await handle(new Request(url("not-configured"), { method: "POST", body: message }))).status, 401);
  assert.equal((await handle(new Request(url("evo1"), { method: "GET" }))).status, 405);
  assert.equal((await handle(new Request(url("evo1"), {
    method: "POST", body: "not-json", headers: { "x-webhook-secret": "test-only-evolution-secret" },
  }))).status, 400);
});

test("large HTTP payload is rejected before event persistence", async () => {
  const { inbox } = setup();
  const handler = createWebhookHttpHandler({ inbox, maxBodyBytes: 40 });
  const response = await handler(new Request(url("evo1"), {
    method: "POST", body: message, headers: { "x-webhook-secret": "test-only-evolution-secret" },
  }));
  assert.equal(response.status, 413);
  assert.deepEqual(inbox.listConversations(admin), []);
});
