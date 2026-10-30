import test from "node:test";
import assert from "node:assert/strict";
import { createEvolutionTextTransport } from "../backend/omnichannel-evolution-transport.mjs";

const config = (fetchImpl) => ({
  baseUrl: "https://evolution.example.test/",
  apiKey: "test-server-only-key",
  instanceForChannel: async (tenant, channel) => tenant === "tenant-a" && channel === "channel-1" ? "instance_a" : null,
  fetchImpl,
});
const message = { tenantId: "tenant-a", channelId: "channel-1", provider: "evolution", phone: "5531999999999", text: "Olá!" };

test("transport uses server-resolved instance and correct Evolution payload", async () => {
  let seen;
  const transport = createEvolutionTextTransport(config(async (url, options) => {
    seen = { url, options };
    return { ok: true, json: async () => ({ key: { id: "provider-id-1" } }) };
  }));
  assert.deepEqual(await transport(message), { id: "provider-id-1" });
  assert.equal(seen.url, "https://evolution.example.test/message/sendText/instance_a");
  assert.deepEqual(JSON.parse(seen.options.body), { number: "5531999999999", text: "Olá!" });
  assert.equal(seen.options.headers.apikey, "test-server-only-key");
  assert.equal(seen.options.redirect, "error");
});

test("does not send for foreign tenant or unsupported provider", async () => {
  let count = 0;
  const transport = createEvolutionTextTransport(config(async () => { count++; return { ok: true }; }));
  await assert.rejects(() => transport({ ...message, tenantId: "tenant-b" }), /not configured/);
  await assert.rejects(() => transport({ ...message, provider: "meta" }), /Invalid channel/);
  assert.equal(count, 0);
});

test("refuses non-HTTPS API endpoints and invalid recipients", async () => {
  assert.throws(() => createEvolutionTextTransport({ ...config(async () => ({})), baseUrl: "http://localhost:8080" }), /HTTPS/);
  const transport = createEvolutionTextTransport(config(async () => ({ ok: true })));
  await assert.rejects(() => transport({ ...message, phone: "not-a-number" }), /Invalid recipient/);
});

test("rejects HTTP failures and missing provider confirmation", async () => {
  const rejected = createEvolutionTextTransport(config(async () => ({ ok: false, status: 503 })));
  await assert.rejects(() => rejected(message), /Provider rejected/);
  const missing = createEvolutionTextTransport(config(async () => ({ ok: true, json: async () => ({}) })));
  await assert.rejects(() => missing(message), /confirmation missing/);
});
