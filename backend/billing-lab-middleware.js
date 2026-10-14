// COMVERXA — Billing Lab v1.0 (SIMULADOR, SEM PAGAMENTOS REAIS).
// Rodar apenas com COMVERXA_BILLING_MODE=sandbox; nunca acessa gateway, não gera boletos, PIX, nem ativa planos.
import {Database as BillingDb} from "bun:sqlite";
const labDb=new BillingDb("/data/comverxa-billing-lab.sqlite",{create:true});
labDb.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000");
labDb.exec("CREATE TABLE IF NOT EXISTS lab_invoices(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id TEXT NOT NULL,company_name TEXT NOT NULL,customer_type TEXT NOT NULL,reference TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),due_date TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('PENDING','PAID_SIMULATED','CANCELED')),created_at TEXT NOT NULL,paid_at TEXT,canceled_at TEXT,created_by TEXT NOT NULL,UNIQUE(company_id,reference))");
labDb.exec("CREATE TABLE IF NOT EXISTS lab_events(id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_id INTEGER NOT NULL,company_id TEXT NOT NULL,actor TEXT NOT NULL,event_type TEXT NOT NULL,recorded_at TEXT NOT NULL,note TEXT NOT NULL)");
labDb.exec("CREATE INDEX IF NOT EXISTS lab_invoices_by_due ON lab_invoices(due_date,status)");
labDb.exec("CREATE INDEX IF NOT EXISTS lab_events_by_invoice ON lab_events(invoice_id,id)");
const labJSON=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const labError=(message,status=400)=>labJSON({error:message,sandbox:true},status);
const labNow=()=>new Date().toISOString();
const labDate=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const labValidDate=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const labReference=s=>typeof s==="string"&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const labBody=async req=>{
 const text=await req.text();
 if(text.length>4000)throw Error("Solicitação de teste muito grande.");
 const data=JSON.parse(text);
 if(!data||Array.isArray(data)||typeof data!=="object")throw Error("Conteúdo inválido.");
 return data;
};
const labEvent=(invoice,actor,type,note)=>labDb.query("INSERT INTO lab_events(invoice_id,company_id,actor,event_type,recorded_at,note) VALUES(?,?,?,?,?,?)").run(invoice.id,invoice.company_id,actor,type,labNow(),note);
const labUI=__COMVERXA_LAB_HTML__;
const labPreviousServe=Bun.serve;
Bun.serve=function(labConfig){
 const previousFetch=labConfig.fetch;
 async function master(req,server,path){
  const url=new URL(path,req.url);
  const check=new Request(url,{method:"GET",headers:{"Cookie":req.headers.get("cookie")||"","Accept":"application/json"}});
  return previousFetch(check,server);
 }
 return labPreviousServe({...labConfig,fetch:async function(req,server){
  const route=new URL(req.url).pathname,method=req.method;
  if(route==="/admin/finance"&&method==="GET"){
    const response=await previousFetch(req,server);
    if(response.status!==200||!(response.headers.get("content-type")||"").includes("text/html"))return response;
    const markup=await response.text();
    if(!markup.includes('href="/admin/billing-lab"')){
      const link='<a href="/admin/billing-lab" style="color:#eafff5;text-decoration:none;border:1px solid #ffffff55;padding:10px 14px;border-radius:10px;margin-left:10px;font-weight:800">Laboratório de Cobranças (TESTE) ↗</a>';
      const updated=markup.replace("</header>",link+"</header>");
      const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("content-encoding");headers.set("Cache-Control","no-store");
      return new Response(updated,{status:response.status,headers});
    }
    return new Response(markup,{status:response.status,headers:response.headers});
  }
  if(route!=="/admin/billing-lab"&&!route.startsWith("/api/master/billing-lab/"))return previousFetch(req,server);
  if(Bun.env.COMVERXA_BILLING_MODE!=="sandbox")return labError("O laboratório está desabilitado.",503);
  let identity;
  try{const check=await master(req,server,"/api/master/me");if(check.status===200)identity=await check.json()}catch{}
  if(!identity){
   if(route==="/admin/billing-lab")return Response.redirect(new URL("/admin",req.url),302);
   return labError("Apenas o ADM Master pode acessar este laboratório.",401);
  }
  if(route==="/admin/billing-lab"){
   if(method!=="GET")return labError("Método não permitido.",405);
   return new Response(labUI,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'","X-Frame-Options":"DENY","X-Content-Type-Options":"nosniff","Referrer-Policy":"same-origin"}});
  }
  if(method!=="GET"){
    const origin=req.headers.get("origin"),same=new URL(req.url).origin,fetchSite=req.headers.get("sec-fetch-site");
    if(origin!==same||fetchSite==="cross-site")return labError("Origem recusada.",403);
    if(req.headers.get("x-comverxa-billing-lab")!=="sandbox")return labError("Confirmação do laboratório ausente.",403);
    if(!(req.headers.get("content-type")||"").toLowerCase().includes("application/json"))return labError("Formato não permitido.",415);
  }
  const actor=String(identity?.email||identity?.user?.email||"ADM Master").slice(0,100);
  try{
   if(route==="/api/master/billing-lab/overview"&&method==="GET"){
    const r=await master(req,server,"/api/master/overview");
    if(r.status!==200)return labError("Não foi possível verificar a lista de clientes.",503);
    const d=await r.json();if(!Array.isArray(d.clients))return labError("Clientes indisponíveis.",503);
    return labJSON({mode:"SANDBOX",provider:"SIMULADOR_INTERNO",realChargesEnabled:false,automaticAccessChanges:false,clients:d.clients.map(c=>({id:String(c.id),name:c.name,customer_type:c.customer_type,plan:c.plan})),invoices:labDb.query("SELECT * FROM lab_invoices ORDER BY id DESC LIMIT 2000").all(),events:labDb.query("SELECT * FROM lab_events ORDER BY id DESC LIMIT 150").all(),today:labDate()});
   }
   if(route==="/api/master/billing-lab/invoices"&&method==="POST"){
    const body=await labBody(req),id=String(body.company_id||"").slice(0,70);
    const r=await master(req,server,"/api/master/overview");if(r.status!==200)return labError("Não foi possível verificar a empresa.",503);
    const data=await r.json(),company=Array.isArray(data.clients)?data.clients.find(c=>String(c.id)===id):null;
    if(!company)return labError("Cliente não encontrado no ADM Master.",404);
    if(!labReference(body.reference))throw Error("Competência inválida. Informe AAAA-MM.");
    if(!labValidDate(body.due_date))throw Error("Vencimento inválido.");
    if(!Number.isSafeInteger(body.amount_cents)||body.amount_cents<1||body.amount_cents>1000000000)throw Error("Valor de teste inválido.");
    const now=labNow();
    try{
      const result=labDb.transaction(()=>{
       const info=labDb.query("INSERT INTO lab_invoices(company_id,company_name,customer_type,reference,amount_cents,due_date,status,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)").run(id,String(company.name||"Cliente").slice(0,150),["individual","mei","business"].includes(company.customer_type)?company.customer_type:"business",body.reference,body.amount_cents,body.due_date,"PENDING",now,actor);
       const invoice=labDb.query("SELECT * FROM lab_invoices WHERE id=?").get(Number(info.lastInsertRowid));
       labEvent(invoice,actor,"COBRANCA_TESTE_CRIADA","Cobrança fictícia criada; não houve cobrança real.");
       return invoice;
      })();
      return labJSON({ok:true,sandbox:true,invoice:result,realPayment:false,accessChanged:false},201);
    }catch(e){if(String(e).includes("UNIQUE"))return labError("Já existe uma cobrança de teste para esta empresa e competência.",409);throw e}
   }
   if(route==="/api/master/billing-lab/mark-paid"&&method==="POST"){
    const data=await labBody(req),id=Number(data.id);
    if(!Number.isSafeInteger(id)||id<1)throw Error("Cobrança inválida.");
    const invoice=labDb.query("SELECT * FROM lab_invoices WHERE id=?").get(id);
    if(!invoice)return labError("Cobrança de teste não encontrada.",404);
    if(invoice.status!=="PENDING")return labError("Esta cobrança não está pendente.",409);
    labDb.transaction(()=>{
      const now=labNow();
      const update=labDb.query("UPDATE lab_invoices SET status='PAID_SIMULATED',paid_at=? WHERE id=? AND status='PENDING'").run(now,id);
      if(update.changes!==1)throw Error("A cobrança já foi alterada.");
      labEvent(invoice,actor,"PAGAMENTO_FICTICIO","Simulação de pagamento; nenhum valor recebido, nenhum acesso liberado.");
    })();
    return labJSON({ok:true,simulated:true,paymentReceived:false,crmAccessChanged:false});
   }
   if(route==="/api/master/billing-lab/cancel"&&method==="POST"){
    const data=await labBody(req),id=Number(data.id);
    if(!Number.isSafeInteger(id)||id<1)throw Error("Cobrança inválida.");
    const invoice=labDb.query("SELECT * FROM lab_invoices WHERE id=?").get(id);
    if(!invoice)return labError("Cobrança de teste não encontrada.",404);
    if(invoice.status!=="PENDING")return labError("Apenas cobranças pendentes podem ser canceladas.",409);
    labDb.transaction(()=>{
      const update=labDb.query("UPDATE lab_invoices SET status='CANCELED',canceled_at=? WHERE id=? AND status='PENDING'").run(labNow(),id);
      if(update.changes!==1)throw Error("A cobrança já foi alterada.");
      labEvent(invoice,actor,"COBRANCA_TESTE_CANCELADA","Cobrança fictícia cancelada.");
    })();
    return labJSON({ok:true,sandbox:true,crmAccessChanged:false});
   }
   return labError("Rota do laboratório não encontrada.",404);
  }catch(ex){
    console.error("COMVERXA Billing Lab:",String(ex?.message||ex).slice(0,150));
    return labError(ex instanceof Error?ex.message:"Não foi possível concluir a simulação.");
  }
 }});
};
