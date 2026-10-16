/**
 * COMVERXA - Diagnóstico SOMENTE LEITURA das instâncias Evolution pelo ADM Master.
 * A API Evolution v2 pode devolver tokens até em fetchInstances. NUNCA
 * devolver o objeto do fornecedor diretamente: somente campos autorizados.
 */
const cvxDiagPreviousServe=Bun.serve;
const cvxDiagNoStore={"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY"};
const cvxDiagJson=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cvxDiagNoStore,"Content-Type":"application/json; charset=utf-8"}});
const cvxDiagSafeName=value=>String(value||"").replace(/[<>\\u0000-\\u001f]/g,"").slice(0,70);
const cvxDiagState=x=>{
 const val=String(x?.connectionStatus?.state||x?.connectionStatus||x?.instance?.state||
   x?.instance?.connectionStatus?.state||x?.status||x?.state||"unknown").toLowerCase();
 return ["open","connecting","close","refused"].includes(val)?val:"unknown";
};
function cvxDiagPage(){
 return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Conexões WhatsApp | COMVERXA</title><style>body{font:16px system-ui,sans-serif;background:#f1f5f8;color:#153343;margin:0}main{max-width:860px;margin:42px auto;padding:26px;background:#fff;border:1px solid #d8e4e9;border-radius:18px}h1{font-size:25px}button{padding:12px 18px;border:0;border-radius:10px;color:#fff;background:#087d70;cursor:pointer;font-weight:700}p,small{color:#5b6c78;line-height:1.55}.item{margin:12px 0;padding:14px;border:1px solid #d5e5e9;border-radius:12px}a{color:#087d70}</style></head><body><main><p><a href="/admin">← ADM Master</a></p><h1>Diagnóstico WhatsApp sem API oficial</h1><p>Consulta somente leitura da Evolution API. Não conecta, desconecta, registra linhas ou envia mensagens. Os tokens de autenticação não são exibidos.</p><button id="refresh" type="button">Verificar conexões</button><p id="msg" role="status">Escolha Verificar conexões.</p><div id="rows"></div><small>Estado open indica sessão conectada, mas não certifica entrega ou recebimento. Homologue individualmente cada linha com contatos autorizados. Integração por QR não é a API oficial da Meta.</small></main><script>const box=document.querySelector("#rows"),msg=document.querySelector("#msg"),btn=document.querySelector("#refresh");btn.onclick=async()=>{btn.disabled=true;msg.textContent="Consultando estado das linhas...";box.replaceChildren();try{const r=await fetch("/api/master/whatsapp-health",{credentials:"same-origin",cache:"no-store"}),x=await r.json();if(!r.ok)throw Error(x.error||"Conector indisponível");msg.textContent=x.count+" instância(s) identificada(s); "+x.connected+" conectada(s).";for(const line of x.instances){const item=document.createElement("div");item.className="item";const strong=document.createElement("strong");strong.textContent=line.name||"Instância";const sub=document.createElement("p");sub.textContent="Estado: "+line.state;item.append(strong,sub);box.append(item)}}catch(e){msg.textContent="Falha de diagnóstico: "+String(e.message).slice(0,130)}finally{btn.disabled=false}};</script></body></html>`;
}
Bun.serve=function cvxDiagServe(config){
 const previousFetch=config.fetch;
 return cvxDiagPreviousServe({...config,fetch:async function(req,server){
  const path=new URL(req.url).pathname;
  const page=path==="/admin/whatsapp-health",api=path==="/api/master/whatsapp-health";
  if(!page&&!api)return previousFetch(req,server);
  if(req.method!=="GET")return cvxDiagJson({error:"Método não permitido"},405);
  try{
   const check=await previousFetch(new Request(new URL("/api/master/me",req.url),{method:"GET",headers:req.headers}),server);
   if(check.status!==200)return cvxDiagJson({error:"Acesso somente para ADM Master"},401);
  }catch{return cvxDiagJson({error:"Autenticação indisponível"},503)}
  if(page){
   return new Response(cvxDiagPage(),{headers:{...cvxDiagNoStore,
    "Content-Type":"text/html; charset=utf-8",
    "Content-Security-Policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    "Referrer-Policy":"no-referrer"}});
  }
  const addr=Bun.env.EVOLUTION_API_URL||"",key=Bun.env.EVOLUTION_API_KEY||"";
  if(!addr||!key)return cvxDiagJson({error:"Credenciais Evolution ainda não configuradas"},503);
  let target;
  try{
   target=new URL(addr);
   if(!["http:","https:"].includes(target.protocol))throw Error("protocol");
   target.pathname=target.pathname.replace(/\\/$/,"")+"/instance/fetchInstances";
   target.search="";target.hash="";
  }catch{return cvxDiagJson({error:"Endereço Evolution inválido"},503)}
  try{
   const provider=await fetch(target.href,{method:"GET",headers:{apikey:key,Accept:"application/json"},
      redirect:"error",signal:AbortSignal.timeout(12000)});
   if(!provider.ok)return cvxDiagJson({error:"Evolution indisponível (HTTP "+provider.status+")"},502);
   const payload=await provider.json();
   const rows=Array.isArray(payload)?payload:Array.isArray(payload?.instances)?payload.instances:
    Array.isArray(payload?.data)?payload.data:[];
   const instances=rows.slice(0,150).map(x=>({
    name:cvxDiagSafeName(x?.name||x?.instanceName||x?.instance?.instanceName||x?.instance?.name),
    state:cvxDiagState(x)
   }));
   return cvxDiagJson({count:instances.length,connected:instances.filter(x=>x.state==="open").length,instances,
    source:"Evolution API",checkedAt:new Date().toISOString()});
  }catch(e){
   console.warn("CVX_EVOLUTION_DIAG",String(e?.name||"provider_error").slice(0,80));
   return cvxDiagJson({error:"Não foi possível consultar o serviço Evolution"},502);
  }
 }});
};
