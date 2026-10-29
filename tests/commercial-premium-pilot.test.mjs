import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createPremiumServer} from "../backend/commercial-premium-server.mjs";
const password="SecureTestPasswordOnly-2026!";
const email="admin@exemplo.test";
function setup(){const folder=mkdtempSync(join(tmpdir(),"cvx-pilot-"));const app=createPremiumServer({
 dbPath:join(folder,"pilot.sqlite"),bootstrapEmail:email,bootstrapPassword:password,cookieSecure:false
 });return {folder,app}}
async function start(app){await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));return "http://127.0.0.1:"+app.server.address().port}
async function stop(folder,app){await app.close();rmSync(folder,{recursive:true,force:true})}
test("pilot refuses weak bootstrap credentials and empty db path",()=>{
 assert.throws(()=>createPremiumServer({dbPath:"",bootstrapEmail:email,bootstrapPassword:password}),/CVX_COM_DB_PATH/);
 assert.throws(()=>createPremiumServer({dbPath:":memory:",bootstrapEmail:email,bootstrapPassword:"123"}),/Strong bootstrap/);
});
test("HTTP pilot login, secure session, CSRF, sales and logout end-to-end",async()=>{
 const {folder,app}=setup();try{
 const base=await start(app);
 let r=await fetch(base+"/api/commercial/rules");assert.equal(r.status,401);
 r=await fetch(base+"/app",{redirect:"manual"});assert.equal(r.status,303);
 r=await fetch(base+"/login");assert.equal(r.status,200);assert.match(await r.text(),/Entrar no Comercial/);
 r=await fetch(base+"/assets/commercial-login.js");assert.equal(r.status,200);
 r=await fetch(base+"/assets/commercial.js");assert.equal(r.status,200);
 r=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},
 body:JSON.stringify({email,password:"bad-password"})});assert.equal(r.status,401);
 r=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},
 body:JSON.stringify({email,password})});assert.equal(r.status,200);
 const cookie=r.headers.get("set-cookie").split(";")[0];assert.match(r.headers.get("set-cookie"),/HttpOnly/);
 assert.match(r.headers.get("set-cookie"),/SameSite=Strict/);
 r=await fetch(base+"/api/auth/me",{headers:{cookie}});assert.equal(r.status,200);
 const me=await r.json(),csrf=me.csrf;assert.equal(me.user.role,"admin");assert.ok(csrf.length>=24);
 r=await fetch(base+"/app",{headers:{cookie}});assert.equal(r.status,200);
 assert.match(await r.text(),/COMVERXA Premium Comercial/);
 const post=async(path,payload,token=csrf,extra={})=>fetch(base+path,{method:"POST",
 headers:{"content-type":"application/json",cookie,"x-csrf-token":token,...extra},body:JSON.stringify(payload)});
 const rules={tiers:[{minSales:0,bonusCents:0},{minSales:1,bonusCents:25000}],
 salesRateBps:1000,activationRateBps:500,recurringRateBps:200,teamTargetSales:10};
 r=await post("/api/commercial/rules",rules,"invalid");assert.equal(r.status,403);
 r=await post("/api/commercial/rules",rules,csrf,{Origin:"https://malicious.example"});assert.equal(r.status,403);
 r=await post("/api/commercial/rules",rules);assert.equal(r.status,200);
 r=await post("/api/commercial/sales",{id:"TEST-01",sellerId:me.user.id,status:"sold",soldAt:"2026-10-20",
 premiumCents:15000,activationCents:2500,recurringCents:0});
 assert.equal(r.status,201);
 r=await fetch(base+"/api/commercial/summary?month=2026-10&asOf=2026-10-29",{headers:{cookie}});
 assert.equal(r.status,200);const dash=await r.json();
 assert.equal(dash.counts.sold,1);assert.equal(dash.commissions.effectiveCents,0);assert.equal(dash.commissions.retainedCents,1625);
 r=await post("/api/commercial/sales",{id:"TEST-01",sellerId:me.user.id,status:"sold",soldAt:"2026-10-20",premiumCents:15000,activationCents:2500,recurringCents:0,commissionState:"effective"});assert.equal(r.status,201);
 r=await fetch(base+"/api/commercial/summary?month=2026-10&asOf=2026-10-29",{headers:{cookie}});
 assert.equal((await r.json()).commissions.effectiveCents,1625);
 r=await fetch(base+"/api/commercial/report/print?month=2026-10&asOf=2026-10-29",{headers:{cookie}});
 assert.equal(r.status,200);assert.match(await r.text(),/Fechamento comercial/);
 r=await post("/api/auth/logout",{});assert.equal(r.status,200);
 r=await fetch(base+"/api/auth/me",{headers:{cookie}});assert.equal(r.status,401);
 }finally{await stop(folder,app)}
});
test("password rotation invalidates existing sessions and old password",async()=>{
 const {folder,app}=setup();try{
  const base=await start(app);
  const login=async(pass)=>fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password:pass})});
  let response=await login(password);assert.equal(response.status,200);
  const cookie=response.headers.get("set-cookie").split(";")[0];
  const me=await (await fetch(base+"/api/auth/me",{headers:{cookie}})).json();
  response=await fetch(base+"/api/auth/password",{method:"POST",
   headers:{"content-type":"application/json",cookie,"x-csrf-token":me.csrf},
   body:JSON.stringify({oldPassword:"wrong",newPassword:"NewStrongPassword-456!"})});
  assert.equal(response.status,403);
  response=await fetch(base+"/api/auth/password",{method:"POST",
   headers:{"content-type":"application/json",cookie,"x-csrf-token":me.csrf},
   body:JSON.stringify({oldPassword:password,newPassword:"NewStrongPassword-456!"})});
  assert.equal(response.status,200);
  assert.equal((await fetch(base+"/api/auth/me",{headers:{cookie}})).status,401);
  assert.equal((await login(password)).status,401);
  assert.equal((await login("NewStrongPassword-456!")).status,200);
 }finally{await stop(folder,app)}
});

