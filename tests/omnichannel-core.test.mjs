import test from "node:test";
import assert from "node:assert/strict";
import { createOmnichannel, MAX_WHATSAPP_LINES } from "../backend/omnichannel-core.mjs";

const managerA = { tenantId: "empresa-a", userId: "gestor-a", role: "manager" };
const operatorA = { tenantId: "empresa-a", userId: "operador-a", role: "operator" };
const operatorOther = { tenantId: "empresa-a", userId: "outro-operador", role: "operator" };
const managerB = { tenantId: "empresa-b", userId: "gestor-b", role: "manager" };
const make = () => createOmnichannel({
  verifyWebhook: async ({ channel, credential, rawBody }) =>
    credential === "authorized-test-" + channel.id && typeof rawBody === "string",
  userBelongsToTenant: async (tenant, userId) => tenant === "empresa-a" && userId === "operador-a",
});
const evo = (id, jid = "5511999999999@s.whatsapp.net", message = { conversation: "Olá!" }, fromMe = false) => ({
  event: "messages.upsert",
  data: { key: { id, remoteJid: jid, fromMe }, message, messageTimestamp: 1793210000 },
});
const ingest = (api, channelId, payload, credential = "authorized-test-" + channelId) =>
  api.receiveWebhook({ channelId, credential, rawBody: JSON.stringify(payload), payload });

test("rejects unverified requests before persisting messages", async () => {
  const api = make();
  api.registerChannel(managerA, { id: "wa1", slot: 1, provider: "evolution", externalId: "company-line-1" });
  await assert.rejects(() => ingest(api, "wa1", evo("msg-1"), "invalid"), /Invalid webhook authentication/);
  assert.equal(api.listConversations(managerA).length, 0);
});

test("enforces 3 WhatsApp slots per company and role permissions", () => {
  const api = make();
  assert.equal(MAX_WHATSAPP_LINES, 3);
  for (let slot = 1; slot <= 3; slot++) {
    api.registerChannel(managerA, { id: "wa" + slot, slot, provider: "evolution", externalId: "external-" + slot });
  }
  assert.throws(() => api.registerChannel(managerA,
    { id: "wa4", slot: 4, provider: "evolution", externalId: "external-4" }), /Line must be/);
  assert.throws(() => api.registerChannel(managerA,
    { id: "wa5", slot: 2, provider: "evolution", externalId: "external-5" }), /Line limit reached/);
  assert.throws(() => api.registerChannel(operatorA,
    { id: "wa6", slot: 1, provider: "evolution", externalId: "unauthorized" }), /Forbidden/);
  assert.deepEqual(api.listChannels(managerB), []);
});

test("deduplicates Evolution events and associates messages to line and lead contact", async () => {
  const api = make();
  api.registerChannel(managerA, { id: "wa1", slot: 1, provider: "evolution", externalId: "number-a" });
  assert.deepEqual(await ingest(api, "wa1", evo("msg1")), { inserted: 1, duplicates: 0, ignored: false });
  assert.deepEqual(await ingest(api, "wa1", evo("msg1")), { inserted: 0, duplicates: 1, ignored: false });
  await ingest(api, "wa1", evo("msg2", undefined, { extendedTextMessage: { text: "Tudo bem?" } }, true));
  const conversations = api.listConversations(managerA);
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].slot, 1);
  assert.equal(conversations[0].phone, "5511999999999");
  const history = api.history(managerA, conversations[0].id);
  assert.equal(history.length, 2);
  assert.equal(history[0].text, "Olá!");
  assert.equal(history[1].direction, "out");
  assert.equal(history[1].text, "Tudo bem?");
});

