// COMVERXA — cortesia vitalícia individual; duas vagas, nenhuma cobrança.
// Usa o banco persistente da própria aplicação. Não cria login nem senha.
// A segunda vaga permanece vazia até decisão expressa do ADM Master.
import {Database as LifetimeDatabase} from "bun:sqlite";
import {randomBytes,timingSafeEqual} from "node:crypto";
const ltDb=new LifetimeDatabase("/data/conecta_saas.db",{create:true});
ltDb.exec("PRAGMA busy_timeout=5000");
ltDb.exec("CREATE TABLE IF NOT EXISTS cxv_lifetime_seats(slot INTEGER PRIMARY KEY CHECK(slot IN (1,2)),email TEXT COLLATE NOCASE UNIQUE,company_id TEXT UNIQUE,status TEXT NOT NULL CHECK(status IN ('reserved','active')),initial_checked INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,activated_at TEXT)");
const ltNow=()=>new Date().toISOString();
const ltUntil=253402300799; // 9999-12-31T23:59:59Z, platform storage in UNIX seconds.
const ltEmail=x=>typeof x==="string"?x.trim().toLowerCase():"";
const ltEmailValid=x=>/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/.test(x)&&x.length<=254;
const ltReply=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const ltErr=(msg,status=400)=>ltReply({error:msg},status);
const ltGetUser=email=>ltDb.query("SELECT u.id,u.company_id,u.role,c.name as company_name FROM users u JOIN companies c ON c.id=u.company_id WHERE lower(u.email)=?").get(email);
const ltUserCount=id=>ltDb.query("SELECT COUNT(*) as total FROM users WHERE company_id=?").get(id).total;
const ltSeats=()=>ltDb.query("SELECT slot,email,company_id,status,initial_checked,activated_at FROM cxv_lifetime_seats ORDER BY slot").all();
ltDb.transaction(()=>{
 ltDb.query("INSERT OR IGNORE INTO cxv_lifetime_seats(slot,email,company_id,status,initial_checked,created_at,updated_at) VALUES(1,'joaopaulo.loovi@gmail.com',NULL,'reserved',0,?,?)").run(ltNow(),ltNow());
 ltDb.query("INSERT OR IGNORE INTO cxv_lifetime_seats(slot,email,company_id,status,initial_checked,created_at,updated_at) VALUES(2,NULL,NULL,'reserved',1,?,?)").run(ltNow(),ltNow());
})();
const ltActivate=(slot,actor)=>{
 const current=ltDb.query("SELECT * FROM cxv_lifetime_seats WHERE slot=?").get(slot);
 if(!current||!current.email)throw Error("Informe o e-mail da licença.");
 if(current.status==="active")return {alreadyActive:true,slot,email:current.email};
 const user=ltGetUser(current.email);
 if(!user)throw Error("Este e-mail ainda não possui conta. Cadastre-a primeiro no CRM.");
 if(user.role!=="owner")throw Error("A licença individual exige que o e-mail seja o titular da empresa no CRM.");
 if(ltUserCount(user.company_id)!==1)throw Error("Esta cortesia é individual. A organização precisa ter apenas um usuário.");
 const occupied=ltDb.query("SELECT slot FROM cxv_lifetime_seats WHERE company_id=? AND slot<>?").get(user.company_id,slot);
 if(occupied)throw Error("Esta empresa já recebeu outra licença vitalícia.");
 const timestamp=ltNow();
 ltDb.transaction(()=>{
  ltDb.query("UPDATE cxv_lifetime_seats SET company_id=?,status='active',updated_at=?,activated_at=? WHERE slot=? AND status='reserved'").run(user.company_id,timestamp,timestamp,slot);
  ltDb.query("UPDATE companies SET plan='professional',status='active',paid_until=?,trial_until=0 WHERE id=?").run(ltUntil,user.company_id);
 })();
 console.info("COMVERXA_LIFETIME_ACCESS",JSON.stringify({action:"activated",slot,actorClass:actor==="installation"?"installation":"owner",paymentReceived:false}));
 return {slot,email:current.email,active:true,plan:"professional",access:"individual",paymentReceived:false,until:"vitalicio"};
};
// Core operations may update paid_until during ordinary plan changes: preserve active exemption.
ltDb.exec("CREATE TRIGGER IF NOT EXISTS cxv_lifetime_plan_guard AFTER UPDATE OF plan,status,trial_until,paid_until ON companies WHEN EXISTS(SELECT 1 FROM cxv_lifetime_seats l WHERE l.company_id=NEW.id AND l.status='active') AND (NEW.status<>'active' OR NEW.plan<>'professional' OR NEW.paid_until<>253402300799 OR NEW.trial_until<>0) BEGIN UPDATE companies SET plan='professional',status='active',trial_until=0,paid_until=253402300799 WHERE id=NEW.id; END");
ltDb.exec("CREATE TRIGGER IF NOT EXISTS cxv_lifetime_single_user BEFORE INSERT ON users WHEN EXISTS(SELECT 1 FROM cxv_lifetime_seats l WHERE l.company_id=NEW.company_id AND l.status='active') AND (SELECT COUNT(*) FROM users WHERE company_id=NEW.company_id)>=1 BEGIN SELECT RAISE(ABORT,'Licença de cortesia individual: equipe adicional indisponível'); END");
// Apply immediately only if this exact owner account ALREADY existed at the first installation.
// Future registrations need explicit ADM Master activation.
const first=ltDb.query("SELECT initial_checked,status FROM cxv_lifetime_seats WHERE slot=1").get();
if(first&&!first.initial_checked){
 try{
  const current=ltDb.query("SELECT email FROM cxv_lifetime_seats WHERE slot=1").get();
  const u=ltGetUser(current.email);
  if(u&&u.role==="owner"&&ltUserCount(u.company_id)===1)ltActivate(1,"installation");
 }catch(err){console.warn("COMVERXA_LIFETIME_BOOTSTRAP",String(err.message).slice(0,120))}
 ltDb.query("UPDATE cxv_lifetime_seats SET initial_checked=1,updated_at=? WHERE slot=1").run(ltNow());
}
const ltCsrfName="__Host-cvx-lifetime-csrf";
const ltCookie=req=>{
 const found=(req.headers.get("cookie")||"").match(/(?:^|;\s*)__Host-cvx-lifetime-csrf=([a-f0-9]{48})(?:;|$)/);
 return found?.[1]||"";
};
const ltEqual=(a,b)=>/^[a-f0-9]{48}$/.test(a)&&/^[a-f0-9]{48}$/.test(b)&&timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
const ltPage=__COMVERXA_LIFETIME_UI__;
const ltPreviousServe=Bun.serve;
Bun.serve=function(lifetimeConfig){
 const original=lifetimeConfig.fetch;
 const authRequest=(req,url)=>new Request(new URL(url,req.url),{method:"GET",headers:{"Cookie":req.headers.get("cookie")||"","Accept":"application/json"}});
 const ltMaster=async(req,server)=>{
  try{
   const r=await original(authRequest(req,"/api/master/me"),server);
   if(r.status!==200)return null;
   const info=await r.json();
   return info;
  }catch{return null}
 };
 return ltPreviousServe({...lifetimeConfig,fetch:async function(req,server){
  const route=new URL(req.url).pathname,method=req.method;
  if(route==="/admin"&&method==="GET"){
   const response=await original(req,server);
   if(response.status!==200||!(response.headers.get("content-type")||"").includes("text/html"))return response;
   const html=await response.text(),headers=new Headers(response.headers);
   headers.delete("content-length");headers.delete("content-encoding");headers.set("Cache-Control","no-store");
   const link='<a href="/admin/lifetime" style="padding:10px 14px;background:#087b6f;color:#fff;border-radius:10px;text-decoration:none;font-weight:800">Acessos vitalicios</a>';
   return new Response(html.includes("</header>")?html.replace("</header>",link+"</header>"):html,{status:200,headers});
  }
  if(route!=="/admin/lifetime"&&!route.startsWith("/api/master/lifetime/"))return original(req,server);
  const master=await ltMaster(req,server);
  if(!master){
   if(route==="/admin/lifetime")return Response.redirect(new URL("/admin",req.url),302);
   return ltErr("ADM Master: autenticação obrigatória.",401);
  }
  if(route==="/admin/lifetime"){
   if(method!=="GET")return ltErr("Método inválido.",405);
   const token=randomBytes(24).toString("hex");
   const html=ltPage.replace("/*__LIFETIME_CSRF__*/","const LIFETIME_CSRF="+JSON.stringify(token)+";");
   if(html===ltPage)return ltErr("Falha na inicialização do formulário.",503);
   return new Response(html,{headers:{
    "Content-Type":"text/html; charset=utf-8",
    "Cache-Control":"no-store",
    "Set-Cookie":ltCsrfName+"="+token+"; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=3600",
    "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
    "Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","X-Content-Type-Options":"nosniff"
   }});
  }
  if(route==="/api/master/lifetime/overview"&&method==="GET"){
   const seats=ltSeats().map(s=>{
    const existing=s.email?ltGetUser(s.email):null;
    return {slot:s.slot,email:s.email,status:s.status,accountExists:!!existing,companyName:s.company_id?(existing?.company_name||"Conta vinculada"):null,activatedAt:s.activated_at,
      users:s.company_id?ltUserCount(s.company_id):null,plan:s.status==="active"?"professional":null,monthlyCents:0};
   });
   return ltReply({seats,capacity:2,active:seats.filter(s=>s.status==="active").length,chargeEnabled:false,recurringPayment:false});
  }
  if(method!=="POST")return ltErr("Método inválido.",405);
  const origin=req.headers.get("origin"),site=req.headers.get("sec-fetch-site");
  if((origin&&origin!=="null"&&origin!=="https://app.comverxa.com.br")||(site==="cross-site"&&origin!=="null"&&origin!=="https://app.comverxa.com.br"))return ltErr("Origem recusada.",403);
  if(!ltEqual(req.headers.get("x-comverxa-lifetime-csrf")||"",ltCookie(req)))return ltErr("Sessão expirada. Atualize a página.",403);
  if(!(req.headers.get("content-type")||"").toLowerCase().includes("application/json"))return ltErr("Formato JSON obrigatório.",415);
  try{
   const raw=await req.text();
   if(raw.length>2048)throw Error("Requisição muito grande.");
   const payload=JSON.parse(raw),slot=Number(payload.slot);
   if(!Number.isSafeInteger(slot)||![1,2].includes(slot))throw Error("Vaga inválida.");
   if(route==="/api/master/lifetime/reserve"){
    if(slot!==2)return ltErr("A primeira licença tem e-mail reservado pelo proprietário.",403);
    const email=ltEmail(payload.email);
    if(!ltEmailValid(email))throw Error("Informe um e-mail válido.");
    const firstEmail=ltDb.query("SELECT email FROM cxv_lifetime_seats WHERE slot=1").get()?.email;
    if(email===firstEmail)return ltErr("O e-mail já possui uma vaga reservada.",409);
    const seat=ltDb.query("SELECT status,email FROM cxv_lifetime_seats WHERE slot=2").get();
    if(seat.status==="active")return ltErr("A segunda licença já está ativa; não pode ser transferida sem procedimento administrativo.",409);
    if(seat.email&&seat.email!==email)return ltErr("A vaga já foi reservada. Alterações exigem autorização explícita do proprietário.",409);
    ltDb.query("UPDATE cxv_lifetime_seats SET email=?,updated_at=? WHERE slot=2 AND status='reserved'").run(email,ltNow());
    return ltReply({ok:true,slot:2,email,status:"reserved",chargeEnabled:false});
   }
   if(route==="/api/master/lifetime/activate"){
    const result=ltActivate(slot,"owner");
    return ltReply({ok:true,...result,chargeEnabled:false});
   }
   return ltErr("Operação inexistente.",404);
  }catch(error){return ltErr(error instanceof Error?error.message:"Não foi possível concluir a operação.",400)}
 }});
};