test("pilot user creation stays within tenant and operator cannot approve commission or access teams",async()=>{
 const {folder,app}=setup();try{
 const base=await start(app);
 const login=async(u,p)=>{const r=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:u,password:p})});return r};
 let r=await login(email,password);assert.equal(r.status,200);
 const adminCookie=r.headers.get("set-cookie").split(";")[0];
 const info=await (await fetch(base+"/api/auth/me",{headers:{cookie:adminCookie}})).json();
 const save=async(route,body,cookie=adminCookie,csrf=info.csrf)=>fetch(base+route,{method:"POST",
 headers:{"content-type":"application/json",cookie,"x-csrf-token":csrf},body:JSON.stringify(body)});
 await save("/api/commercial/rules",{tiers:[{minSales:0,bonusCents:0},{minSales:2,bonusCents:1000}],salesRateBps:1000});
 const userPassword="UserSecretTest-0001";
 r=await save("/api/pilot/users",{email:"operator@exemplo.test",password:userPassword,role:"operator"});
 assert.equal(r.status,201);const uid=(await r.json()).id;
 r=await fetch(base+"/api/pilot/users",{headers:{cookie:adminCookie}});assert.equal(r.status,200);assert.ok((await r.json()).users.some(u=>u.id===uid));
 r=await login("operator@exemplo.test",userPassword);assert.equal(r.status,200);
 const operatorCookie=r.headers.get("set-cookie").split(";")[0];
 const op=await (await fetch(base+"/api/auth/me",{headers:{cookie:operatorCookie}})).json();
 r=await save("/api/commercial/sales",{id:"ONE",sellerId:uid,soldAt:"2026-10-20",status:"sold",premiumCents:10000},operatorCookie,op.csrf);
 assert.equal(r.status,201);assert.equal((await r.json()).sale.commissionState,"retained");
 r=await save("/api/commercial/sales",{id:"ONE",sellerId:uid,soldAt:"2026-10-20",status:"sold",premiumCents:20000},operatorCookie,op.csrf);
 assert.equal(r.status,403);
 r=await save("/api/pilot/users",{email:"another@exemplo.test",password:userPassword,role:"operator"},operatorCookie,op.csrf);
 assert.equal(r.status,403);
 r=await fetch(base+"/api/pilot/users",{headers:{cookie:operatorCookie}});assert.equal(r.status,403);
 r=await fetch(base+"/api/commercial/team?month=2026-10&asOf=2026-10-29",{headers:{cookie:operatorCookie}});
 assert.equal(r.status,403);
 r=await save("/api/commercial/sales",{id:"ONE",sellerId:uid,soldAt:"2026-10-20",status:"sold",premiumCents:10000,commissionState:"effective"});
 assert.equal(r.status,201);
 r=await fetch(base+"/api/commercial/summary?month=2026-10&asOf=2026-10-29",{headers:{cookie:operatorCookie}});
 assert.equal((await r.json()).commissions.effectiveCents,1000);
 }finally{await stop(folder,app)}
});
