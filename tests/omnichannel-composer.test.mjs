import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const code = readFileSync(new URL("../site/omnichannel-composer.mjs", import.meta.url), "utf8");
test("composer defaults to disabled, sends through same-origin endpoint and passes CSRF", () => {
  assert.match(code, /enabled = false/);
  assert.match(code, /credentials: "same-origin"/);
  assert.match(code, /"x-csrf-token": csrfToken/);
  assert.match(code, /button.disabled = !enabled/);
  assert.match(code, /requestId: pending.requestId/);
});
test("does not claim delivery confirmed and warns on uncertain outcome", () => {
  assert.match(code, /entrega ainda não confirmada/);
  assert.match(code, /Consulte o histórico antes de reenviar/);
});
test("input is text-only and does not inject HTML from server", () => {
  assert.doesNotMatch(code, /innerHTML|insertAdjacentHTML/);
  assert.match(code, /textarea.maxLength = 4000/);
});
