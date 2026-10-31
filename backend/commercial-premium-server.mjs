/**
 * COMVERXA Premium Comercial — isolated pilot server (Node.js >= 22).
 * Has its OWN SQLite file; NEVER point CVX_COM_DB_PATH at the current Railway
 * CRM production volume/database. The existing CRM's users are not imported.
 *
 * All business routes need server-owned sessions. No default passwords.
 */
import http from "node:http";
import {readFileSync,statSync,unlinkSync,existsSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {createCommercialStore} from "./commercial-premium-store.mjs";
import {createCommercialHttpHandler} from "./commercial-premium-http.mjs";
import {createTenantStore} from "./commercial-premium-tenants.mjs";
import {createLeadsStore} from "./commercial-premium-leads.mjs";
import {createOffsiteBackup} from "./commercial-premium-offsite-backup.mjs";
import {createStripeBilling} from "./commercial-premium-stripe.mjs";
import {publicPriceCatalog} from "./commercial-premium-pricing.mjs";
import {createCommercialWhatsApp} from "./commercial-premium-whatsapp.mjs";

const secureHash=s=>createHash("sha256").update(s).digest("hex");
const json=(status,body,headers={})=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...headers}});
const SESSION_SECONDS=12*3600;
const passwordHash=(pass,salt)=>scryptSync(pass,Buffer.from(salt,"hex"),64).toString("hex");
const validEmail=s=>typeof s==="string"&&s.length<=200&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const validPass=s=>typeof s==="string"&&s.length>=12&&s.length<=200;
function constantEquals(a,b){
 const A=Buffer.from(String(a)),B=Buffer.from(String(b));return A.length===B.length&&timingSafeEqual(A,B);
}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const page=(title,main)=>'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>'+escape(title)+'</title><style>body{background:#071225;color:#eef6ff;font:16px system-ui;margin:0;min-height:100vh;display:grid;place-items:center}main{max-width:440px;width:90vw;border:1px solid #284664;background:#10243c;border-radius:18px;padding:27px}h1{margin:5px 0}label{display:block;margin-top:18px}input,button{box-sizing:border-box;width:100%;font:inherit;padding:12px;margin-top:6px;border-radius:9px}input{background:#081930;color:#fff;border:1px solid #52708e}button{color:#061626;background:#52d1e8;border:0;font-weight:800;margin-top:20px}small,p{color:#a5bbd3;line-height:1.5}</style><link rel="stylesheet" href="/assets/commercial-password.css"></head><body><main>'+main+'</main></body></html>';
const loginPage=page("COMVERXA — Acesso Comercial",'<div style="color:#52d1e8;font-weight:800">COMVERXA PREMIUM</div><h1>Entrar no Comercial</h1><p>Este módulo tem senha própria, diferente do CRM principal.</p><form id="form"><label>E-mail<input autocomplete="username" type="email" name="email" required></label><label>Senha<input autocomplete="current-password" type="password" name="password" required></label><p style="font-size:13px;margin:9px 0 3px">Redefiniu sua senha? Digite a <strong style="color:#e3ffff">nova senha</strong> e ignore o preenchimento automático do celular.</p><button type="submit">Acessar com segurança</button><p id="info" role="status" aria-live="polite"></p></form><p style="margin:18px 0 10px"><a href="/forgot" style="color:#52d1e8;font-weight:700">Esqueci minha senha</a></p><p style="font-size:13px;color:#91abc2">Não utiliza automaticamente a senha do CRM principal. Sem cadastro público neste ambiente.</p><script src="/assets/commercial-password.js" defer></script><script src="/assets/commercial-login.js" defer></script>');
// Each product has a different, HttpOnly session cookie. Legacy access is enterprise-only.
const portalFromPath=path=>/^\/(?:api\/)?profissional(?:\/|$)/.test(path)?"individual":
 /^\/(?:api\/)?empresa(?:\/|$)/.test(path)?"enterprise":null;
const cookieName=mode=>mode==="individual"?"cvx_professional_session":mode==="enterprise"?"cvx_enterprise_session":"cvx_pilot_session";
const cookieValue=(header,name="cvx_pilot_session")=>{
 if(!/^[a-z_]{3,40}$/.test(name))return null;
 const m=new RegExp("(?:^|;\\s*)"+name+"=([A-Za-z0-9_-]{32,100})(?:;|$)").exec(header||"");
 return m?.[1]||null;
};
const professionalLoginPage=loginPage.replace("COMVERXA — Acesso Comercial","COMVERXA Professional | Acesso exclusivo")
 .replace("COMVERXA PREMIUM","COMVERXA PROFESSIONAL")
 .replace("Entrar no Comercial","Login do executivo e corretor")
 .replace("Este módulo tem senha própria, diferente do CRM principal.","CRM individual, com carteira, vendas e comissões exclusivas. Acesso diferente do CRM empresarial.")
 .replace('href="/forgot"','href="/profissional/forgot"');
const enterpriseLoginPage=loginPage.replace("COMVERXA — Acesso Comercial","COMVERXA Enterprise | Acesso corporativo")
 .replace("COMVERXA PREMIUM","COMVERXA ENTERPRISE")
 .replace("Entrar no Comercial","Login da empresa")
 .replace("Este módulo tem senha própria, diferente do CRM principal.","Acesso corporativo para diretores, gerentes, supervisores, administradores e suas equipes.")
 .replace('href="/forgot"','href="/empresa/forgot"');


