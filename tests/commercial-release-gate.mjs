/**
 * COMVERXA — porta de liberação comercial.
 * Somente GET público e verificação de acesso anônimo, SEM alterar dados.
 * Uso: node tests/commercial-release-gate.mjs [--strict]
 *
 * PASS nos checks públicos significa publicação, NÃO segurança SaaS multiempresa.
 * A liberação estrita exige provas autenticadas e operacionais independentes.
 */
const main="https://app.comverxa.com.br";
const prospect="https://comverxa-prospect-ia-production.up.railway.app";
const marketing="https://comverxa.github.io/crm";
const strict=process.argv.includes("--strict");
const results=[];
async function probe(title,url,expected,{contains,headers,bodyJson}={}) {
  try {
    const response=await fetch(url,{method:"GET",redirect:"manual",cache:"no-store",
      headers:{"Accept":"text/html,application/json","User-Agent":"COMVERXA-ReleaseGate/1"},
      signal:AbortSignal.timeout(16000)});
    let pass=expected.includes(response.status);
    let reason="HTTP "+response.status;
    if(pass&&contains) {
      const body=await response.text();
      pass=contains.every(x=>body.includes(x));
      if(!pass)reason+="; marcador de recurso ausente";
    }
    if(pass&&bodyJson) {
      const json=await response.json().catch(()=>null);
      pass=!!json&&bodyJson(json);
      if(!pass)reason+="; corpo de saúde inválido";
    }
    if(pass&&headers) {
      for(const [name,fn] of headers){
        if(!fn(response.headers.get(name)||"")){pass=false;reason+="; cabeçalho "+name+" incorreto"}
      }
    }
    results.push({title,pass,reason});
    console.log((pass?"PASS":"FAIL")+" | "+title+" | "+reason);
  }catch(error){
    results.push({title,pass:false,reason:String(error.name||"erro de rede")});
    console.log("FAIL | "+title+" | "+String(error.name||"erro de rede"));
  }
}
await probe("CRM base e persistência respondendo",main+"/healthz",[200],{bodyJson:x=>x.status==="ok"});
await probe("CRM com correção desktop e inbox QR",main+"/",[200],
  {contains:['id="cvx-desktop-css"','id="cvx-inbox-channel-patch"','id="cvx-mass-send-estimator"']});
await probe("ADM Master publicado",main+"/admin",[200],{headers:[
  ["x-content-type-options",v=>v==="nosniff"],
  ["strict-transport-security",v=>v.includes("max-age=31536000")],
  ["x-frame-options",v=>v==="DENY"]
]});
for(const [label,path] of [
 ["conta cliente","/api/me"],
 ["área master","/api/master/me"],
 ["empresas","/api/master/overview"],
 ["financeiro","/api/master/finance/overview"],
 ["licenças vitalícias","/api/master/lifetime/overview"],
 ["leads","/api/leads"],
 ["conversas","/api/inbox"],
 ["linhas","/api/lines"]
])await probe("Proteção sem sessão: "+label,main+path,[401,403,404]);
await probe("Prospect IA responde",prospect+"/healthz",[200],{contains:["healthy"]});
await probe("Prospect IA bloqueia dados sem sessão",prospect+"/api/master/prospect/leads",[401,403]);
await probe("Página de venda",marketing+"/",[200],{contains:["COMVERXA"]});
await probe("LGPD publicada",marketing+"/privacidade.html",[200]);
await probe("Termos publicados",marketing+"/termos.html",[200]);

const failed=results.filter(x=>!x.pass).map(x=>x.title);
const noProof=[
  "Isolamento autenticado de duas empresas: acessar, alterar e exportar dados cruzados em teste isolado",
  "Backup externo consistente + restauração verificada em ambiente independente",
  "Licenças vitalícias: confirmar estado REAL da vaga 1 Empresarial e reserva da vaga 2 no ADM",
  "WhatsApp: duas linhas, recebimento e envio reais para destinatários autorizados",
  "Campanhas QR: opt-in persistente, descadastro, limites e entrega reais verificados sem simulação",
  "Recuperação de conta, permissões e expiração de sessão testadas autenticadamente",
  "Contrato, DPA/LGPD, identificação do fornecedor e suporte juridicamente aprovados",
  "Continuidade e faturamento do Railway e processo de cobrança comercial real confirmados"
];
console.log("\nPUBLIC_SMOKE "+(failed.length===0?"PASS":"FAIL")+" | "+results.length+" verificações; falhas="+failed.length);
console.log("COMMERCIAL_RELEASE NO_GO | provas P0 não fornecidas a este processo:");
noProof.forEach((s,i)=>console.log(" P0-"+(i+1)+": "+s));
console.log("IMPORTANT: O envio em massa automático NÃO é homologado só porque scripts de interface estão publicados.");
if(failed.length||(strict&&noProof.length))process.exitCode=1;
