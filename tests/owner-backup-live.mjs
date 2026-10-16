/**
 * COMVERXA: verificação de publicação do backup — não efetua login real e
 * não baixa arquivos confidenciais.
 */
const base="https://app.comverxa.com.br";
const checks=[
 ["CRM online",base+"/healthz",[200],"health"],
 ["Página inicial acessível",base+"/",[200]],
 ["Backup ADM exige login",base+"/admin/backup",[401]],
 ["Diagnóstico WhatsApp ADM exige login",base+"/admin/whatsapp-health",[401]],
 ["Estado da Evolution exige ADM",base+"/api/master/whatsapp-health",[401]],
 ["Área master publicada",base+"/admin",[200]],
 ["Informações master exigem login",base+"/api/master/me",[401,403]]
];
let failed=0;
for(const [name,url,accepted,kind] of checks){
 try{
  const res=await fetch(url,{method:"GET",redirect:"manual",cache:"no-store",
    headers:{"Accept":"application/json,text/html","User-Agent":"COMVERXA-Backup-QA/1.0"},
    signal:AbortSignal.timeout(20000)});
  let ok=accepted.includes(res.status);
  if(ok&&kind==="health")ok=(await res.json().catch(()=>null))?.status==="ok";
  console.log((ok?"PASS":"FAIL")+" | "+name+" | HTTP "+res.status);
  if(!ok)failed++;
 }catch(e){console.log("FAIL | "+name+" | "+String(e));failed++}
}
for(const [name,init,expected] of [
 ["Backup POST anônimo rejeitado",{method:"POST",headers:{"Origin":base,
   "X-CVX-Backup-Confirm":"EXPORTAR COMVERXA","X-CVX-Backup-Token":"0".repeat(48)}},[401,403]],
 ["Backup rejeita GET indevido",{method:"GET"},[405]]
]){
 try{
  const res=await fetch(base+"/api/master/backup?scope=crm",{...init,redirect:"manual",signal:AbortSignal.timeout(20000)});
  const ok=expected.includes(res.status);
  console.log((ok?"PASS":"FAIL")+" | "+name+" | HTTP "+res.status);
  if(!ok)failed++;
 }catch(e){console.log("FAIL | "+name+" | "+String(e));failed++}
}
console.log("SUMMARY | "+failed+" failed | READ ONLY; sem backups de dados, sessão ou alterações.");
if(failed)process.exitCode=1;