export function createPremiumServer({
  dbPath,bootstrapEmail,bootstrapPassword,bootstrapTenant="pilot-empresa",cookieSecure=true,
  htmlPath=new URL("../site/comverxa-premium-operacional.html",import.meta.url),
  jsPath=new URL("../site/comverxa-premium-operacional.js",import.meta.url),
  loginJsPath=new URL("../site/comverxa-premium-login.js",import.meta.url),
  recoveryJsPath=new URL("../site/comverxa-premium-recovery.js",import.meta.url),
  recoveryHtmlPath=new URL("../site/comverxa-premium-recovery.html",import.meta.url),
  now=()=>Date.now(),enablePlatformMaster=false,offsiteBackupConfig=null,backupSchedule=false,
  publicOrigin="https://comverxa-comercial-piloto-production.up.railway.app",sendRecoveryEmail=null,stripeConfig=null,whatsAppConfig=null
}={}){
 if(typeof dbPath!=="string"||!dbPath.trim())throw Error("CVX_COM_DB_PATH required");
 if(!validEmail(bootstrapEmail)||!validPass(bootstrapPassword))throw Error("Strong bootstrap credentials required");
 const allowedOrigin=new URL(publicOrigin);
 if(allowedOrigin.protocol!=="https:"||allowedOrigin.pathname!=="/"||allowedOrigin.search||allowedOrigin.hash)
  throw Error("Invalid public recovery origin");
 if(typeof bootstrapTenant!=="string"||!/^[a-zA-Z0-9_.:-]{1,100}$/.test(bootstrapTenant))throw Error("Invalid tenant");
 const db=new DatabaseSync(dbPath);
 db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON");
 db.exec("CREATE TABLE IF NOT EXISTS cvx_pilot_users (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,email TEXT UNIQUE NOT NULL,role TEXT NOT NULL,salt TEXT NOT NULL,passhash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,must_change_password INTEGER NOT NULL DEFAULT 1)");
 if(!db.prepare("PRAGMA table_info(cvx_pilot_users)").all().some(x=>x.name==="must_change_password"))
  db.exec("ALTER TABLE cvx_pilot_users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1");
 db.exec("CREATE TABLE IF NOT EXISTS cvx_pilot_sessions (session_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES cvx_pilot_users(id))");
 db.exec("CREATE INDEX IF NOT EXISTS cvx_pilot_expires ON cvx_pilot_sessions(expires_at)");
 db.exec("CREATE TABLE IF NOT EXISTS cvx_pilot_recovery (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER,created_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES cvx_pilot_users(id))");
 db.exec("CREATE INDEX IF NOT EXISTS cvx_pilot_recovery_user ON cvx_pilot_recovery(user_id,expires_at)");
 // Additive migrations; preserve all existing accounts, sales and sessions.
 for(const [column,definition] of [["supervisor_id","TEXT"],["professional_type","TEXT NOT NULL DEFAULT 'broker'"]]){
  if(!db.prepare("PRAGMA table_info(cvx_pilot_users)").all().some(c=>c.name===column))
   db.exec("ALTER TABLE cvx_pilot_users ADD COLUMN "+column+" "+definition);
 }
 db.exec("CREATE INDEX IF NOT EXISTS cvx_pilot_supervision ON cvx_pilot_users(tenant_id,supervisor_id,active)");
 const store=createCommercialStore(db);
 const leads=createLeadsStore(db);
 const tenants=createTenantStore(db);
 tenants.ensureTenant(bootstrapTenant,"COMVERXA Piloto");
 const stmt=sql=>db.prepare(sql);
 const offsite=offsiteBackupConfig?createOffsiteBackup({db,dbPath,config:offsiteBackupConfig}):null;
 const billing=stripeConfig?createStripeBilling({db,baseUrl:publicOrigin,...stripeConfig}):null;
 const wa=whatsAppConfig?createCommercialWhatsApp({db,publicOrigin,...whatsAppConfig}):null;
 const scheduleHandles=[];
 const email=bootstrapEmail.trim().toLowerCase();
 if(!stmt("SELECT id FROM cvx_pilot_users WHERE email=?").get(email)){
  const salt=randomBytes(16).toString("hex");
  stmt("INSERT INTO cvx_pilot_users(id,tenant_id,email,role,salt,passhash,active) VALUES (?,?,?,?,?,?,1)")
   .run(randomUUID(),bootstrapTenant,email,enablePlatformMaster?"master":"admin",salt,passwordHash(bootstrapPassword,salt));
 }
 if(enablePlatformMaster)stmt("UPDATE cvx_pilot_users SET role='master' WHERE email=? AND tenant_id=? AND role='admin'").run(email,bootstrapTenant);
 let failMap=new Map();
 function rateLimit(key){
  const time=now(),old=failMap.get(key)||{n:0,until:0};if(old.until<time){old.n=0;old.until=time+900000}
  if(failMap.size>10000)failMap=new Map();
  if(old.n>=8)return false;old.n++;failMap.set(key,old);return true;
 }
 let backupRunning=false;
 const sessionFrom=req=>{
  const portal=portalFromPath(new URL(req.url).pathname);
  const token=cookieValue(req.headers.get("cookie"),cookieName(portal));if(!token)return null;
  const row=stmt("SELECT s.csrf,s.expires_at,u.id,u.tenant_id,u.email,u.role,u.active,u.must_change_password,u.professional_type FROM cvx_pilot_sessions s JOIN cvx_pilot_users u ON u.id=s.user_id WHERE s.session_hash=?").get(secureHash(token));
  if(!row||row.active!==1||row.expires_at<=now()||!tenants.isEnabled(row.tenant_id))return null;
  const tenant=tenants.current(row.tenant_id);
  if(portal&&tenant?.productMode!==portal)return null;
  // Old single-login sessions cannot enter the new individual CRM.
  if(!portal&&tenant?.productMode==="individual")return null;
  const teamSellerIds=row.role==="supervisor"?
   stmt("SELECT id FROM cvx_pilot_users WHERE tenant_id=? AND supervisor_id=? AND active=1").all(row.tenant_id,row.id).map(u=>u.id):[];
  return {tenantId:row.tenant_id,userId:row.id,role:row.role,email:row.email,
   productMode:tenant?.productMode||"enterprise",professionalType:row.professional_type||"broker",
   teamSellerIds,csrf:row.csrf,mustChangePassword:row.must_change_password===1};
 };
 const csrfOk=(req,session)=>constantEquals(req.headers.get("x-csrf-token")||"",session.csrf);
 const commercial=createCommercialHttpHandler({
  store,leads,enabled:true,getSession:async req=>sessionFrom(req),
  verifyCsrf:async(req,s)=>csrfOk(req,s)
 });
 const html=readFileSync(htmlPath,"utf-8");
 const themeCss=readFileSync(new URL("../site/comverxa-premium-theme.css",import.meta.url),"utf-8");
 const passwordJs=readFileSync(new URL("../site/comverxa-premium-password.js",import.meta.url),"utf-8"),
  passwordCss=readFileSync(new URL("../site/comverxa-premium-password.css",import.meta.url),"utf-8");
 const appJs=readFileSync(jsPath,"utf-8"),loginJs=readFileSync(loginJsPath,"utf-8"),
  recoveryJs=readFileSync(recoveryJsPath,"utf-8"),recoveryHtml=readFileSync(recoveryHtmlPath,"utf-8");
 if(!html.includes("COMVERXA")||html.length<500)throw Error("Invalid app page");
 const baseHeaders={"cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer","x-frame-options":"DENY","content-security-policy":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' "};
 const withHeaders=(response)=>{
  const h=new Headers(response.headers);for(const [k,v]of Object.entries(baseHeaders))if(!h.has(k))h.set(k,v);
  return new Response(response.body,{status:response.status,headers:h});
 };
 const textBytes=async(req,max)=>{
  const len=Number(req.headers.get("content-length"));if(Number.isFinite(len)&&len>max)throw Error("Too large");
  const t=await req.text();if(Buffer.byteLength(t)>max)throw Error("Too large");return t;
 };
 async function handler(req,ip="unknown"){
  let url;try{url=new URL(req.url)}catch{return json(400,{error:"Invalid URL"})}
  const rawPath=url.pathname;
  const portal=portalFromPath(rawPath);
  const path=rawPath.startsWith("/api/profissional/")?"/api/"+rawPath.slice("/api/profissional/".length):
   rawPath.startsWith("/api/empresa/")?"/api/"+rawPath.slice("/api/empresa/".length):rawPath;
  // Explicitly refuse cross-origin writes, not only CSRF.
  const fromProvider=(path.startsWith("/api/wa/qr/webhook/")||/^\/api\/wa\/meta\/[^/]+\/webhook$/.test(path)||path==="/api/billing/stripe/webhook");
  if(req.method!=="GET"&&req.method!=="HEAD"&&!fromProvider){
   const origin=req.headers.get("origin");
   if(origin&&origin!==url.origin)return json(403,{error:"Forbidden"});
   if(!origin&&!["same-origin","none"].includes(req.headers.get("sec-fetch-site")||"same-origin"))return json(403,{error:"Forbidden"});
  }
  if(path==="/healthz")return json(200,{status:"ok",service:"commercial-pilot"});
  if(path==="/assets/commercial-theme.css"&&req.method==="GET")return new Response(themeCss,{status:200,headers:{"content-type":"text/css; charset=utf-8"}});
  if(path==="/assets/commercial-password.css"&&req.method==="GET")return new Response(passwordCss,{status:200,headers:{"content-type":"text/css; charset=utf-8"}});
  if(path==="/assets/commercial-password.js"&&req.method==="GET")return new Response(passwordJs,{status:200,headers:{"content-type":"text/javascript; charset=utf-8"}});
  if(req.method==="GET"&&(path==="/assets/commercial.js"||path==="/assets/commercial-login.js"||path==="/assets/commercial-recovery.js"))return new Response(path.endsWith("login.js")?loginJs:path.endsWith("recovery.js")?recoveryJs:appJs,{status:200,headers:{"content-type":"text/javascript; charset=utf-8"}});
  if(path==="/"){
   const selector=page("COMVERXA | Escolha o CRM",'<div style="color:#52d1e8;font-weight:800">COMVERXA</div><h1>Escolha seu CRM</h1><p>Dois produtos independentes, cada um com seu login e suas próprias informações.</p><a href="/profissional/login" style="color:#52d1e8;display:block;margin:20px 0">Professional — Executivo e corretor</a><a href="/empresa/login" style="color:#52d1e8;display:block;margin:20px 0">Enterprise — Empresa, direção e gestão</a>');
   return new Response(selector,{status:200,headers:{"content-type":"text/html; charset=utf-8"}});
  }
  if(req.method==="GET"&&(rawPath==="/profissional/login"||rawPath==="/empresa/login"))
   return new Response(portal==="individual"?professionalLoginPage:enterpriseLoginPage,{status:200,headers:{"content-type":"text/html; charset=utf-8"}});
  if(path==="/login"&&req.method==="GET")return new Response(loginPage,{status:200,headers:{"content-type":"text/html; charset=utf-8"}});
  if((path==="/forgot"||path==="/reset"||/^\/(profissional|empresa)\/(forgot|reset)$/.test(rawPath))&&req.method==="GET"){
   const material=portal?recoveryHtml.replace('href="/login"','href="/'+(portal==="individual"?"profissional":"empresa")+'/login"')
    .replace("COMVERXA PREMIUM COMERCIAL",portal==="individual"?"COMVERXA PROFESSIONAL":"COMVERXA ENTERPRISE"):recoveryHtml;
   return new Response(material,{status:200,headers:{"content-type":"text/html; charset=utf-8"}});
  }
  if((path==="/app"||rawPath==="/profissional/app"||rawPath==="/empresa/app")&&req.method==="GET"){
   const loginPath=portal==null?"/login":portal==="individual"?"/profissional/login":"/empresa/login";
   if(!sessionFrom(req))return Response.redirect(url.origin+loginPath,303);
   return new Response(html,{status:200,headers:{"content-type":"text/html; charset=utf-8"}});
  }
  if(path==="/api/auth/forgot"&&req.method==="POST"){
   if(!sendRecoveryEmail)return json(503,{error:"Email recovery unavailable"});
   let data;try{data=JSON.parse(await textBytes(req,2048))}catch{return json(400,{error:"Invalid request"})}
   const candidate=String(data?.email||"").trim().toLowerCase();
   if(!validEmail(candidate))return json(400,{error:"Invalid email"});
   const neutral=json(202,{ok:true});
   if(!rateLimit("forgot:"+ip+"|"+candidate))return neutral;
   const user=stmt("SELECT id,tenant_id,email FROM cvx_pilot_users WHERE email=? AND active=1").get(candidate);
   if(!user||!tenants.isEnabled(user.tenant_id))return neutral;
   if(portal&&tenants.current(user.tenant_id)?.productMode!==portal)return neutral;
   if(!portal&&tenants.current(user.tenant_id)?.productMode==="individual")return neutral;
   const token=randomBytes(32).toString("base64url"),tokenHash=secureHash(token),expires=now()+15*60*1000;
   try{
    db.exec("BEGIN IMMEDIATE");
    stmt("DELETE FROM cvx_pilot_recovery WHERE user_id=?").run(user.id);
    stmt("INSERT INTO cvx_pilot_recovery(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").run(tokenHash,user.id,expires,now());
    db.exec("COMMIT");
    const root=portal==="individual"?"/profissional":portal==="enterprise"?"/empresa":"";
    const resetUrl=new URL(root+"/reset",publicOrigin);resetUrl.searchParams.set("token",token);
    await sendRecoveryEmail({to:user.email,resetUrl:resetUrl.href});
   }catch(error){
    try{db.exec("ROLLBACK")}catch{}
    stmt("DELETE FROM cvx_pilot_recovery WHERE token_hash=?").run(tokenHash);
    console.warn("CVX_RECOVERY_EMAIL_ERROR",JSON.stringify({kind:error?.name||"Error"}));
   }
   return neutral;
  }
  if(path==="/api/auth/reset"&&req.method==="POST"){
   let data;try{data=JSON.parse(await textBytes(req,4096))}catch{return json(400,{error:"Invalid request"})}
   const token=data?.token,newPassword=data?.newPassword;
   if(typeof token!=="string"||! /^[A-Za-z0-9_-]{40,100}$/.test(token)||!validPass(newPassword))
    return json(400,{error:"Invalid token or password"});
   if(!rateLimit("reset:"+ip))return json(429,{error:"Too many attempts"});
   const hash=secureHash(token);
   const row=stmt("SELECT r.user_id,r.expires_at,r.used_at,u.active,u.tenant_id FROM cvx_pilot_recovery r JOIN cvx_pilot_users u ON u.id=r.user_id WHERE r.token_hash=?").get(hash);
   if(!row||row.used_at!==null||row.expires_at<=now()||row.active!==1||!tenants.isEnabled(row.tenant_id)||
     portal&&tenants.current(row.tenant_id)?.productMode!==portal||
     !portal&&tenants.current(row.tenant_id)?.productMode==="individual")
    return json(400,{error:"Invalid or expired token"});
   const salt=randomBytes(16).toString("hex"),passhash=passwordHash(newPassword,salt);
   try{
    db.exec("BEGIN IMMEDIATE");
    const consumed=stmt("UPDATE cvx_pilot_recovery SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?").run(now(),hash,now());
    if(consumed.changes!==1)throw Error("Expired token");
    stmt("UPDATE cvx_pilot_users SET salt=?,passhash=?,must_change_password=0 WHERE id=?").run(salt,passhash,row.user_id);
    stmt("DELETE FROM cvx_pilot_sessions WHERE user_id=?").run(row.user_id);
    db.exec("COMMIT");
    return json(200,{ok:true,reloginRequired:true});
   }catch(error){try{db.exec("ROLLBACK")}catch{}return json(400,{error:"Invalid or expired token"})}
  }
  if(path==="/api/auth/login"&&req.method==="POST"){
   let data;
   try{data=JSON.parse(await textBytes(req,4096))}catch{return json(400,{error:"Invalid request"})}
   const e=String(data?.email||"").trim().toLowerCase(),pass=data?.password;
   if(!validEmail(e)||typeof pass!=="string")return json(401,{error:"Unauthorized"});
   if(!rateLimit(ip+"|"+e))return json(429,{error:"Too many attempts"});
   const user=stmt("SELECT * FROM cvx_pilot_users WHERE email=? AND active=1").get(e);
   const expected=user?user.passhash:passwordHash("invalidpassword000", "0".repeat(32));
   const supplied=passwordHash(pass,user?user.salt:"0".repeat(32));
   if(!constantEquals(expected,supplied))return json(401,{error:"Unauthorized"});
   if(!tenants.isEnabled(user.tenant_id))return json(403,{error:"Company access suspended"});
   if(portal&&tenants.current(user.tenant_id)?.productMode!==portal)return json(403,{error:"Wrong CRM portal"});
   if(!portal&&tenants.current(user.tenant_id)?.productMode==="individual")return json(403,{error:"Use Professional login"});
   const token=randomBytes(32).toString("base64url"),csrf=randomBytes(24).toString("base64url");
   stmt("INSERT INTO cvx_pilot_sessions(session_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)")
    .run(secureHash(token),user.id,csrf,now()+SESSION_SECONDS*1000);
   const secure=cookieSecure?"; Secure":"";
   return json(200,{ok:true},{ "set-cookie":cookieName(portal)+"="+token+"; HttpOnly; SameSite=Strict; Path=/; Max-Age="+SESSION_SECONDS+secure});
  }
  if(path==="/api/auth/me"&&req.method==="GET"){
   const s=sessionFrom(req);return s?json(200,{user:{id:s.userId,email:s.email,role:s.role,productMode:s.productMode,professionalType:s.professionalType},csrf:s.csrf,mustChangePassword:s.mustChangePassword}):json(401,{error:"Unauthorized"});
  }
  if(path==="/api/auth/profile"&&req.method==="POST"){
   const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
   if(!csrfOk(req,s)||s.mustChangePassword)return json(403,{error:"Forbidden"});
   if(s.productMode!=="individual"&&s.role!=="operator")return json(403,{error:"Forbidden"});
   let body;try{body=JSON.parse(await textBytes(req,2048))}catch{return json(400,{error:"Invalid JSON"})}
   if(!["broker","executive"].includes(body?.professionalType))return json(400,{error:"Invalid professional type"});
   stmt("UPDATE cvx_pilot_users SET professional_type=? WHERE id=? AND tenant_id=?")
    .run(body.professionalType,s.userId,s.tenantId);
   return json(200,{ok:true,professionalType:body.professionalType});
  }
  if(path==="/api/auth/password"&&req.method==="POST"){
   const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
   if(!csrfOk(req,s))return json(403,{error:"Forbidden"});
   let data;try{data=JSON.parse(await textBytes(req,4096))}catch{return json(400,{error:"Invalid request"})}
   if(typeof data.oldPassword!=="string"||!validPass(data.newPassword)||data.oldPassword===data.newPassword)
    return json(400,{error:"Invalid password"});
   const u=stmt("SELECT salt,passhash FROM cvx_pilot_users WHERE id=? AND active=1").get(s.userId);
   if(!u||!constantEquals(passwordHash(data.oldPassword,u.salt),u.passhash))
    return json(403,{error:"Forbidden"});
   const salt=randomBytes(16).toString("hex"),hash=passwordHash(data.newPassword,salt);
   db.exec("BEGIN IMMEDIATE");try{
    stmt("UPDATE cvx_pilot_users SET salt=?,passhash=?,must_change_password=0 WHERE id=?").run(salt,hash,s.userId);
    stmt("DELETE FROM cvx_pilot_sessions WHERE user_id=?").run(s.userId);
    db.exec("COMMIT");
   }catch(error){db.exec("ROLLBACK");throw error}
   const secure=cookieSecure?"; Secure":"";
   return json(200,{ok:true,reloginRequired:true},{"set-cookie":cookieName(portal)+"=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"+secure});
  }
  if(path==="/api/auth/logout"&&req.method==="POST"){
   const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
   if(!csrfOk(req,s))return json(403,{error:"Forbidden"});
   const token=cookieValue(req.headers.get("cookie"),cookieName(portal));stmt("DELETE FROM cvx_pilot_sessions WHERE session_hash=?").run(secureHash(token));
   const secure=cookieSecure?"; Secure":"";
   return json(200,{ok:true},{"set-cookie":cookieName(portal)+"=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"+secure});
  }
  if((path.startsWith("/api/pilot/")||path.startsWith("/api/commercial/")||path.startsWith("/api/platform/"))&&sessionFrom(req)?.mustChangePassword)
   return json(403,{error:"Password change required"});
  // Public Meta webhook is signed by the app secret; GET challenge is checked
  // against a per-tenant secret. QR webhook is protected by an opaque 192-bit path.
  const metaHook=/^\/api\/wa\/meta\/([^/]+)\/webhook$/.exec(path);
  if(metaHook){
   if(!wa)return json(503,{error:"WhatsApp integration unavailable"});
   const tenant=decodeURIComponent(metaHook[1]);
   if(req.method==="GET"){
    const mode=url.searchParams.get("hub.mode"),token=url.searchParams.get("hub.verify_token"),
     challenge=url.searchParams.get("hub.challenge");
    if(mode==="subscribe"&&token&&challenge&&/^[0-9]{1,100}$/.test(challenge)&&wa.verifyMeta(tenant,token))
     return new Response(challenge,{status:200,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}});
    return json(403,{error:"Webhook verification failed"});
   }
   if(req.method==="POST"){
    const bytes=Buffer.from(await req.arrayBuffer());
    if(bytes.length>512000)return json(413,{error:"Payload too large"});
    try{wa.metaWebhook(tenant,bytes,req.headers.get("x-hub-signature-256"));return json(200,{received:true})}
    catch{return json(401,{error:"Invalid webhook"})}
   }
   return json(405,{error:"Method not allowed"});
  }
  if(path.startsWith("/api/wa/qr/webhook/")){
   if(req.method!=="POST")return json(405,{error:"Method not allowed"});
   if(!wa)return json(503,{error:"WhatsApp integration unavailable"});
   let payload;try{payload=JSON.parse(await textBytes(req,512000))}catch{return json(400,{error:"Invalid JSON"})}
   try{wa.qrWebhook(path.slice("/api/wa/qr/webhook/".length),payload);return json(200,{received:true})}
   catch{return json(401,{error:"Invalid webhook"})}
  }
  if(path.startsWith("/api/wa/")){
   const ss=sessionFrom(req);
   if(!ss)return json(401,{error:"Unauthorized"});
   if(ss.mustChangePassword)return json(403,{error:"Password change required"});
   if(!wa){
    if(path==="/api/wa/channels"&&req.method==="GET")
     return json(200,{channels:[
      {slot:1,mode:"qr",label:"WhatsApp 1 · QR Code",state:"not_configured",configured:false},
      {slot:2,mode:"official",label:"WhatsApp 2 · API oficial Meta",state:"not_configured",configured:false}
     ],integrationAvailable:false,providerConfigured:{qr:false,official:false}});
    return json(503,{error:"WhatsApp provider not configured"});
   }
   if(path==="/api/wa/channels"&&req.method==="GET")return json(200,{
    channels:await wa.list(ss),integrationAvailable:true,
    providerConfigured:{
     qr:!!(whatsAppConfig?.evolutionUrl&&whatsAppConfig?.evolutionApiKey),
     official:!!whatsAppConfig?.metaAppSecret
    }
   });
   if(path==="/api/wa/inbox"&&req.method==="GET"){
    const slot=Number(url.searchParams.get("slot"));
    if(![1,2].includes(slot))return json(400,{error:"Invalid channel"});
    // Shared channel conversations are not per-seller scoped yet: fail closed for staff.
    if(ss.productMode!=="individual"&&!["master","admin","director","manager"].includes(ss.role))
     return json(403,{error:"Team inbox requires assigned conversations"});
    return json(200,{slot,messages:wa.inbox(ss,slot)});
   }
   if(["/api/wa/qr/register","/api/wa/qr/connect","/api/wa/official/register"].includes(path)&&req.method==="POST"){
    if(!["master","admin","director","manager"].includes(ss.role)||!csrfOk(req,ss))return json(403,{error:"Forbidden"});
    try{
     if(path==="/api/wa/qr/register")return json(200,await wa.registerQr(ss));
     if(path==="/api/wa/qr/connect")return json(200,await wa.qrCode(ss));
     const input=JSON.parse(await textBytes(req,4096));
     return json(200,await wa.registerOfficial(ss,input));
    }catch(error){
     const problem=String(error?.message||"");
     if(problem.startsWith("Invalid "))return json(400,{error:"Invalid WhatsApp settings"});
     if(problem==="Forbidden")return json(403,{error:"Forbidden"});
     console.warn("CVX_WA_PROVIDER_ERROR",JSON.stringify({kind:error?.name||"Error"}));
     return json(503,{error:"WhatsApp provider unavailable or credentials invalid"});
    }
   }
   if(path==="/api/wa/official/webhook-setup"&&req.method==="GET"){
    if(!["master","admin","director","manager"].includes(ss.role))return json(403,{error:"Forbidden"});
    try{return json(200,wa.webhookDetails(ss))}
    catch{return json(404,{error:"Official channel not configured"})}
   }
   return json(404,{error:"Not found"});
  }
  if(path==="/api/billing/stripe/webhook"&&req.method==="POST"){
   if(!billing)return json(503,{error:"Stripe test integration unavailable"});
   const length=Number(req.headers.get("content-length")||0);
   if(!Number.isSafeInteger(length)||length>1024*1024)return json(413,{error:"Payload too large"});
   let bytes;
   try{bytes=Buffer.from(await req.arrayBuffer())}catch{return json(400,{error:"Invalid body"})}
   if(bytes.length>1024*1024)return json(413,{error:"Payload too large"});
   try{billing.handleWebhook(bytes,req.headers.get("stripe-signature"));return json(200,{received:true})}
   catch(error){
    const kind=String(error?.message||"");
    if(kind.includes("signature")||kind.includes("event"))return json(400,{error:"Invalid Stripe webhook"});
    console.warn("CVX_STRIPE_WEBHOOK_RETRY",JSON.stringify({kind:error?.name||"Error"}));
    return json(503,{error:"Webhook not processed; provider should retry"});
   }
  }
  if(path==="/api/billing/stripe/status"&&req.method==="GET"){
   const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
   if(!["master","admin","manager"].includes(s.role))return json(403,{error:"Forbidden"});
   return json(200,billing?billing.status(s.tenantId):
    {configured:false,checkoutEnabled:false,testMode:true,availablePlans:[],availableCycles:{},catalog:publicPriceCatalog(),subscriptions:[],billingMode:"test_only"});
  }
  if(path==="/api/billing/stripe/checkout"&&req.method==="POST"){
   const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
   if(!["master","admin"].includes(s.role)||!csrfOk(req,s))return json(403,{error:"Forbidden"});
   if(s.mustChangePassword)return json(403,{error:"Password change required"});
   if(!billing)return json(503,{error:"Stripe test integration unavailable"});
   let data;try{data=JSON.parse(await textBytes(req,1024))}catch{return json(400,{error:"Invalid request"})}
   if(!["starter","professional","business"].includes(data?.plan))return json(400,{error:"Invalid plan"});
   try{
    const company=tenants.current(s.tenantId);
    if(!company||company.status!=="active")return json(403,{error:"Company disabled"});
    // Lifetime seats are managed by the MAIN CRM. Do not auto-charge its platform-owned demo tenant.
    if(s.role==="master"&&s.tenantId===bootstrapTenant)return json(403,{error:"Platform account cannot be billed"});
    return json(200,await billing.checkout(s.tenantId,data.plan,s.email,data.cycle??"monthly"));
   }catch(error){console.warn("CVX_TEST_CHECKOUT_ERROR",JSON.stringify({kind:error?.name||"Error"}));return json(503,{error:"Stripe test checkout unavailable"})}
  }
  if(path==="/api/pilot/company"&&req.method==="GET"){
   const s=sessionFrom(req);return s?json(200,{company:tenants.current(s.tenantId)}):json(401,{error:"Unauthorized"});
  }
  if(path==="/api/pilot/company"&&req.method==="POST"){
   const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
   if(!["admin","master","director"].includes(s.role)||!csrfOk(req,s))return json(403,{error:"Forbidden"});
   let body;try{body=JSON.parse(await textBytes(req,2048))}catch{return json(400,{error:"Invalid JSON"})}
   try{return json(200,{company:tenants.setBrand(s.tenantId,body.companyName)})}
   catch{return json(400,{error:"Invalid company name"})}
  }
  if(path==="/api/platform/companies"&&req.method==="GET"){
   const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
   if(s.role!=="master"||!enablePlatformMaster)return json(403,{error:"Forbidden"});
   return json(200,{companies:tenants.list().map(t=>({...t,seatsUsed:tenants.seatCount(t.id)}))});
  }
  if(path==="/api/platform/companies"&&req.method==="POST"){
   const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
   if(s.role!=="master"||!enablePlatformMaster||!csrfOk(req,s))return json(403,{error:"Forbidden"});
   let body;try{body=JSON.parse(await textBytes(req,4096))}catch{return json(400,{error:"Invalid JSON"})}
   const tenantId=body?.tenantId,companyName=body?.companyName,adminEmail=String(body?.adminEmail||"").toLowerCase().trim(),adminPassword=body?.adminPassword;
   const professionalType=body?.professionalType||"broker";
   if(!["broker","executive"].includes(professionalType))return json(400,{error:"Invalid professional type"});
   if(!validEmail(adminEmail)||!validPass(adminPassword))return json(400,{error:"Invalid admin credentials"});
   try{
    db.exec("BEGIN IMMEDIATE");
    const company=tenants.create({tenantId,companyName,plan:body?.plan,seatLimit:body?.seatLimit,productMode:body?.productMode||"enterprise"});
    const salt=randomBytes(16).toString("hex");
    stmt("INSERT INTO cvx_pilot_users(id,tenant_id,email,role,salt,passhash,active,must_change_password,professional_type) VALUES(?,?,?,?,?,?,1,1,?)")
     .run(randomUUID(),company.id,adminEmail,"admin",salt,passwordHash(adminPassword,salt),professionalType);
    db.exec("COMMIT");
    return json(201,{company});
   }catch(error){try{db.exec("ROLLBACK")}catch{}return json(409,{error:"Tenant or admin already registered"})}
  }
  if(path.startsWith("/api/platform/companies/")&&path.endsWith("/status")&&req.method==="POST"){
   const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
   if(s.role!=="master"||!enablePlatformMaster||!csrfOk(req,s))return json(403,{error:"Forbidden"});
   const tenantId=decodeURIComponent(path.slice("/api/platform/companies/".length,-"/status".length));
   if(tenantId===s.tenantId)return json(403,{error:"Cannot suspend platform tenant"});
   let body;try{body=JSON.parse(await textBytes(req,1024))}catch{return json(400,{error:"Invalid JSON"})}
   try{return json(200,{company:tenants.setStatus(tenantId,body.status)})}
   catch{return json(400,{error:"Invalid status or tenant"})}
  }
  if(path==="/api/pilot/users"&&req.method==="GET"){
   const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
   if(s.productMode==="individual"||!["master","admin","director","manager","supervisor"].includes(s.role))
    return json(403,{error:"Forbidden"});
   const sql=s.role==="supervisor"
    ?"SELECT id,email,role,active,supervisor_id,professional_type FROM cvx_pilot_users WHERE tenant_id=? AND (supervisor_id=? OR id=?) ORDER BY role,email LIMIT 300"
    :"SELECT id,email,role,active,supervisor_id,professional_type FROM cvx_pilot_users WHERE tenant_id=? ORDER BY role,email LIMIT 300";
   const rows=stmt(sql).all(...(s.role==="supervisor"?[s.tenantId,s.userId,s.userId]:[s.tenantId]));
   const users=rows.map(u=>({id:u.id,email:u.email,role:u.role,active:u.active,supervisorId:u.supervisor_id,professionalType:u.professional_type}));
   return json(200,{users});
  }
  if(path==="/api/pilot/users"&&req.method==="POST"){
   const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
   if(s.productMode==="individual"||!["admin","master","director"].includes(s.role))return json(403,{error:"Forbidden"});
   if(!csrfOk(req,s))return json(403,{error:"Forbidden"});
   let data;try{data=JSON.parse(await textBytes(req,4096))}catch{return json(400,{error:"Invalid JSON"})}
   const email=String(data?.email||"").trim().toLowerCase(),pass=data?.password,role=data?.role;
   if(!validEmail(email)||!validPass(pass)||!["manager","director","supervisor","operator"].includes(role))return json(400,{error:"Invalid user"});
   const supervisorId=data?.supervisorId||null,professionalType=data?.professionalType||"broker";
   if(!["broker","executive"].includes(professionalType))return json(400,{error:"Invalid professional type"});
   if(supervisorId&&(role!=="operator"||!stmt("SELECT 1 FROM cvx_pilot_users WHERE id=? AND tenant_id=? AND role='supervisor' AND active=1").get(supervisorId,s.tenantId)))
    return json(400,{error:"Invalid supervisor"});
   const company=tenants.current(s.tenantId);
   if(!company||company.status!=="active")return json(403,{error:"Tenant suspended"});
   if(tenants.seatCount(s.tenantId)>=company.seatLimit)return json(409,{error:"Seat limit reached"});
   const salt=randomBytes(16).toString("hex"),uid=randomUUID();
   try{stmt("INSERT INTO cvx_pilot_users(id,tenant_id,email,role,salt,passhash,active,supervisor_id,professional_type) VALUES(?,?,?,?,?,?,1,?,?)")
    .run(uid,s.tenantId,email,role,salt,passwordHash(pass,salt),supervisorId,professionalType)}catch{return json(409,{error:"Email already registered"})}
   return json(201,{id:uid,role,supervisorId,professionalType});
  }
  if(/^\/api\/pilot\/users\/[^/]+\/supervisor$/.test(path)&&req.method==="POST"){
   const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
   if(s.productMode==="individual"||!["admin","master","director"].includes(s.role)||!csrfOk(req,s))
    return json(403,{error:"Forbidden"});
   let body;try{body=JSON.parse(await textBytes(req,1024))}catch{return json(400,{error:"Invalid JSON"})}
   const userId=decodeURIComponent(path.split("/")[4]),supervisorId=body?.supervisorId||null;
   if(supervisorId&&!stmt("SELECT 1 FROM cvx_pilot_users WHERE tenant_id=? AND id=? AND role='supervisor' AND active=1").get(s.tenantId,supervisorId))
    return json(400,{error:"Invalid supervisor"});
   const changed=stmt("UPDATE cvx_pilot_users SET supervisor_id=? WHERE tenant_id=? AND id=? AND role='operator' AND active=1").run(supervisorId,s.tenantId,userId);
   if(!changed.changes)return json(404,{error:"Not found"});
   return json(200,{ok:true,userId,supervisorId});
  }
  if(path==="/api/pilot/backups/status"&&req.method==="GET"){
   const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
   if(!["admin","master","director"].includes(s.role))return json(403,{error:"Forbidden"});
   const last=offsite?.last()||null;
   return json(200,{offsiteConfigured:!!offsite,verification:last?{
     createdAt:last.created_at,verifiedAt:last.verified_at,sizeBytes:last.size_bytes,verified:true
   }:null,scheduled:!!offsite&&backupSchedule,running:offsite?.running||false});
  }
  if(path==="/api/pilot/backups/offsite"&&req.method==="POST"){
   const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
   if(!["admin","master","director"].includes(s.role)||!csrfOk(req,s))return json(403,{error:"Forbidden"});
   if(!offsite)return json(503,{error:"Offsite backup not configured"});
   try{
    const data=await offsite.run();
    return json(200,data);
   }catch(error){
    if(String(error?.message||"").includes("already running"))return json(429,{error:"Backup already running"});
    console.warn("CVX_OFFSITE_BACKUP_FAILED",{reason:String(error?.name||"Error")});
    return json(503,{error:"Offsite backup verification failed"});
   }
  }
  if(path==="/api/pilot/backup"&&req.method==="POST"){
   const session=sessionFrom(req);if(!session)return json(401,{error:"Unauthorized"});
   if(!["admin","master","director"].includes(session.role))return json(403,{error:"Forbidden"});
   // Direct SQLite export includes ALL tenants; never give a company admin other companies' data.
   const tenantCount=Number(stmt("SELECT COUNT(*) AS n FROM cvx_pilot_tenants").get().n);
   if(session.role!=="master"&&(tenantCount!==1||session.productMode==="individual"))
    return json(403,{error:"Multi-tenant backup restricted to platform administrator"});
   if(!csrfOk(req,session)||req.headers.get("x-cvx-backup-confirm")!=="EXPORTAR")
    return json(403,{error:"Forbidden"});
   if(backupRunning)return json(429,{error:"Backup already running"});
   const snapshot=join(tmpdir(),"cvx-pilot-"+randomBytes(16).toString("hex")+".sqlite");
   backupRunning=true;let verify;
   try{
    if(statSync(dbPath).size>64*1024*1024)return json(413,{error:"Database too large for direct export"});
    db.prepare("VACUUM INTO ?").run(snapshot);
    verify=new DatabaseSync(snapshot,{readOnly:true});
    const check=verify.prepare("PRAGMA integrity_check").get();
    if(!check||!Object.values(check).includes("ok"))throw Error("Backup integrity failed");
    verify.close();verify=null;
    if(statSync(snapshot).size>64*1024*1024)return json(413,{error:"Backup too large for direct export"});
    const bytes=readFileSync(snapshot);
    return new Response(bytes,{status:200,headers:{
      "content-type":"application/x-sqlite3",
      "content-disposition":'attachment; filename="comverxa-comercial-piloto.sqlite"',
      "cache-control":"private, no-store","x-content-type-options":"nosniff"}});
   }catch{return json(503,{error:"Unable to generate verified backup"})}
   finally{try{verify?.close()}catch{}try{if(existsSync(snapshot))unlinkSync(snapshot)}catch{}backupRunning=false}
  }
  if(path.startsWith("/api/commercial/")){
    if(req.method==="POST"&&(["/api/commercial/sales","/api/commercial/policies","/api/commercial/seller-plans","/api/commercial/leads"].includes(path)||/^\/api\/commercial\/leads\/[^/]+$/.test(path))){
      const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
      const data=await req.clone().json().catch(()=>null);
      if(data&&typeof data.sellerId==="string"){
       const seller=stmt("SELECT 1 FROM cvx_pilot_users WHERE id=? AND tenant_id=? AND active=1").get(data.sellerId,s.tenantId);
       if(!seller)return json(404,{error:"Not found"});
      }
    }
    // Commercial adapter accepts the same product-prefixed URL and resolves its own scope.
    return await commercial(req);
  }
  return json(404,{error:"Not found"});
 }
 const server=http.createServer(async(req,res)=>{
  const proto=(cookieSecure?"https":"http");
  const host=req.headers.host||"localhost";
  const url=proto+"://"+host+(req.url||"/");
  try{
   const body=["GET","HEAD"].includes(req.method||"")?undefined:req;
   const headers=new Headers();
   for(const [k,v] of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(","):v);
   const request=new Request(url,{method:req.method||"GET",headers,body,duplex:body?"half":undefined});
   const result=withHeaders(await handler(request,req.socket.remoteAddress||"unknown"));
   res.writeHead(result.status,Object.fromEntries(result.headers));
   if(req.method==="HEAD")res.end();
   else res.end(Buffer.from(await result.arrayBuffer()));
  }catch(error){res.writeHead(500,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify({error:"Internal error"}))}
 });
 if(offsite&&backupSchedule){
  const runScheduled=async()=>{
   try{
    const last=offsite.last(),age=last?Date.now()-Date.parse(last.verified_at):Infinity;
    if(age<20*3600*1000)return;
    const result=await offsite.run();
    console.info("CVX_OFFSITE_BACKUP_VERIFIED",JSON.stringify({verified:result.verified,createdAt:result.createdAt,sizeBytes:result.sizeBytes}));
   }catch(error){
    console.warn("CVX_OFFSITE_BACKUP_FAILED",JSON.stringify({kind:error?.name||"Error"}));
   }
  };
  const initial=setTimeout(()=>{void runScheduled()},30_000);initial.unref();scheduleHandles.push(initial);
  const interval=setInterval(()=>{void runScheduled()},60*60*1000);interval.unref();scheduleHandles.push(interval);
 }
 return {server,db,store,handler,close:async()=>{for(const h of scheduleHandles)clearTimeout(h);
  await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));db.close()}};
}
