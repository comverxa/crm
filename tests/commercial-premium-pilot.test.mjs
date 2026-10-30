import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createPremiumServer} from "../backend/commercial-premium-server.mjs";
const password="SecureTestPasswordOnly-2026!";
const email="admin@exemplo.test";
function setup(options={}){const folder=mkdtempSync(join(tmpdir(),"cvx-pilot-"));const app=createPremiumServer({
 dbPath:join(folder,"pilot.sqlite"),bootstrapEmail:email,bootstrapPassword:password,cookieSecure:false,...options
 });return {folder,app}}
async function start(app){await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));return "http://127.0.0.1:"+app.server.address().port}
async function stop(folder,app){await app.close();rmSync(folder,{recursive:true,force:true})}

async function unlock(base,cookie,email,oldPassword){
 const fetchMe=async token=>await(await fetch(base+"/api/auth/me",{headers:{cookie:token}})).json();
 let me=await fetchMe(cookie);
 if(me.mustChangePassword){
  const updated=oldPassword+"-rotated";
  const r=await fetch(base+"/api/auth/password",{method:"POST",
   headers:{"content-type":"application/json",cookie,"x-csrf-token":me.csrf},
   body:JSON.stringify({oldPassword,newPassword:updated})});
  assert.equal(r.status,200);
  const next=await fetch(base+"/api/auth/login",{method:"POST",
   headers:{"content-type":"application/json"},body:JSON.stringify({email,password:updated})});
  assert.equal(next.status,200);
  cookie=next.headers.get("set-cookie").split(";")[0];
  me=await fetchMe(cookie);
 }
 assert.equal(me.mustChangePassword,false);
 return {cookie,me};
}

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
 let cookie=r.headers.get("set-cookie").split(";")[0];assert.match(r.headers.get("set-cookie"),/HttpOnly/);
 assert.match(r.headers.get("set-cookie"),/SameSite=Strict/);
 r=await fetch(base+"/api/auth/me",{headers:{cookie}});assert.equal(r.status,200);
 let me=await r.json(),csrf=me.csrf;assert.equal(me.user.role,"admin");assert.ok(csrf.length>=24);
 assert.equal(me.mustChangePassword,true);
 assert.equal((await fetch(base+"/api/commercial/rules",{headers:{cookie}})).status,403);
 ({cookie,me}=await unlock(base,cookie,email,password));csrf=me.csrf;
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
 let adminCookie=r.headers.get("set-cookie").split(";")[0];
 let rotated=await unlock(base,adminCookie,email,password);adminCookie=rotated.cookie;
 const info=rotated.me;
 const save=async(route,body,cookie=adminCookie,csrf=info.csrf)=>fetch(base+route,{method:"POST",
 headers:{"content-type":"application/json",cookie,"x-csrf-token":csrf},body:JSON.stringify(body)});
 await save("/api/commercial/rules",{tiers:[{minSales:0,bonusCents:0},{minSales:2,bonusCents:1000}],salesRateBps:1000});
 const userPassword="UserSecretTest-0001";
 r=await save("/api/pilot/users",{email:"operator@exemplo.test",password:userPassword,role:"operator"});
 assert.equal(r.status,201);const uid=(await r.json()).id;
 r=await fetch(base+"/api/pilot/users",{headers:{cookie:adminCookie}});assert.equal(r.status,200);assert.ok((await r.json()).users.some(u=>u.id===uid));
 r=await login("operator@exemplo.test",userPassword);assert.equal(r.status,200);
 let operatorCookie=r.headers.get("set-cookie").split(";")[0];
 rotated=await unlock(base,operatorCookie,"operator@exemplo.test",userPassword);operatorCookie=rotated.cookie;
 const op=rotated.me;
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

