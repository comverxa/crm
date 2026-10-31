import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
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
 }finally{
  professional?.db.close();enterprise?.db.close();
  rmSync(dir,{recursive:true,force:true});
 }
});
