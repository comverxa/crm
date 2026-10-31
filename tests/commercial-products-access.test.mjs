import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {createTenantStore} from "../backend/commercial-premium-tenants.mjs";
import {createCommercialStore} from "../backend/commercial-premium-store.mjs";
import {createLeadsStore} from "../backend/commercial-premium-leads.mjs";
import {createPremiumServer} from "../backend/commercial-premium-server.mjs";

const period="2026-10",asOf="2026-10-29";
const rules={tiers:[{minSales:0,bonusCents:0},{minSales:1,bonusCents:1000}],salesRateBps:1000,teamTargetSales:8};

test("existing tenants migrate to Enterprise without losing registered business data",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  db.exec("CREATE TABLE cvx_pilot_tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL,plan TEXT NOT NULL,status TEXT NOT NULL,seat_limit INTEGER NOT NULL,billing_mode TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)");
  db.prepare("INSERT INTO cvx_pilot_tenants VALUES(?,?,?,?,?,?,?,?)").run("old","Empresa Antiga","starter","active",1,"sandbox","2026-01-01","2026-01-01");
  const tenants=createTenantStore(db);
  assert.equal(tenants.current("old").productMode,"enterprise");
  assert.equal(tenants.current("old").name,"Empresa Antiga");
  assert.equal(tenants.create({tenantId:"solo",companyName:"Corretor Solo",plan:"starter",seatLimit:1,productMode:"individual"}).productMode,"individual");
  assert.throws(()=>tenants.create({tenantId:"invalid",companyName:"Firma Teste",plan:"business",seatLimit:8,productMode:"individual"}),/Seat limit/);
 }finally{db.close()}
});

test("sales, leads, commissions and policies use server-owned product and team scope",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  const store=createCommercialStore(db),leads=createLeadsStore(db);
  const director={tenantId:"a",userId:"director",role:"director",productMode:"enterprise"};
  const supervisor={tenantId:"a",userId:"sup",role:"supervisor",productMode:"enterprise",teamSellerIds:["broker-a"]};
  const solo={tenantId:"a",userId:"broker-a",role:"admin",productMode:"individual"};
  const notMySeller={tenantId:"a",userId:"broker-b",role:"operator",productMode:"enterprise"};
  const sold=(id,sellerId)=>({id,sellerId,soldAt:"2026-10-12",status:"sold",premiumCents:10000});
  store.saveRules(director,rules);
  store.upsertSale(director,sold("A","broker-a"));
  store.upsertSale(director,sold("B","broker-b"));
  assert.equal(store.listSales(director,period).length,2);
  assert.deepEqual(store.listSales(supervisor,period).map(s=>s.id),["A"]);
  assert.deepEqual(store.listSales(solo,period).map(s=>s.id),["A"]);
  assert.equal(store.snapshot(supervisor,{month:period,asOf}).counts.sold,1);
  assert.equal(store.teamSummary(supervisor,{month:period,asOf}).totals.sales,1);
  assert.throws(()=>store.teamSummary(solo,{month:period,asOf}),/Forbidden/);
  assert.throws(()=>store.upsertSale(supervisor,sold("C","broker-b")) ,/Forbidden/);
  assert.throws(()=>store.upsertSale(solo,sold("D","broker-b")),/Forbidden/);
  const a=leads.create(director,{name:"Lead um",sellerId:"broker-a"});
  const b=leads.create(director,{name:"Lead dois",sellerId:"broker-b"});
  assert.deepEqual(leads.list(supervisor).map(x=>x.id),[a.id]);
  assert.deepEqual(leads.list(solo).map(x=>x.id),[a.id]);
  assert.throws(()=>leads.get(supervisor,b.id),/Not found/);
  assert.throws(()=>leads.get(solo,b.id),/Not found/);
  assert.throws(()=>leads.create(supervisor,{name:"Tentativa",sellerId:"broker-b"}),/Forbidden/);
  store.upsertPolicy(director,{id:"P1",sellerId:"broker-a",startsOn:"2026-09-01",endsOn:"2027-09-01",productType:"insurance",status:"active"});
  store.upsertPolicy(director,{id:"P2",sellerId:"broker-b",startsOn:"2026-09-01",endsOn:"2027-09-01",productType:"insurance",status:"active"});
  assert.equal(store.listPolicies(supervisor).length,1);
  assert.equal(store.listPolicies(solo).length,1);
  assert.equal(store.renewals(supervisor,{asOf}).items.length,1);
  assert.equal(store.listSales(notMySeller,period).length,1);
 }finally{db.close()}
});

