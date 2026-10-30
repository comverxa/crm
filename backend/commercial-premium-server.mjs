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
const page=(title,main)=>'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>'+escape(title)+'</title><style>body{background:#071225;color:#eef6ff;font:16px system-ui;margin:0;min-height:100vh;display:grid;place-items:center}main{max-width:440px;width:90vw;border:1px solid #284664;background:#10243c;border-radius:18px;padding:27px}h1{margin:5px 0}label{display:block;margin-top:18px}input,button{box-sizing:border-box;width:100%;font:inherit;padding:12px;margin-top:6px;border-radius:9px}input{background:#081930;color:#fff;border:1px solid #52708e}button{color:#061626;background:#52d1e8;border:0;font-weight:800;margin-top:20px}small,p{color:#a5bbd3;line-height:1.5}</style></head><body><main>'+main+'</main></body></html>';
const loginPage=page("COMVERXA — Acesso Comercial",'<div style="color:#52d1e8;font-weight:800">COMVERXA PREMIUM</div><h1>Entrar no Comercial</h1><p>Ambiente piloto isolado do CRM principal.</p><form id="form"><label>E-mail<input autocomplete="username" type="email" name="email" required></label><label>Senha<input autocomplete="current-password" type="password" name="password" required></label><button type="submit">Acessar com segurança</button><p id="info" role="status"></p></form><small>Sem cadastro público, pagamentos ou envios de WhatsApp neste ambiente.</small><script src="/assets/commercial-login.js" defer></script>');
const cookieValue=s=>{const m=/(?:^|;\s*)cvx_pilot_session=([A-Za-z0-9_-]{32,100})(?:;|$)/.exec(s||"");return m?.[1]||null};

