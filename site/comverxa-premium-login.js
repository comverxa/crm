const form = document.getElementById("form");
const status = document.getElementById("info");
const submitButton = form.querySelector('button[type="submit"]');
const passwordInput = form.querySelector('input[name="password"]');
// After a successful reset, prevent the old iPhone autofill from being silently submitted.
if (new URLSearchParams(location.search).get("senha_atualizada") === "1") {
  passwordInput.value = "";
  passwordInput.autocomplete = "off";
  status.textContent = "Senha redefinida com sucesso. Digite manualmente a nova senha do Comercial (mínimo de 12 caracteres), sem usar a senha antiga salva no celular.";
  history.replaceState(null, "", "/login");
}
let pending = false;
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (pending) return;
  const suppliedPassword = new FormData(form).get("password");
  if (typeof suppliedPassword !== "string" || suppliedPassword.length < 12) {
    status.textContent = "A senha deste módulo precisa ter pelo menos 12 caracteres. Apague a senha curta preenchida automaticamente e digite a senha Comercial atual ou redefina em 'Esqueci minha senha'.";
    passwordInput.value = "";
    passwordInput.focus();
    return;
  }
  pending = true;
  submitButton.disabled = true;
  status.textContent = "Verificando acesso...";
  const fields = new FormData(form);
  // Never trim or transform passwords: whitespace can be intentional.
  const email = String(fields.get("email") ?? "").trim().toLowerCase();
  const password = fields.get("password");
  let redirecting = false;
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({email, password})
    });
    if (response.ok) {
      status.textContent = "Acesso validado. Abrindo painel...";
      redirecting = true;
      location.assign("/app");
      return;
    }
    if (response.status === 401) {
      status.textContent = "E-mail ou senha não conferem. Digite manualmente a senha Comercial mais recente, com pelo menos 12 caracteres. Não reutilize o preenchimento automático antigo do celular.";
      passwordInput.value = "";
      passwordInput.focus();
    } else if (response.status === 429) {
      status.textContent = "Muitas tentativas de acesso. Aguarde 15 minutos antes de tentar novamente ou use 'Esqueci minha senha'.";
    } else if (response.status === 403) {
      status.textContent = "O acesso desta empresa está suspenso. Fale com o administrador da plataforma.";
    } else {
      status.textContent = "Não foi possível verificar o acesso agora. Tente novamente em instantes.";
    }
  } catch {
    status.textContent = "Falha de conexão. Confira sua internet e tente novamente.";
  } finally {
    pending = false;
    if (!redirecting) submitButton.disabled = false;
  }
});