test("pilot backup requires admin, CSRF and confirmation; download restores as valid SQLite",async()=>{
 const {folder,app}=setup();try{
 const base=await start(app);
 const first=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})});
 let {cookie,me}=await unlock(base,first.headers.get("set-cookie").split(";")[0],email,password);
 const req=async(headers={})=>fetch(base+"/api/pilot/backup",{method:"POST",headers:{"cookie":cookie,"x-csrf-token":me.csrf,...headers}});
 assert.equal((await req()).status,403);
 assert.equal((await req({"x-cvx-backup-confirm":"EXPORTAR","x-csrf-token":"bad"})).status,403);
 const backup=await req({"x-cvx-backup-confirm":"EXPORTAR"});
 assert.equal(backup.status,200);
 assert.match(backup.headers.get("content-disposition"),/attachment/);
 const bytes=Buffer.from(await backup.arrayBuffer());
 assert.ok(bytes.length>1000);
 const file=join(folder,"restored.sqlite");
 writeFileSync(file,bytes);
 const restored=new DatabaseSync(file,{readOnly:true});
 try{assert.equal(Object.values(restored.prepare("PRAGMA integrity_check").get())[0],"ok");
 assert.equal(restored.prepare("SELECT COUNT(*) AS c FROM cvx_pilot_users").get().c,1);
 }finally{restored.close()}
 }finally{await stop(folder,app)}
});

test("SaaS master onboards two isolated companies with seat quota and suspension",async()=>{
 const {folder,app}=setup({enablePlatformMaster:true});
 try{
  const base=await start(app);
  const login=async(email,password)=>fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})});
  const first=await login(email,password);
  const master=await unlock(base,first.headers.get("set-cookie").split(";")[0],email,password);
  assert.equal(master.me.user.role,"master");
  const post=async(url,data,cookie=master.cookie,csrf=master.me.csrf)=>fetch(base+url,{
   method:"POST",headers:{"content-type":"application/json",cookie,"x-csrf-token":csrf},body:JSON.stringify(data)});
  const company={
    tenantId:"company-B",companyName:"Corretora B",plan:"professional",seatLimit:2,
    adminEmail:"admin-b@exemplo.test",adminPassword:"StrongCompanyBStart-234"
  };
  let r=await post("/api/platform/companies",company);
  assert.equal(r.status,201);
  assert.equal((await r.json()).company.billingMode,"sandbox");
  r=await fetch(base+"/api/platform/companies",{headers:{cookie:master.cookie}});
  assert.equal(r.status,200);assert.equal((await r.json()).companies.length,2);
  r=await post("/api/platform/companies",{...company,tenantId:"company-over",plan:"starter",seatLimit:2,adminEmail:"admin-over@exemplo.test"});
  assert.equal(r.status,409);
  r=await post("/api/platform/companies",{...company,tenantId:"company-starter",plan:"starter",seatLimit:1,adminEmail:"admin-starter@exemplo.test"});
  assert.equal(r.status,201);assert.equal((await r.json()).company.seatLimit,1);
  const loginB=await login(company.adminEmail,company.adminPassword);
  assert.equal(loginB.status,200);
  const adminB=await unlock(base,loginB.headers.get("set-cookie").split(";")[0],company.adminEmail,company.adminPassword);
  r=await post("/api/platform/companies",{...company,tenantId:"company-C",adminEmail:"admin-c@exemplo.test"},adminB.cookie,adminB.me.csrf);
  assert.equal(r.status,403);
  r=await post("/api/commercial/rules",{tiers:[{minSales:0,bonusCents:0},{minSales:1,bonusCents:2500}],salesRateBps:1000},adminB.cookie,adminB.me.csrf);
  assert.equal(r.status,200);
  r=await post("/api/commercial/sales",{id:"B1",sellerId:adminB.me.user.id,status:"sold",soldAt:"2026-10-29",premiumCents:7000},adminB.cookie,adminB.me.csrf);
  assert.equal(r.status,201);
  r=await fetch(base+"/api/commercial/sales?month=2026-10",{headers:{cookie:master.cookie}});
  assert.equal(r.status,200);assert.equal((await r.json()).sales.length,0);
  r=await post("/api/pilot/users",{email:"seller-b@exemplo.test",password:"VeryStrongSellerB-111",role:"operator"},adminB.cookie,adminB.me.csrf);
  assert.equal(r.status,201);
  r=await post("/api/pilot/users",{email:"seller-b2@exemplo.test",password:"VeryStrongSellerB-222",role:"operator"},adminB.cookie,adminB.me.csrf);
  assert.equal(r.status,409);assert.equal((await r.json()).error,"Seat limit reached");
  r=await post("/api/platform/companies/company-B/status",{status:"suspended"});
  assert.equal(r.status,200);
  r=await fetch(base+"/api/auth/me",{headers:{cookie:adminB.cookie}});
  assert.equal(r.status,401);
  r=await login(company.adminEmail,company.adminPassword+"-rotated");
  assert.equal(r.status,403);
  r=await post("/api/platform/companies/company-B/status",{status:"active"});
  assert.equal(r.status,200);
  r=await login(company.adminEmail,company.adminPassword+"-rotated");
  assert.equal(r.status,200);
 }finally{await stop(folder,app)}
});