export function createPremiumServer({
  dbPath,bootstrapEmail,bootstrapPassword,bootstrapTenant="pilot-empresa",cookieSecure=true,
  htmlPath=new URL("../site/comverxa-premium-operacional.html",import.meta.url),
  jsPath=new URL("../site/comverxa-premium-operacional.js",import.meta.url),
  loginJsPath=new URL("../site/comverxa-premium-login.js",import.meta.url),
  now=()=>Date.now(),enablePlatformMaster=false
}={}){
 if(typeof dbPath!=="string"||!dbPath.trim())throw Error("CVX_COM_DB_PATH required");
 if(!validEmail(bootstrapEmail)||!validPass(bootstrapPassword))throw Error("Strong bootstrap credentials required");
 if(typeof bootstrapTenant!=="string"||!/^[a-zA-Z0-9_.:-]{1,100}$/.test(bootstrapTenant))throw Error("Invalid tenant");
 const db=new DatabaseSync(dbPath);
 db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON");
 db.exec("CREATE TABLE IF NOT EXISTS cvx_pilot_users (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,email TEXT UNIQUE NOT NULL,role TEXT NOT NULL,salt TEXT NOT NULL,passhash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,must_change_password INTEGER NOT NULL DEFAULT 1)");
 if(!db.prepare("PRAGMA table_info(cvx_pilot_users)").all().some(x=>x.name==="must_change_password"))
  db.exec("ALTER TABLE cvx_pilot_users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1");
 db.exec("CREATE TABLE IF NOT EXISTS cvx_pilot_sessions (session_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES cvx_pilot_users(id))");
 db.exec("CREATE INDEX IF NOT EXISTS cvx_pilot_expires ON cvx_pilot_sessions(expires_at)");
 const store=createCommercialStore(db);
 const tenants=createTenantStore(db);
 tenants.ensureTenant(bootstrapTenant,"COMVERXA Piloto");
 const stmt=sql=>db.prepare(sql);
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
  const token=cookieValue(req.headers.get("cookie"));if(!token)return null;
  const row=stmt("SELECT s.csrf,s.expires_at,u.id,u.tenant_id,u.email,u.role,u.active,u.must_change_password FROM cvx_pilot_sessions s JOIN cvx_pilot_users u ON u.id=s.user_id WHERE s.session_hash=?").get(secureHash(token));
  if(!row||row.active!==1||row.expires_at<=now()||!tenants.isEnabled(row.tenant_id))return null;
  return {tenantId:row.tenant_id,userId:row.id,role:row.role,email:row.email,csrf:row.csrf,mustChangePassword:row.must_change_password===1};
 };
 const csrfOk=(req,session)=>constantEquals(req.headers.get("x-csrf-token")||"",session.csrf);
 const commercial=createCommercialHttpHandler({
  store,enabled:true,getSession:async req=>sessionFrom(req),
  verifyCsrf:async(req,s)=>csrfOk(req,s)
 });
 const html=readFileSync(htmlPath,"utf-8");
 const appJs=readFileSync(jsPath,"utf-8"),loginJs=readFileSync(loginJsPath,"utf-8");
 if(!html.includes("COMVERXA")||html.length<500)throw Error("Invalid app page");
 const baseHeaders={"cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer","x-frame-options":"DENY","content-security-policy":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' "};
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
  const path=url.pathname;
  // Explicitly refuse cross-origin writes, not only CSRF.
  if(req.method!=="GET"&&req.method!=="HEAD"){
   const origin=req.headers.get("origin");
   if(origin&&origin!==url.origin)return json(403,{error:"Forbidden"});
   if(!origin&&!["same-origin","none"].includes(req.headers.get("sec-fetch-site")||"same-origin"))return json(403,{error:"Forbidden"});
  }
  if(path==="/healthz")return json(200,{status:"ok",service:"commercial-pilot"});
  if(req.method==="GET"&&(path==="/assets/commercial.js"||path==="/assets/commercial-login.js"))return new Response(path.endsWith("login.js")?loginJs:appJs,{status:200,headers:{"content-type":"text/javascript; charset=utf-8"}});
  if(path==="/")return Response.redirect(url.origin+(sessionFrom(req)?"/app":"/login"),303);
  if(path==="/login"&&req.method==="GET")return new Response(loginPage,{status:200,headers:{"content-type":"text/html; charset=utf-8"}});
  if(path==="/app"&&req.method==="GET"){
   if(!sessionFrom(req))return Response.redirect(url.origin+"/login",303);
   return new Response(html,{status:200,headers:{"content-type":"text/html; charset=utf-8"}});
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
   const token=randomBytes(32).toString("base64url"),csrf=randomBytes(24).toString("base64url");
   stmt("INSERT INTO cvx_pilot_sessions(session_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)")
    .run(secureHash(token),user.id,csrf,now()+SESSION_SECONDS*1000);
   const secure=cookieSecure?"; Secure":"";
   return json(200,{ok:true},{ "set-cookie":"cvx_pilot_session="+token+"; HttpOnly; SameSite=Strict; Path=/; Max-Age="+SESSION_SECONDS+secure});
  }
  if(path==="/api/auth/me"&&req.method==="GET"){
   const s=sessionFrom(req);return s?json(200,{user:{id:s.userId,email:s.email,role:s.role},csrf:s.csrf,mustChangePassword:s.mustChangePassword}):json(401,{error:"Unauthorized"});
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
   return json(200,{ok:true,reloginRequired:true},{"set-cookie":"cvx_pilot_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"+secure});
  }
  if(path==="/api/auth/logout"&&req.method==="POST"){
   const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
   if(!csrfOk(req,s))return json(403,{error:"Forbidden"});
   const token=cookieValue(req.headers.get("cookie"));stmt("DELETE FROM cvx_pilot_sessions WHERE session_hash=?").run(secureHash(token));
   const secure=cookieSecure?"; Secure":"";
   return json(200,{ok:true},{"set-cookie":"cvx_pilot_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"+secure});
  }
  if((path.startsWith("/api/pilot/")||path.startsWith("/api/commercial/")||path.startsWith("/api/platform/"))&&sessionFrom(req)?.mustChangePassword)
   return json(403,{error:"Password change required"});
  if(path==="/api/pilot/company"&&req.method==="GET"){
   const s=sessionFrom(req);return s?json(200,{company:tenants.current(s.tenantId)}):json(401,{error:"Unauthorized"});
  }
  if(path==="/api/pilot/company"&&req.method==="POST"){
   const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
   if(!["admin","master"].includes(s.role)||!csrfOk(req,s))return json(403,{error:"Forbidden"});
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
   if(!validEmail(adminEmail)||!validPass(adminPassword))return json(400,{error:"Invalid admin credentials"});
   try{
    db.exec("BEGIN IMMEDIATE");
    const company=tenants.create({tenantId,companyName,plan:body?.plan,seatLimit:body?.seatLimit});
    const salt=randomBytes(16).toString("hex");
    stmt("INSERT INTO cvx_pilot_users(id,tenant_id,email,role,salt,passhash,active,must_change_password) VALUES(?,?,?,?,?,?,1,1)")
     .run(randomUUID(),company.id,adminEmail,"admin",salt,passwordHash(adminPassword,salt));
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
   if(!["master","admin","manager"].includes(s.role))return json(403,{error:"Forbidden"});
   const users=stmt("SELECT id,email,role,active FROM cvx_pilot_users WHERE tenant_id=? ORDER BY role,email LIMIT 300").all(s.tenantId);
   return json(200,{users});
  }
  if(path==="/api/pilot/users"&&req.method==="POST"){
   const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
   if(!["admin","master"].includes(s.role))return json(403,{error:"Forbidden"});
   if(!csrfOk(req,s))return json(403,{error:"Forbidden"});
   let data;try{data=JSON.parse(await textBytes(req,4096))}catch{return json(400,{error:"Invalid JSON"})}
   const email=String(data?.email||"").trim().toLowerCase(),pass=data?.password,role=data?.role;
   if(!validEmail(email)||!validPass(pass)||!["manager","operator"].includes(role))return json(400,{error:"Invalid user"});
   const company=tenants.current(s.tenantId);
   if(!company||company.status!=="active")return json(403,{error:"Tenant suspended"});
   if(tenants.seatCount(s.tenantId)>=company.seatLimit)return json(409,{error:"Seat limit reached"});
   const salt=randomBytes(16).toString("hex"),uid=randomUUID();
   try{stmt("INSERT INTO cvx_pilot_users(id,tenant_id,email,role,salt,passhash,active) VALUES(?,?,?,?,?,?,1)")
    .run(uid,s.tenantId,email,role,salt,passwordHash(pass,salt))}catch{return json(409,{error:"Email already registered"})}
   return json(201,{id:uid,role});
  }
  if(path==="/api/pilot/backup"&&req.method==="POST"){
   const session=sessionFrom(req);if(!session)return json(401,{error:"Unauthorized"});
   if(!["admin","master"].includes(session.role))return json(403,{error:"Forbidden"});
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
    if(req.method==="POST"&&["/api/commercial/sales","/api/commercial/policies","/api/commercial/seller-plans"].includes(path)){
      const s=sessionFrom(req);if(!s)return json(401,{error:"Unauthorized"});
      const data=await req.clone().json().catch(()=>null);
      if(data&&typeof data.sellerId==="string"){
       const seller=stmt("SELECT 1 FROM cvx_pilot_users WHERE id=? AND tenant_id=? AND active=1").get(data.sellerId,s.tenantId);
       if(!seller)return json(404,{error:"Not found"});
      }
    }
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
 return {server,db,store,handler,close:async()=>{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));db.close()}};
}
