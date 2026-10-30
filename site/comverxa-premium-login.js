const form = document.getElementById("form");
const status = document.getElementById("info");
const submitButton = form.querySelector('button[type="submit"]');
let pending = false;
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (pending) return;
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
      status.textContent = "E-mail ou senha não conferem. Após redefinir a senha, digite a nova senha manualmente, sem preenchimento automático. O acesso Comercial é separado do CRM principal.";
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