test("blocks cross-tenant access and assignment to an external user", async () => {
  const api = make();
  api.registerChannel(managerA, { id: "wa1", slot: 1, provider: "evolution", externalId: "number-a" });
  await ingest(api, "wa1", evo("msg1"));
  const id = api.listConversations(managerA)[0].id;
  assert.deepEqual(api.listConversations(managerB), []);
  assert.throws(() => api.history(managerB, id), /Not found/);
  await assert.rejects(() => api.assign(managerB, id, "gestor-b"), /Not found/);
  await assert.rejects(() => api.assign(managerA, id, "user-from-other-tenant"), /verified tenant member/);
  await api.assign(managerA, id, "operador-a");
  assert.equal(api.history(operatorA, id).length, 1);
  assert.throws(() => api.history(operatorOther, id), /Forbidden/);
  assert.equal(api.listConversations(operatorOther).length, 0);
  await api.assign(managerA, id, null);
  assert.equal(api.listConversations(operatorOther).length, 1);
});

test("accepts image, audio and document metadata without downloading media", async () => {
  const api = make();
  api.registerChannel(managerA, { id: "wa1", slot: 1, provider: "evolution", externalId: "number-a" });
  const items = [
    evo("image-1", undefined, { imageMessage: { mimetype: "image/jpeg", caption: "Cotação" } }),
    evo("audio-1", undefined, { audioMessage: { mimetype: "audio/ogg" } }),
    evo("document-1", undefined, { documentMessage: { mimetype: "application/pdf", fileName: "proposta.pdf" } }),
  ];
  for (const item of items) await ingest(api, "wa1", item);
  const id = api.listConversations(managerA)[0].id;
  const msgs = api.history(managerA, id);
  assert.deepEqual(msgs.map((m) => m.kind), ["image", "audio", "document"]);
  assert.equal(msgs[0].text, "Cotação");
  assert.equal(msgs[2].attachment.fileName, "proposta.pdf");
  assert.equal(Object.hasOwn(msgs[2].attachment, "url"), false);
});

test("ignores groups and non-message events", async () => {
  const api = make();
  api.registerChannel(managerA, { id: "wa1", slot: 1, provider: "evolution", externalId: "number-a" });
  assert.equal((await ingest(api, "wa1", evo("group", "120363123456@g.us"))).ignored, true);
  assert.equal((await ingest(api, "wa1", { event: "connection.update", data: { state: "open" } })).ignored, true);
  assert.equal(api.listConversations(managerA).length, 0);
});

test("processes Meta Cloud API events only for the configured number", async () => {
  const api = make();
  api.registerChannel(managerA, { id: "meta1", slot: 1, provider: "meta", externalId: "phone-id-001" });
  const payload = (phoneId) => ({ entry: [{ changes: [{ value: {
    metadata: { phone_number_id: phoneId },
    messages: [{ id: "wamid.test", from: "5531999999999", timestamp: "1793210000",
      type: "text", text: { body: "Preciso de seguro" } }],
  } }] }] });
  assert.equal((await ingest(api, "meta1", payload("wrong-id"))).inserted, 0);
  assert.equal((await ingest(api, "meta1", payload("phone-id-001"))).inserted, 1);
  assert.equal(api.listConversations(managerA).length, 1);
  assert.equal(api.history(managerA, api.listConversations(managerA)[0].id)[0].text, "Preciso de seguro");
});

test("labels stay inside the tenant and are safe snapshots", async () => {
  const api = make();
  api.registerChannel(managerA, { id: "wa1", slot: 1, provider: "evolution", externalId: "number-a" });
  await ingest(api, "wa1", evo("msg1"));
  const id = api.listConversations(managerA)[0].id;
  const updated = api.setLabels(operatorA, id, ["Quente", "Proposta", "Quente"]);
  assert.deepEqual(updated.labels, ["Quente", "Proposta"]);
  updated.labels.push("foreign-state");
  assert.deepEqual(api.listConversations(managerA)[0].labels, ["Quente", "Proposta"]);
  assert.throws(() => api.setLabels(managerB, id, ["Acesso indevido"]), /Not found/);
});