test("role dashboards remain scoped before and after commission setup",async()=>{
 const {folder,app}=setup();try{
  const base=await start(app);
  const login=async(emailAddress,pass)=>{
   const r=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:emailAddress,password:pass})});
   assert.equal(r.status,200);return r.headers.get("set-cookie").split(";")[0];
  };
  const admin=await unlock(base,await login(email,password),email,password);
  const get=(route,cookie)=>fetch(base+route,{headers:{cookie}});
  const post=(route,body,cookie=admin.cookie,csrf=admin.me.csrf)=>fetch(base+route,{
   method:"POST",headers:{"content-type":"application/json",cookie,"x-csrf-token":csrf},body:JSON.stringify(body)
  });
  let r=await get("/api/commercial/configuration-status",admin.cookie);
  assert.deepEqual(await r.json(),{configured:false,canConfigure:true});
  const users=[];
  for(let n=1;n<=2;n++){
   const address="seller"+n+"@exemplo.test",pass="SafeDemoSellerPass-"+n+"-2026!";
   r=await post("/api/pilot/users",{email:address,password:pass,role:"operator"});
   assert.equal(r.status,201);const user=await r.json();
   const auth=await unlock(base,await login(address,pass),address,pass);
   users.push({id:user.id,...auth});
   r=await get("/api/commercial/configuration-status",auth.cookie);
   assert.deepEqual(await r.json(),{configured:false,canConfigure:false});
   r=await post("/api/commercial/leads",{name:"Lead real do teste "+n,sellerId:user.id,
     stage:n===1?"lead":"negotiation",temperature:n===1?"hot":"warm"});
   assert.equal(r.status,201);
  }
  for(const u of users){
   r=await get("/api/commercial/leads/summary",u.cookie);
   assert.equal(r.status,200);const leadSummary=await r.json();
   assert.equal(leadSummary.total,1,"operator must see only assigned leads");
   r=await get("/api/commercial/leads",u.cookie);
   assert.equal((await r.json()).leads.length,1);
  }
  r=await get("/api/commercial/leads/summary",admin.cookie);
  assert.equal((await r.json()).total,2,"admin sees company-wide leads");
  r=await post("/api/commercial/rules",{tiers:[{minSales:0,bonusCents:0},{minSales:2,bonusCents:1000}],salesRateBps:1000});
  assert.equal(r.status,200);
  for(let n=0;n<users.length;n++){
   r=await post("/api/commercial/sales",{id:"ROLE-SALE-"+(n+1),sellerId:users[n].id,
     status:"sold",soldAt:"2026-10-20",premiumCents:10000*(n+1)});
   assert.equal(r.status,201);
  }
  const summaryPath="/api/commercial/summary?month=2026-10&asOf=2026-10-29";
  for(let n=0;n<users.length;n++){
   r=await get(summaryPath,users[n].cookie);assert.equal(r.status,200);
   const metrics=await r.json();assert.equal(metrics.counts.sold,1);
   assert.equal(metrics.revenueCents,10000*(n+1));
   r=await get("/api/commercial/team?month=2026-10&asOf=2026-10-29",users[n].cookie);
   assert.equal(r.status,403,"operator may not read company totals");
  }
  r=await get(summaryPath,admin.cookie);assert.equal(r.status,200);
  const enterprise=await r.json();assert.equal(enterprise.counts.sold,2);
  assert.equal(enterprise.revenueCents,30000);
  r=await get("/api/commercial/team?month=2026-10&asOf=2026-10-29",admin.cookie);
  assert.equal(r.status,200);assert.equal((await r.json()).totals.sales,2);
 }finally{await stop(folder,app)}
});
