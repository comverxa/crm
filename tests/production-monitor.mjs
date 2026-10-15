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
  ["CRM: layout notebook corrigido", crm + "/", [200], "desktop-css"],
  ["CRM: canal QR Evolution na caixa de entrada", crm + "/", [200], "inbox-channel"],
  ["CRM: ADM Master", crm + "/admin", [200,302,303]],
  ["CRM: sessão exige login", crm + "/api/me", [401,403]],
  ["CRM: licença exige login", crm + "/api/cvx-license", [401,403]],
  ["CRM: painel titular restrito", crm + "/api/master/me", [401,403]],
  ["CRM: licenças vitalícias restritas", crm + "/api/master/lifetime/overview", [401,403]],
  ["CRM: financeiro restrito", crm + "/api/master/finance/overview", [401,403]],
  ["CRM: leads restritos", crm + "/api/leads", [401,403]],
  ["Prospect: healthz", prospect + "/healthz", [200], "healthy"],
  ["Prospect: login", prospect + "/login", [200]],
  ["Prospect: formulário", prospect + "/captar", [200]],
  ["Prospect: painel restrito", prospect + "/prospect-ia", [401,403]],
  ["Prospect: contatos restritos", prospect + "/api/master/prospect/leads", [401,403]],
  ["Prospect: exportação restrita", prospect + "/api/master/prospect/export.csv", [401,403]],
  ["Prospect: portabilidade individual restrita", prospect + "/api/master/prospect/leads/1/export", [401,403]],
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
    if (passed && bodyCheck === "desktop-css") {
      const html = await response.text();
      passed = html.includes("COMVERXA Desktop Sidebar Correction 2026-10-15");
    }
    if (passed && bodyCheck === "inbox-channel") {
      const html = await response.text();
      passed = html.includes('id="cvx-inbox-channel-patch"') && html.includes("Enviar pela Evolution API (QR)");
    }
    console.log(`${passed ? "PASS" : "FAIL"} | ${name} | HTTP ${response.status} | ${Date.now() - start}ms`);
    if (!passed) failures++;
  } catch (error) {
    console.log(`FAIL | ${name} | ${error.name || "request_error"}`);
    failures++;
  }
}

try {
  const backup = await fetch(prospect + "/api/master/prospect/backup", {
    method:"POST",
    redirect:"manual",
    headers: {"X-COMVERXA-Prospect":"1"},
    signal:AbortSignal.timeout(15000)
  });
  const protectedBackup=[401,403].includes(backup.status);
  console.log((protectedBackup?"PASS":"FAIL")+" | Prospect: backup exige autenticação | HTTP "+backup.status);
  if(!protectedBackup)failures++;
}catch(error){
  console.log("FAIL | Prospect: proteção do backup | "+String(error.name||"request_error"));
  failures++;
}


for (const [name, path, payload] of [
 ["funil comercial restrito", "/api/master/prospect/leads/1/pipeline",{stage:"ganho",sale_brl:"1.00"}],
 ["exclusão LGPD restrita", "/api/master/prospect/leads/1/erase",{confirmation:"EXCLUIR 1",request_basis:"titular"}]
]){
 try{
  const r=await fetch(prospect+path,{method:"POST",redirect:"manual",headers:{"Content-Type":"application/json","X-COMVERXA-Prospect":"1"},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  const ok=[401,403].includes(r.status);
  console.log((ok?"PASS":"FAIL")+" | Prospect: "+name+" | HTTP "+r.status);
  if(!ok)failures++;
 }catch(error){console.log("FAIL | Prospect: "+name+" | "+String(error.name||"request_error"));failures++}
}

console.log(`SUMMARY | ${checks.length - failures}/${checks.length} public checks passed | failures=${failures}`);
console.log("LIMITS | Sem login real, teste entre empresas, backup/restauração, envio WhatsApp ou pagamentos.");
if (failures) process.exitCode = 1;
