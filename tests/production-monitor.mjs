/**
 * COMVERXA — monitor público de produção, não destrutivo.
 * Não acessa contas nem envia mensagens; testa saúde e bloqueios anônimos.
 * Passe: node tests/production-monitor.mjs
 */
const crm = "https://app.comverxa.com.br";
const prospect = "https://comverxa-prospect-ia-production.up.railway.app";
const marketing = "https://comverxa.github.io/crm";
const checks = [
  ["CRM: healthz", crm + "/healthz", [200], "health"],
  ["CRM: login público", crm + "/", [200], "comverxa"],
  ["CRM: ADM Master", crm + "/admin", [200,302,303]],
  ["CRM: sessão exige login", crm + "/api/me", [401,403]],
  ["CRM: licença exige login", crm + "/api/cvx-license", [401,403]],
  ["CRM: painel titular restrito", crm + "/api/master/me", [401,403]],
  ["CRM: licenças vitalícias restritas", crm + "/api/master/lifetime/overview", [401,403]],
  ["CRM: financeiro restrito", crm + "/api/master/finance/overview", [401,403]],
  ["CRM: leads restritos", crm + "/api/leads", [401,403]],
  ["CRM: diagnóstico somente autenticado", crm + "/operacao", [301,302,303,401,403]],
  ["CRM: API de diagnóstico restrita", crm + "/api/cvx/operacao", [401,403]],
  ["Prospect: healthz", prospect + "/healthz", [200], "healthy"],
  ["Prospect: login", prospect + "/login", [200]],
  ["Prospect: formulário", prospect + "/captar", [200]],
  ["Prospect: painel restrito", prospect + "/prospect-ia", [401,403]],
  ["Prospect: contatos restritos", prospect + "/api/master/prospect/leads", [401,403]],
  ["Prospect: exportação restrita", prospect + "/api/master/prospect/export.csv", [401,403]],
  ["Site comercial", marketing + "/", [200], "comverxa"],
  ["Privacidade / LGPD", marketing + "/privacidade.html", [200]],
  ["Termos comerciais", marketing + "/termos.html", [200]],
];
let failures = 0;
for (const [name, url, allowed, bodyCheck] of checks) {
  try {
    const start = Date.now();
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: {
        "User-Agent": "COMVERXA-Production-Monitor/1.0",
        "Accept": "text/html,application/json"
      },
      signal: AbortSignal.timeout(18000)
    });
    let passed = allowed.includes(response.status);
    if (passed && bodyCheck === "health") {
      const payload = await response.json().catch(() => null);
      passed = payload?.status === "ok";
    }
    if (passed && bodyCheck === "healthy") {
      passed = (await response.text()).trim() === "healthy";
    }
    if (passed && bodyCheck === "comverxa") {
      const html = await response.text();
      passed = /comverxa/i.test(html);
    }
    console.log(`${passed ? "PASS" : "FAIL"} | ${name} | HTTP ${response.status} | ${Date.now() - start}ms`);
    if (!passed) failures++;
  } catch (error) {
    console.log(`FAIL | ${name} | ${error.name || "request_error"}`);
    failures++;
  }
}
console.log(`SUMMARY | ${checks.length - failures}/${checks.length} public checks passed | failures=${failures}`);
console.log("LIMITS | Sem login real, teste entre empresas, backup/restauração, envio WhatsApp ou pagamentos.");
if (failures) process.exitCode = 1;
