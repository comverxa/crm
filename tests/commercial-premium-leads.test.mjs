import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createLeadsStore} from "../backend/commercial-premium-leads.mjs";
import {createCommercialStore} from "../backend/commercial-premium-store.mjs";
import {createCommercialHttpHandler} from "../backend/commercial-premium-http.mjs";
const admin={tenantId:"company-A",userId:"admin-A",role:"admin"};
const agent={tenantId:"company-A",userId:"seller-A",role:"operator"};
const otherAgent={tenantId:"company-A",userId:"seller-other",role:"operator"};
const otherTenant={tenantId:"company-B",userId:"admin-B",role:"admin"};
const input={id:"L-001",sellerId:"seller-A",name:"Lead Teste",phone:"31 99999-1111",email:"lead@example.test",stage:"lead",source:"whatsapp",uf:"MG",nextFollowup:"2026-10-20",consentStatus:"unknown"};
test("leads use tenant isolation, DDD normalization, pipeline order and optimistic versioning",()=>{
 const db=new DatabaseSync(":memory:");try{
  const leads=createLeadsStore(db),lead=leads.create(admin,input);
  assert.equal(lead.tenantId,"company-A");assert.equal(lead.phone,"+5531999991111");assert.equal(lead.ddd,"31");
  assert.equal(leads.summary(admin,{today:"2026-10-29"}).followupsOverdue,1);
  assert.equal(leads.list(admin,{ddd:"31"}).length,1);
  assert.equal(leads.list(admin,{uf:"SP"}).length,0);
  assert.throws(()=>leads.get(otherTenant,lead.id),/Not found/);
  assert.throws(()=>leads.get(otherAgent,lead.id),/Not found/);
  const changed=leads.update(agent,lead.id,{expectedVersion:1,stage:"negotiation",temperature:"hot"});
  assert.equal(changed.version,2);assert.equal(changed.stage,"negotiation");
  const proposal=leads.update(agent,lead.id,{expectedVersion:2,stage:"proposal",nextFollowup:"2026-11-05"});
  assert.equal(proposal.stage,"proposal");
  assert.throws(()=>leads.update(agent,lead.id,{expectedVersion:1,stage:"won"}),/Version conflict/);
  assert.equal(leads.list(otherTenant).length,0);
  assert.throws(()=>leads.create(agent,{...input,id:"L-002",sellerId:"seller-other"}),/Forbidden/);
  assert.throws(()=>leads.create(admin,{...input,id:"L-001"}),/Duplicate lead/);
  assert.equal(leads.recordActivity(agent,lead.id,{type:"call",note:"Contato efetuado"}).recorded,true);
  assert.ok(leads.history(admin,lead.id).some(e=>e.event_type==="ACTIVITY_CALL"));
 }finally{db.close()}
});
test("CRM lead HTTP endpoints require server auth, same tenant, CSRF, support status filters",async()=>{
 const db=new DatabaseSync(":memory:");
 try{
  const store=createCommercialStore(db),leads=createLeadsStore(db);
  let s=admin,csrf=true;
  const app=createCommercialHttpHandler({store,leads,enabled:true,getSession:async()=>s,verifyCsrf:async()=>csrf});
  const get=path=>new Request("https://crm.test"+path);
  const post=(path,body)=>new Request("https://crm.test"+path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const create=await app(post("/api/commercial/leads",input));
  assert.equal(create.status,201);
  assert.equal((await create.json()).lead.id,"L-001");
  let x=await app(get("/api/commercial/leads?ddd=31"));
  assert.equal(x.status,200);assert.equal((await x.json()).leads.length,1);
  x=await app(get("/api/commercial/leads/summary"));assert.equal(x.status,200);assert.equal((await x.json()).total,1);
  csrf=false;
  assert.equal((await app(post("/api/commercial/leads/L-001",{expectedVersion:1,stage:"won"}))).status,403);
  csrf=true;s=otherTenant;
  assert.equal((await app(get("/api/commercial/leads/L-001"))).status,404);
  assert.equal((await app(get("/api/commercial/leads"))).status,200);
  assert.equal((await (await app(get("/api/commercial/leads"))).json()).leads.length,0);
  s=agent;
  x=await app(post("/api/commercial/leads/L-001",{expectedVersion:1,stage:"won"}));
  assert.equal(x.status,200);
  x=await app(get("/api/commercial/leads/summary"));assert.equal((await x.json()).byStage.won,1);
  x=await app(post("/api/commercial/leads/L-001",{expectedVersion:1,stage:"lost"}));
  assert.equal(x.status,409);
 }finally{db.close()}
});

test("bulk lead import skips duplicates, preserves tenant isolation and enforces ownership",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  const store=createLeadsStore(db);
  const lead={name:"Maria Teste",phone:"31999991111",email:"maria@example.test"};
  let x=store.importBatch(agent,[lead,lead,{name:"Carlos Teste",phone:"31988887777"},{name:"Sem telefone"}]);
  assert.deepEqual(x,{created:2,duplicates:1,invalid:1});
  assert.equal(store.list(agent).length,2);
  x=store.importBatch(agent,[lead]);
  assert.equal(x.duplicates,1);
  assert.equal(store.list(otherTenant).length,0);
  assert.throws(()=>store.importBatch(agent,[{...lead,sellerId:"seller-other"}]),/Forbidden/);
 }finally{db.close()}
});

test("batch import HTTP requires CSRF, rejects cross-tenant seller and skips duplicate contacts",async()=>{
 const db=new DatabaseSync(":memory:");
 try{
  const store=createCommercialStore(db),leads=createLeadsStore(db);
  let session=agent,csrf=false;
  const app=createCommercialHttpHandler({store,leads,enabled:true,getSession:async()=>session,verifyCsrf:async()=>csrf});
  const post=items=>new Request("https://crm.test/api/commercial/leads/import",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({items})});
  const rows=[{name:"Contato Um",phone:"31999990001"},{name:"Contato Dois",phone:"31999990002"}];
  assert.equal((await app(post(rows))).status,403);
  csrf=true;
  let response=await app(post(rows));assert.equal(response.status,200);assert.equal((await response.json()).created,2);
  response=await app(post(rows));assert.equal((await response.json()).duplicates,2);
  assert.equal(leads.list(agent).length,2);
  session=otherTenant;response=await app(post([{name:"Outro Cliente",phone:"31999990001"}]));
  assert.equal((await response.json()).created,1);
  assert.equal(leads.list(agent).length,2);
  session=agent;response=await app(post([{name:"Não autorizado",sellerId:"seller-other",phone:"31999990003"}]));
  assert.equal(response.status,403);
 }finally{db.close()}
});
