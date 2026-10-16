/**
 * COMVERXA — Teste de prontidão pública (sem credenciais, sem escrita).
 * Checa regressões de acesso anônimo, publicação e transparência comercial.
 * NÃO substitui testes autenticados de isolamento entre empresas, LGPD e recuperação de backup.
 */
const base="https://app.comverxa.com.br",marketing="https://comverxa.github.io/crm/";
let failures=0,warnings=0;
const log=(kind,msg,status)=>{console.log(kind+" | "+msg+(status===undefined?"":" | HTTP "+status));if(kind==="FAIL")failures++;if(kind==="WARN")warnings++};
async function get(url){return fetch(url,{redirect:"manual",headers:{"Accept":"text/html,application/json"},signal:AbortSignal.timeout(20000)})}
async function expect(name,url,statuses){try{const r=await get(url);log(statuses.includes(r.status)?"PASS":"FAIL",name,r.status);return r}catch(e){log("FAIL",name+" "+e.message);return null}}
const health=await expect("Saúde do aplicativo",base+"/healthz",[200]);
if(health){const body=await health.json().catch(()=>null);log(body?.status==="ok"?"PASS":"FAIL","Healthcheck informa status ok")}
await expect("Página comercial",marketing,[200]);
await expect("Aviso LGPD público",marketing+"privacidade.html",[200]);
await expect("Termos de uso público",marketing+"termos.html",[200]);
await expect("Painel ADM público (login/solicitação)",base+"/admin",[200,302,303]);
for(const [name,path] of [
 ["Sessão ADM Master","/api/master/me"],
 ["Lista de empresas","/api/master/overview"],
 ["Receita e contratos","/api/master/finance/overview"],
 ["Exportação financeira","/api/master/finance/export"],
 ["Laboratório de cobranças","/api/master/billing-lab/overview"],
 ["Dados da conta CRM","/api/me"]
])await expect("Bloqueio anônimo: "+name,base+path,[401,403]);
for(const [name,path] of [["Financeiro","/admin/finance"],["Laboratório","/admin/billing-lab"]])await expect("Redirecionamento anônimo: "+name,base+path,[301,302,303,401,403]);
await expect("Link mágico de confirmação inválido",base+"/admin/verify?token="+"0".repeat(64),[400,401,403,404]);
const publicPage=await get(marketing);
if(publicPage.status===200){
 const html=await publicPage.text();
 for(const [item,expression] of [
 ["Site identifica COMVERXA",/COMVERXA/g],
 ["Ligação para CRM real",/https:\/\/app\.comverxa\.com\.br\//],
 ["Link para LGPD",/privacidade\.html/],
 ["Link para Termos",/termos\.html/],
 ["Preço não informado como valor fixo",/sob consulta/i]
 ])log(expression.test(html)?"PASS":"FAIL","Conteúdo comercial: "+item);
}
// Verificações de lançamento assistido: somente leitura, nunca testar envio com clientes reais.
const crmPage=await get(base+"/");
if(crmPage.status===200){
 const crmHtml=await crmPage.text();
 for(const [name,needle] of [
  ["CRM premium publicado",'id="comverxa-premium-v2"'],
  ["Orçamento QR publicado","cvx-disparo-orcamento"],
  ["Fila assistida com consentimento","__cvxQrAssistedQueueInstalled"],
  ["WhatsApp por canal autenticado","/api/inbox/"]
 ]) log(crmHtml.includes(needle)?"PASS":"FAIL","Produção: "+name);
}else log("FAIL","Página CRM indisponível para verificação",crmPage.status);
for(const [name,path] of [
 ["Portal de clientes","acesso.html"],
 ["Termos públicos","termos.html"],
 ["Política pública","privacidade.html"]
])await expect("Lançamento: "+name,marketing+path,[200]);
for(const [name,path] of [
 ["Contatos CRM protegidos","/api/leads"],
 ["Caixa de entrada protegida","/api/inbox"],
 ["Canais WhatsApp protegidos","/api/lines"]
])await expect("Autenticação: "+name,base+path,[401,403,404]);
const csp=health?.headers.get("content-security-policy");
if(!csp)log("WARN","Healthcheck não divulga Content-Security-Policy (confirmar nos documentos HTML)");
const app=await get(base+"/admin");
if(app.status===200){
 const headers=app.headers;
 for(const [name,key] of [["X-Content-Type-Options","x-content-type-options"],["Proteção de enquadramento","x-frame-options"],["Sem cache em ADM","cache-control"],["HSTS","strict-transport-security"]]){
  log(headers.has(key)?"PASS":"FAIL","Cabeçalho de segurança: "+name);
 }
 if(!String(headers.get("strict-transport-security")||"").includes("max-age=31536000"))log("FAIL","HSTS deve cobrir pelo menos um ano no ADM Master.");
 if(headers.get("x-content-type-options")!=="nosniff")log("FAIL","ADM Master deve enviar nosniff.");
}
console.log(JSON.stringify({summary:{checksFailed:failures,warnings,mode:"PUBLIC_READ_ONLY",authenticatedTenantIsolation:"NOT_TESTED",recoveryBackupRestore:"NOT_TESTED",productionPayments:"NOT_TESTED"}},null,2));
if(failures)process.exit(1);
