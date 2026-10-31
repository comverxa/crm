import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createPremiumServer} from "../backend/commercial-premium-server.mjs";

test("Professional and Enterprise run as isolated services with distinct databases and logins",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"comverxa-independent-"));
 let professional,enterprise;
 const password="SecureBootstrapPass2026!";
 const base="https://crm-test.example";
 const req=(path,options={})=>new Request(base+path,options);
 const get=(app,path,cookie="")=>app.handler(req(path,{headers:cookie?{cookie}:{}}));
 const login=(app,portal,email)=>app.handler(req("/api/"+portal+"/auth/login",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({email,password})
 }));
 try{
  professional=createPremiumServer({
   dbPath:join(dir,"professional.sqlite"),bootstrapEmail:"professional@example.test",
   bootstrapPassword:password,bootstrapTenant:"bootstrap-professional",
   portalMode:"individual",enablePlatformMaster:true,cookieSecure:false
  });
  enterprise=createPremiumServer({
   dbPath:join(dir,"enterprise.sqlite"),bootstrapEmail:"enterprise@example.test",
   bootstrapPassword:password,bootstrapTenant:"bootstrap-enterprise",
   portalMode:"enterprise",enablePlatformMaster:true,cookieSecure:false
  });
  assert.equal(professional.db.prepare("SELECT product_mode AS mode FROM cvx_pilot_tenants WHERE id='bootstrap-professional'").get().mode,"individual");
  assert.equal(enterprise.db.prepare("SELECT product_mode AS mode FROM cvx_pilot_tenants WHERE id='bootstrap-enterprise'").get().mode,"enterprise");
  assert.equal((await get(professional,"/healthz")).status,200);
  assert.equal((await get(enterprise,"/healthz")).status,200);
  assert.equal((await get(professional,"/")).headers.get("location"),base+"/profissional/login");
  assert.equal((await get(enterprise,"/")).headers.get("location"),base+"/empresa/login");
  assert.equal((await get(professional,"/profissional/login")).status,200);
  assert.equal((await get(enterprise,"/empresa/login")).status,200);
  assert.equal((await get(professional,"/empresa/login")).status,404);
  assert.equal((await get(enterprise,"/profissional/login")).status,404);
  assert.equal((await get(professional,"/login")).status,404);
  assert.equal((await get(enterprise,"/login")).status,404);
  assert.equal((await get(professional,"/api/empresa/auth/me")).status,404);
  assert.equal((await get(enterprise,"/api/profissional/auth/me")).status,404);
  assert.equal((await get(professional,"/api/auth/me")).status,404);
  const individualLogin=await login(professional,"profissional","professional@example.test");
  const enterpriseLogin=await login(enterprise,"empresa","enterprise@example.test");
  assert.equal(individualLogin.status,200);
  assert.equal(enterpriseLogin.status,200);
  const professionalCookie=individualLogin.headers.get("set-cookie").split(";")[0];
  const enterpriseCookie=enterpriseLogin.headers.get("set-cookie").split(";")[0];
  assert.match(professionalCookie,/^cvx_professional_session=/);
  assert.match(enterpriseCookie,/^cvx_enterprise_session=/);
  const meIndividual=await get(professional,"/api/profissional/auth/me",professionalCookie);
  const meEnterprise=await get(enterprise,"/api/empresa/auth/me",enterpriseCookie);
  assert.equal((await meIndividual.json()).user.productMode,"individual");
  assert.equal((await meEnterprise.json()).user.productMode,"enterprise");
  const readyIndividual=await get(professional,"/api/profissional/pilot/readiness",professionalCookie);
  const readyEnterprise=await get(enterprise,"/api/empresa/pilot/readiness",enterpriseCookie);
  assert.equal(readyIndividual.status,200);
  assert.equal(readyEnterprise.status,200);
  const individualReadiness=await readyIndividual.json(),enterpriseReadiness=await readyEnterprise.json();
  assert.equal(individualReadiness.readyForCommercialRelease,false);
  assert.equal(enterpriseReadiness.readyForCommercialRelease,false);
  assert.equal(individualReadiness.service,"individual");
  assert.equal(enterpriseReadiness.service,"enterprise");
  assert.equal(individualReadiness.checks.find(x=>x.key==="payment").state,"pending");
  assert.equal((await get(enterprise,"/api/empresa/pilot/readiness")).status,401);
  assert.equal((await get(professional,"/api/empresa/pilot/readiness",professionalCookie)).status,404);
  assert.equal((await get(professional,"/api/profissional/auth/me",enterpriseCookie)).status,401);
  assert.equal((await get(enterprise,"/api/empresa/auth/me",professionalCookie)).status,401);
  assert.equal((await login(professional,"empresa","professional@example.test")).status,404);
  assert.equal((await login(enterprise,"profissional","enterprise@example.test")).status,404);
  const me=await get(professional,"/api/profissional/auth/me",professionalCookie).then(r=>r.json());
  const forbidden=await professional.handler(req("/api/profissional/platform/companies",{
   method:"POST",headers:{"content-type":"application/json",cookie:professionalCookie,"x-csrf-token":me.csrf},
   body:JSON.stringify({
    tenantId:"wrong-product",companyName:"Empresa Errada",productMode:"enterprise",
    plan:"business",seatLimit:8,adminEmail:"wrong@example.test",adminPassword:password
   })
  }));
  assert.equal(forbidden.status,403);
  assert.equal(professional.db.prepare("SELECT count(*) AS total FROM cvx_pilot_tenants WHERE id='wrong-product'").get().total,0);
  // A Professional account can configure sales tiers and bonuses, never a
  // collective target. Enterprise must retain its independent team target.
  const individualSession={tenantId:"bootstrap-professional",userId:me.user.id,role:me.user.role,productMode:"individual"};
  const enterpriseMe=await get(enterprise,"/api/empresa/auth/me",enterpriseCookie).then(r=>r.json());
  const corporateSession={tenantId:"bootstrap-enterprise",userId:enterpriseMe.user.id,role:enterpriseMe.user.role,productMode:"enterprise"};
  const commissionRules={tiers:[{minSales:0,bonusCents:0},{minSales:10,bonusCents:25000},{minSales:20,bonusCents:50000}],
   salesRateBps:1000,activationRateBps:500,recurringRateBps:200,teamTargetSales:40};
  const personal=professional.store.saveRules(individualSession,commissionRules);
  const corporate=enterprise.store.saveRules(corporateSession,commissionRules);
  assert.equal(personal.teamTargetSales,null);
  assert.equal(professional.store.getRules(individualSession).teamTargetSales,null);
  assert.equal(corporate.teamTargetSales,40);
  assert.equal(enterprise.store.getRules(corporateSession).teamTargetSales,40);
  const storedPersonal=JSON.parse(professional.db.prepare("SELECT rules_json FROM cvx_comm_rules WHERE tenant_id=?").get(individualSession.tenantId).rules_json);
  assert.equal(storedPersonal.teamTargetSales,null);
  professional.store.upsertSale(individualSession,{
   id:"personal-sale-1",sellerId:individualSession.userId,soldAt:"2026-10-30",status:"sold",premiumCents:15000
  });
  const summary=professional.store.snapshot(individualSession,{month:"2026-10",asOf:"2026-10-30"});
  assert.equal(summary.counts.sold,1);
  assert.equal(summary.target.nextMinSales,10);
  assert.equal(summary.target.remaining,9);
  assert.equal(summary.target.completionPct,10);
  assert.throws(()=>professional.store.teamSummary(individualSession,{month:"2026-10",asOf:"2026-10-30"}),/Forbidden/);
  assert.equal(enterprise.store.listSales(corporateSession,"2026-10").length,0);
 }finally{
  professional?.db.close();enterprise?.db.close();
  rmSync(dir,{recursive:true,force:true});
 }
});


test("Commercial period defaults to the local calendar rather than UTC",()=>{
 const script=readFileSync(new URL("../site/comverxa-premium-operacional.js",import.meta.url),"utf8");
 const match=script.match(/function localDateYmd\(date=new Date\(\)\)\{[\s\S]*?\n\}/);
 assert.ok(match,"The browser calendar formatter must be defined");
 const localDateYmd=runInNewContext(match[0]+";localDateYmd",{Date});
 const localDate=(year,month,day)=>({getFullYear:()=>year,getMonth:()=>month-1,getDate:()=>day});
 assert.equal(localDateYmd(localDate(2026,10,31)),"2026-10-31");
 assert.equal(localDateYmd(localDate(2026,11,1)),"2026-11-01");
 assert.ok(script.includes('period=localDateYmd().slice(0,7)'),"The active period must use local time");
 assert.ok(script.includes('const asOf=localDateYmd()'),"Dashboard as-of date must use local time");
});