test("login, individual onboarding and supervisor reassignment enforce organization boundaries",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"cvx-two-products-"));
 const masterMail="owner@exemplo.test",masterPass="MasterSecureStart-2026!";
 const app=createPremiumServer({dbPath:join(dir,"test.sqlite"),bootstrapEmail:masterMail,
   bootstrapPassword:masterPass,enablePlatformMaster:true,cookieSecure:false});
 const started=await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
 const base="http://127.0.0.1:"+app.server.address().port;
 async function login(email,password){
  const route=email==="single@exemplo.test"?"/api/profissional":"/api/empresa";
  const r=await fetch(base+route+"/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})});
  assert.equal(r.status,200, "login "+email);
  let cookie=r.headers.get("set-cookie").split(";")[0];
  let me=await (await fetch(base+route+"/auth/me",{headers:{cookie}})).json();
  if(me.mustChangePassword){
   const changed=password+"-rotated";
   const rotation=await fetch(base+route+"/auth/password",{method:"POST",headers:{"content-type":"application/json",cookie,"x-csrf-token":me.csrf},
    body:JSON.stringify({oldPassword:password,newPassword:changed})});
   assert.equal(rotation.status,200);
   const response=await fetch(base+route+"/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password:changed})});
   assert.equal(response.status,200);
   cookie=response.headers.get("set-cookie").split(";")[0];
   me=await (await fetch(base+route+"/auth/me",{headers:{cookie}})).json();
  }
  return {cookie,me,route};
 }
 const scoped=(auth,path)=>auth.route&&path.startsWith("/api/")?auth.route+path.slice(4):path;
 const post=async(auth,path,data)=>fetch(base+scoped(auth,path),{method:"POST",headers:{"content-type":"application/json",cookie:auth.cookie,"x-csrf-token":auth.me.csrf},body:JSON.stringify(data)});
 const get=(auth,path)=>fetch(base+scoped(auth,path),{headers:{cookie:auth.cookie}});
 try{
  const master=await login(masterMail,masterPass);
  let r=await post(master,"/api/platform/companies",{tenantId:"single",companyName:"Corretor Individual",productMode:"individual",
   plan:"starter",seatLimit:1,adminEmail:"single@exemplo.test",adminPassword:"SingleStartSecure-2026!"});
  assert.equal(r.status,201);
  const solo=await login("single@exemplo.test","SingleStartSecure-2026!");
  assert.equal(solo.me.user.productMode,"individual");
  assert.match(solo.cookie,/^cvx_professional_session=/);
  assert.match(master.cookie,/^cvx_enterprise_session=/);
  assert.equal((await get(solo,"/api/auth/me")).status,200);
  assert.equal((await fetch(base+"/api/empresa/auth/me",{headers:{cookie:solo.cookie}})).status,401);
  assert.equal((await fetch(base+"/api/profissional/auth/me",{headers:{cookie:master.cookie}})).status,401);
  assert.equal((await fetch(base+"/profissional/app",{headers:{cookie:master.cookie},redirect:"manual"})).status,303);
  assert.equal((await fetch(base+"/empresa/app",{headers:{cookie:solo.cookie},redirect:"manual"})).status,303);
  const wrong=await fetch(base+"/api/empresa/auth/login",{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({email:"single@exemplo.test",password:"SingleStartSecure-2026!-rotated"})});
  assert.equal(wrong.status,403);
  assert.match(await (await fetch(base+"/profissional/login")).text(),/Login do executivo e corretor/);
  assert.match(await (await fetch(base+"/empresa/login")).text(),/Login da empresa/);
  let profile=await post(solo,"/api/auth/profile",{professionalType:"executive"});
  assert.equal(profile.status,200);
  const freshMe=await get(solo,"/api/auth/me").then(r=>r.json());
  assert.equal(freshMe.user.professionalType,"executive");
  profile=await post(solo,"/api/auth/profile",{professionalType:"director"});
  assert.equal(profile.status,400);
  assert.equal((await get(solo,"/api/pilot/company").then(r=>r.json())).company.productMode,"individual");
  assert.equal((await get(solo,"/api/commercial/team?month="+period+"&asOf="+asOf)).status,403);
  assert.equal((await get(solo,"/api/pilot/users")).status,403);
  assert.equal((await post(solo,"/api/pilot/users",{email:"employee@exemplo.test",password:"SecureNewAccount2026!",role:"operator"})).status,403);
  assert.equal((await post(solo,"/api/commercial/rules",rules)).status,200);
  assert.equal((await post(solo,"/api/commercial/sales",{id:"PERSONAL",sellerId:solo.me.user.id,
   soldAt:"2026-10-05",status:"sold",premiumCents:10000})).status,201);
  assert.equal((await get(solo,"/api/commercial/summary?month="+period+"&asOf="+asOf)).status,200);

  r=await post(master,"/api/platform/companies",{tenantId:"fleet",companyName:"Seguradora Regional",productMode:"enterprise",
   plan:"business",seatLimit:8,adminEmail:"admin-fleet@exemplo.test",adminPassword:"FleetStartSecure2026!"});
  assert.equal(r.status,201);
  const admin=await login("admin-fleet@exemplo.test","FleetStartSecure2026!");
  const newUser=async(email,role,supervisorId=null)=>{
   const resp=await post(admin,"/api/pilot/users",{email,password:"StrongEmployeePassword2026!",role,supervisorId});
   assert.equal(resp.status,201,email);return (await resp.json()).id;
  };
  const supervisorId=await newUser("sup@exemplo.test","supervisor");
  const brokerA=await newUser("broker-a@exemplo.test","operator",supervisorId);
  const brokerB=await newUser("broker-b@exemplo.test","operator");
  await newUser("director@exemplo.test","director");
  const supervisor=await login("sup@exemplo.test","StrongEmployeePassword2026!");
  const director=await login("director@exemplo.test","StrongEmployeePassword2026!");
  assert.equal(supervisor.me.user.role,"supervisor");
  assert.equal(director.me.user.role,"director");
  assert.equal((await post(director,"/api/auth/profile",{professionalType:"executive"})).status,403);
  assert.equal((await get(supervisor,"/api/pilot/users").then(r=>r.json())).users.length,2);
  assert.equal((await post(admin,"/api/commercial/rules",rules)).status,200);
  for(const [id,sellerId] of [["A",brokerA],["B",brokerB]]){
   assert.equal((await post(admin,"/api/commercial/sales",{id,sellerId,soldAt:"2026-10-05",status:"sold",premiumCents:10000})).status,201);
  }
  const supervisorSales=await get(supervisor,"/api/commercial/sales?month="+period).then(r=>r.json());
  assert.deepEqual(supervisorSales.sales.map(s=>s.id),["A"]);
  const team=await get(supervisor,"/api/commercial/team?month="+period+"&asOf="+asOf);
  assert.equal(team.status,200);assert.equal((await team.json()).totals.sales,1);
  assert.equal((await get(director,"/api/commercial/sales?month="+period).then(r=>r.json())).sales.length,2);
  assert.equal((await post(supervisor,"/api/commercial/sales",{id:"bad",sellerId:brokerB,soldAt:"2026-10-05",status:"sold",premiumCents:10000})).status,403);
  const transferred=await post(admin,"/api/pilot/users/"+brokerB+"/supervisor",{supervisorId});
  assert.equal(transferred.status,200);
  assert.equal((await get(supervisor,"/api/commercial/sales?month="+period).then(r=>r.json())).sales.length,2);
  assert.equal((await get(solo,"/api/commercial/sales?month="+period).then(r=>r.json())).sales.length,1);
  assert.equal((await post(admin,"/api/pilot/users/"+solo.me.user.id+"/supervisor",{supervisorId})).status,404);
 }finally{
  await new Promise(resolve=>app.server.close(resolve));app.db.close();rmSync(dir,{recursive:true,force:true});
 }
});
