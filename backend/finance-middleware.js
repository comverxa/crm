// COMVERXA 1.1 — Financeiro e Contratos, somente proprietário da plataforma.
// Este módulo é executado em Railway Bun Function por meio do bootstrap privado.
// Não inclui senhas, cookies, tokens ou credenciais.
import {Database as FinanceDatabase} from "bun:sqlite";
const financialDb=new FinanceDatabase("/data/comverxa-finance.sqlite",{create:true});
financialDb.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
financialDb.exec("CREATE TABLE IF NOT EXISTS cvx_contracts(company_id TEXT PRIMARY KEY,company_name TEXT NOT NULL,customer_type TEXT NOT NULL,plan TEXT NOT NULL,monthly_cents INTEGER NOT NULL CHECK(monthly_cents>0),start_date TEXT NOT NULL,due_date TEXT NOT NULL,status TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)");
financialDb.exec("CREATE TABLE IF NOT EXISTS cvx_payments(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id TEXT NOT NULL,company_name TEXT NOT NULL,reference TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),paid_on TEXT NOT NULL,method TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,voided_at TEXT,void_reason TEXT)");
financialDb.exec("CREATE TABLE IF NOT EXISTS cvx_finance_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,recorded_at TEXT NOT NULL,actor TEXT NOT NULL,company_id TEXT NOT NULL,action TEXT NOT NULL,description TEXT NOT NULL)");
financialDb.exec("CREATE INDEX IF NOT EXISTS cvx_fin_payment_company ON cvx_payments(company_id,reference)");
financialDb.exec("CREATE INDEX IF NOT EXISTS cvx_fin_audit_date ON cvx_finance_audit(id DESC)");
const financialNoCache={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const finJson=(d,status=200)=>new Response(JSON.stringify(d),{status,headers:{...financialNoCache,"Content-Type":"application/json; charset=utf-8"}});
const finError=(msg,status=400)=>finJson({error:msg},status);
const finToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const finText=(s,max=200)=>String(s??"").trim().slice(0,max);
const finValidDate=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const finDate=(s)=>{if(!finValidDate(s))throw Error("Data inválida. Use AAAA-MM-DD.");return s};
const finPositiveCents=x=>{if(!Number.isSafeInteger(x)||x<1||x>1000000000)throw Error("Valor inválido.");return x};
const finPaymentMethods=["PIX","Boleto","Transferência","Cartão","Dinheiro","Outro"];
const finPlans=["starter","professional","business"];
const finStatuses=["active","pending","suspended","canceled"];
function finAudit(actor,company,action,summary){
 financialDb.query("INSERT INTO cvx_finance_audit(recorded_at,actor,company_id,action,description) VALUES(?,?,?,?,?)").run(new Date().toISOString(),actor,company,action,finText(summary,180));
}
function finCsvCell(value){const s=String(value??"");return '"'+s.replaceAll('"','""')+'"'}
function finMasterPage(html){
 const item='<a href="/admin/finance" style="color:#d6fff5;background:#0e756a;border-radius:10px;padding:11px 16px;font-weight:750;text-decoration:none;margin-left:12px">Financeiro e contratos ↗</a>';
 return html.includes("</header>")?html.replace("</header>",item+"</header>"):html;
}
const FINANCE_HTML="__COMVERXA_FINANCE_HTML__";
const prevFinanceServe=Bun.serve;
Bun.serve=function(finConfig){
 const finOriginalFetch=finConfig.fetch;
 const authRequest=(req,path)=>new Request(new URL(path,req.url),{method:"GET",headers:{"Cookie":req.headers.get("cookie")||"","Accept":"application/json"}});
 const masterCheck=async(req,server)=>{
  try{const r=await finOriginalFetch(authRequest(req,"/api/master/me"),server);if(r.status!==200)return null;return await r.json()}catch{return null}
 };
 const masterOverview=async(req,server)=>{
  const r=await finOriginalFetch(authRequest(req,"/api/master/overview"),server);
  if(r.status!==200)throw Error("Não foi possível consultar clientes ativos no ADM Master.");
  const data=await r.json();
  if(!Array.isArray(data.clients))throw Error("Lista de clientes indisponível.");
  return data.clients;
 };
 const findCompany=(clients,id)=>clients.find(c=>c.id===id);
 const finActor=user=>finText(user?.email||user?.user?.email||user?.name||"proprietário",100);
 const readBody=async req=>{
  const text=await req.text();
  if(text.length>10000)throw Error("Solicitação muito grande.");
  let obj;try{obj=JSON.parse(text)}catch{throw Error("JSON inválido.")}
  if(!obj||Array.isArray(obj)||typeof obj!=="object")throw Error("Conteúdo inválido.");
  return obj;
 };
 return prevFinanceServe({...finConfig,fetch:async function(req,server){
  const route=new URL(req.url).pathname,method=req.method;
  if(route==="/admin"&&method==="GET"){
   const r=await finOriginalFetch(req,server);
   if(r.status!==200||!String(r.headers.get("content-type")).includes("text/html"))return r;
   const page=finMasterPage(await r.text()),h=new Headers(r.headers);
   h.delete("content-length");h.delete("content-encoding");
   h.set("Cache-Control","no-store");
   return new Response(page,{status:r.status,headers:h});
  }
  if(route!=="/admin/finance"&&!route.startsWith("/api/master/finance/"))return finOriginalFetch(req,server);
  const identity=await masterCheck(req,server);
  if(!identity){
    if(route==="/admin/finance")return Response.redirect(new URL("/admin",req.url),302);
    return finError("Sessão de proprietário necessária.",401);
  }
  if(route==="/admin/finance"){
   if(method!=="GET")return finError("Método inválido.",405);
   return new Response(FINANCE_HTML,{headers:{"Content-Type":"text/html; charset=utf-8",...financialNoCache,"Content-Security-Policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'","Referrer-Policy":"same-origin","X-Frame-Options":"DENY"}});
  }
  const actor=finActor(identity);
  if(method!=="GET"){
   const origin=req.headers.get("origin"),self=new URL(req.url).origin;
   const fetchSite=req.headers.get("sec-fetch-site");
   if(origin!==self||(fetchSite&&fetchSite==="cross-site"))return finError("Origem recusada.",403);
   if(req.headers.get("x-comverxa-finance-action")!=="1")return finError("Solicitação não autorizada.",403);
   if(!(req.headers.get("content-type")||"").toLowerCase().includes("application/json"))return finError("Formato não permitido.",415);
  }
  try{
   if(route==="/api/master/finance/overview"&&method==="GET"){
    const clients=await masterOverview(req,server);
    const contracts=financialDb.query("SELECT * FROM cvx_contracts ORDER BY updated_at DESC LIMIT 1000").all();
    const payments=financialDb.query("SELECT * FROM cvx_payments ORDER BY id DESC LIMIT 2500").all();
    const audit=financialDb.query("SELECT recorded_at,actor,company_id,action,description FROM cvx_finance_audit ORDER BY id DESC LIMIT 100").all();
    return finJson({clients:clients.map(c=>({id:c.id,name:c.name,customer_type:c.customer_type,plan:c.plan,status:c.status,users:c.users,paid_until:c.paid_until,trial_until:c.trial_until})),contracts,payments,audit,today:finToday()});
   }
   if(route==="/api/master/finance/contracts"&&method==="POST"){
    const d=await readBody(req),clients=await masterOverview(req,server),company=findCompany(clients,finText(d.company_id,70));
    if(!company)return finError("Cliente não encontrado no ADM Master.",404);
    if(!finPlans.includes(d.plan)||!finStatuses.includes(d.status))throw Error("Plano ou situação inválidos.");
    const fee=finPositiveCents(d.monthly_cents),start=finDate(d.start_date),due=finDate(d.due_date),notes=finText(d.notes,500);
    const timestamp=new Date().toISOString(),type=["individual","mei","business"].includes(company.customer_type)?company.customer_type:"business";
    const name=finText(company.name,160),old=financialDb.query("SELECT plan,status,monthly_cents,due_date FROM cvx_contracts WHERE company_id=?").get(company.id);
    financialDb.transaction(()=>{
     financialDb.query("INSERT INTO cvx_contracts(company_id,company_name,customer_type,plan,monthly_cents,start_date,due_date,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET company_name=excluded.company_name,customer_type=excluded.customer_type,plan=excluded.plan,monthly_cents=excluded.monthly_cents,start_date=excluded.start_date,due_date=excluded.due_date,status=excluded.status,notes=excluded.notes,updated_at=excluded.updated_at").run(company.id,name,type,d.plan,fee,start,due,d.status,notes,timestamp,timestamp);
     finAudit(actor,company.id,old?"CONTRATO_ATUALIZADO":"CONTRATO_CRIADO","Plano "+d.plan+", situação "+d.status+", valor "+fee+" centavos, vencimento "+due);
    })();
    return finJson({ok:true,company_id:company.id,accessChanged:false},old?200:201);
   }
   if(route==="/api/master/finance/payments"&&method==="POST"){
    const d=await readBody(req),clients=await masterOverview(req,server),company=findCompany(clients,finText(d.company_id,70));
    if(!company)return finError("Cliente não encontrado no ADM Master.",404);
    if(!financialDb.query("SELECT company_id FROM cvx_contracts WHERE company_id=?").get(company.id))throw Error("Cadastre o contrato financeiro antes do pagamento.");
    if(typeof d.reference!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(d.reference))throw Error("Competência inválida. Use AAAA-MM.");
    if(!finPaymentMethods.includes(d.method))throw Error("Forma de pagamento inválida.");
    const amount=finPositiveCents(d.amount_cents),when=finDate(d.paid_on),notes=finText(d.notes,400),now=new Date().toISOString();
    let id=0;
    financialDb.transaction(()=>{
     const insert=financialDb.query("INSERT INTO cvx_payments(company_id,company_name,reference,amount_cents,paid_on,method,notes,created_at) VALUES(?,?,?,?,?,?,?,?)").run(company.id,finText(company.name,160),d.reference,amount,when,d.method,notes,now);
     id=Number(insert.lastInsertRowid);
     finAudit(actor,company.id,"PAGAMENTO_REGISTRADO","ID "+id+", competência "+d.reference+", valor "+amount+" centavos (confirmado manualmente)");
    })();
    return finJson({ok:true,id,accessChanged:false,bankReconciled:false},201);
   }
   if(route==="/api/master/finance/payments/void"&&method==="POST"){
    const d=await readBody(req),id=Number(d.id),reason=finText(d.reason,220);
    if(!Number.isSafeInteger(id)||id<1||reason.length<8)throw Error("Informe o pagamento e justificativa de pelo menos 8 caracteres.");
    const old=financialDb.query("SELECT id,company_id,voided_at FROM cvx_payments WHERE id=?").get(id);
    if(!old)return finError("Pagamento não encontrado.",404);
    if(old.voided_at)return finError("Pagamento já estornado.",409);
    const now=new Date().toISOString();
    financialDb.transaction(()=>{
     financialDb.query("UPDATE cvx_payments SET voided_at=?,void_reason=? WHERE id=? AND voided_at IS NULL").run(now,reason,id);
     finAudit(actor,old.company_id,"PAGAMENTO_ESTORNADO","ID "+id+", motivo: "+reason);
    })();
    return finJson({ok:true,recordPreserved:true});
   }
   if(route==="/api/master/finance/export"&&method==="GET"){
    const clients=await masterOverview(req,server),known=new Set(clients.map(x=>x.id));
    const contracts=financialDb.query("SELECT * FROM cvx_contracts ORDER BY company_name").all().filter(x=>known.has(x.company_id));
    const payments=financialDb.query("SELECT * FROM cvx_payments ORDER BY id").all().filter(x=>known.has(x.company_id));
    let csv="tipo;cliente;tipo_cliente;plano;situacao;mensalidade_centavos;inicio;vencimento;competencia;pagamento_centavos;data_pagamento;meio;estornado\n";
    for(const c of contracts)csv+=["contrato",c.company_name,c.customer_type,c.plan,c.status,c.monthly_cents,c.start_date,c.due_date,"","","","",""].map(finCsvCell).join(";")+"\n";
    for(const x of payments)csv+=["pagamento",x.company_name,"","","","","","",x.reference,x.amount_cents,x.paid_on,x.method,x.voided_at?"sim":"não"].map(finCsvCell).join(";")+"\n";
    return new Response("\ufeff"+csv,{headers:{...financialNoCache,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=comverxa-financeiro.csv"}});
   }
   return finError("Rota financeira não encontrada.",404);
  }catch(error){console.error("Financeiro ADM:",String(error?.message||error).slice(0,180));return finError(error instanceof Error?error.message:"Não foi possível concluir a operação.",400)}
 }});
};
