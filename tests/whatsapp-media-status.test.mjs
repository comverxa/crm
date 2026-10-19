import test from "node:test";
import assert from "node:assert/strict";
import {normalizeDelivery,reconcileDelivery} from "../backend/whatsapp-media-status.mjs";
test("diferencia estado enviado e entregue",()=>{ assert.equal(normalizeDelivery(2),"sent");assert.equal(normalizeDelivery(3),"delivered"); });
test("estado de leitura não retrocede",()=>{assert.equal(reconcileDelivery("read","sent"),"read");});

// Regressao: Evolution pode mandar ACK em texto (ex.: "3") ou fora de ordem.
test("normaliza ACK numerico serializado como string",()=>{
  assert.equal(normalizeDelivery("2"),"sent");
  assert.equal(normalizeDelivery("3"),"delivered");
  assert.equal(normalizeDelivery("4"),"read");
  assert.equal(normalizeDelivery("5"),"played");
  assert.equal(normalizeDelivery("DELIVERY_ACK"),"delivered");
  assert.equal(normalizeDelivery("  read "),"read");
  assert.equal(normalizeDelivery("unknown"),null);
});
test("eventos atrasados nao retrocedem estados confirmados",()=>{
  assert.equal(reconcileDelivery("played","delivered"),"played");
  assert.equal(reconcileDelivery("delivered","pending"),"delivered");
  assert.equal(reconcileDelivery("sent","failed"),"sent");
});
test("erro conhecido resiste a pendente atrasado, mas aceita confirmacao real",()=>{
  assert.equal(reconcileDelivery("pending","failed"),"failed");
  assert.equal(reconcileDelivery("failed","pending"),"failed");
  assert.equal(reconcileDelivery("failed","delivered"),"delivered");
});
