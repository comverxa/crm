import test from "node:test";
import assert from "node:assert/strict";
import {normalizeDelivery,reconcileDelivery} from "../backend/whatsapp-media-status.mjs";
test("diferencia estado enviado e entregue",()=>{ assert.equal(normalizeDelivery(2),"sent");assert.equal(normalizeDelivery(3),"delivered"); });
test("estado de leitura não retrocede",()=>{assert.equal(reconcileDelivery("read","sent"),"read");});
