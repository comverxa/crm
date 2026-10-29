/**
 * COMVERXA Omnichannel — browser text composer (not bundled into production).
 * Host CRM must mount this onto its authenticated conversation view and supply
 * a session-bound CSRF token and real conversation ID. No secrets exposed.
 */
export function mountOmnichannelComposer({ root, conversationId, csrfToken, enabled = false,
  endpoint = "/api/omnichannel/messages/send", fetchImpl = globalThis.fetch,
  requestIdFactory = () => globalThis.crypto.randomUUID() } = {}) {
  if (!root || typeof root.append !== "function") throw Error("Root element required");
  if (typeof conversationId !== "string" || !conversationId) throw Error("Conversation required");
  if (typeof fetchImpl !== "function" || typeof requestIdFactory !== "function") throw Error("Dependencies required");
  if (!endpoint.startsWith("/") || endpoint.startsWith("//")) throw Error("Same-origin endpoint required");
  const form = document.createElement("form");
  const textarea = document.createElement("textarea");
  const button = document.createElement("button");
  const status = document.createElement("span");
  textarea.name = "message"; textarea.maxLength = 4000; textarea.rows = 2;
  textarea.placeholder = "Digite sua mensagem";
  textarea.setAttribute("aria-label", "Mensagem para o cliente");
  button.type = "submit"; button.textContent = "Enviar"; button.disabled = !enabled;
  status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  if (!enabled) status.textContent = "Envio indisponível até homologação.";
  form.append(textarea, button, status); root.append(form);
  let pending = null;
  const submit = async (event) => {
    event.preventDefault();
    if (!enabled || button.disabled) return;
    const text = textarea.value.trim();
    if (!text) { status.textContent = "Digite uma mensagem."; return; }
    if (!pending || pending.text !== text) {
      pending = { text, requestId: requestIdFactory() };
    }
    button.disabled = true;
    status.textContent = "Enviando…";
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
        body: JSON.stringify({ conversationId, text, requestId: pending.requestId }),
      });
      const result = await response.json();
      if (!response.ok) {
        status.textContent = "Não foi possível confirmar o envio. Verifique o histórico antes de tentar novamente.";
      } else if (result.status === "accepted-by-transport") {
        textarea.value = ""; pending = null;
        status.textContent = "Mensagem aceita pelo provedor; entrega ainda não confirmada.";
      } else {
        status.textContent = "Resultado do envio indefinido. Consulte o histórico antes de reenviar.";
      }
    } catch {
      status.textContent = "Conexão interrompida. Consulte o histórico antes de reenviar.";
    } finally { button.disabled = !enabled; }
  };
  form.addEventListener("submit", submit);
  return { destroy() { form.removeEventListener("submit", submit); form.remove(); } };
}
