import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { scryptSync,createHmac } from "node:crypto";
import test from "node:test";

test("Prospect IA: authenticated Bun runtime and consent-safe campaigns",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"cvx-prospect-it-"));
 const port=18470;
 const base="http://127.0.0.1:"+port;
 const password="LocalTest!Only_2026";
 const salt="e82b3db763ae180a3b56de4a140cc303";
 const passHash=scryptSync(password,Buffer.from(salt,"hex"),32,{N:16384,r:8,p:1}).toString("hex");
 const env={...process.env,PORT:String(port),PROSPECT_DATA_DIR:dir,
  PROSPECT_ADMIN_EMAIL:"owner@example.invalid",
  PROSPECT_ADMIN_PASSWORD_SCRYPT:salt+":"+passHash,
  PROSPECT_SESSION_SECRET:"local-test-only-session-secret-please-do-not-deploy", META_APP_SECRET:"test_meta_app_secret",META_VERIFY_TOKEN:"test_meta_verify_token",META_PHONE_NUMBER_ID:"987654321"};
 const child=spawn("bun",["run",resolve("backend/prospect-standalone.ts")],{env,stdio:["ignore","pipe","pipe"]});
 let output="";
 child.stdout.on("data",x=>{output+=String(x).slice(0,500)});
 child.stderr.on("data",x=>{output+=String(x).slice(0,500)});
 const jsonHeaders={"Content-Type":"application/json","X-COMVERXA-Prospect":"1"};
 const mustJson=async(r,status)=>{if(r.status!==status)throw Error("HTTP "+r.status+" expected "+status+": "+await r.text());return r.json()};
 const post=async(path,data,cookie)=>fetch(base+path,{method:"POST",headers:{...jsonHeaders,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});
 try{
  let ok=false;
  for(let i=0;i<75;i++){
   if(child.exitCode!==null)break;
   try{const r=await fetch(base+"/healthz");if(r.ok){ok=true;break}}catch{}
   await new Promise(resolve=>setTimeout(resolve,150));
  }
  assert.ok(ok,"Bun startup failed: "+output);
  assert.equal((await fetch(base+"/healthz")).status,200);
  assert.equal((await fetch(base+"/captar")).status,200);
  assert.equal((await fetch(base+"/prospect-ia")).status,401);
  assert.equal((await fetch(base+"/api/master/prospect/overview")).status,401);
  assert.equal((await post("/api/master/prospect/leads",{name:"Bypass",phone:"5531999111100"})).status,401);

  let r=await fetch(base+"/captar",{method:"POST",body:new URLSearchParams({name:"Ana Teste",phone:"5531999990001",city:"Contagem",uf:"MG",product:"CRM para corretora"})});
  assert.equal(r.status,400,"Without express authorization a form must not capture");
  r=await fetch(base+"/captar",{method:"POST",body:new URLSearchParams({name:"Ana Teste",phone:"5531999990001",city:"Contagem",uf:"MG",product:"CRM para corretora",consent:"yes"})});
  assert.equal(r.status,200,"Own opted-in form must capture a lead");

  const invalid=await fetch(base+"/login",{method:"POST",body:new URLSearchParams({email:"owner@example.invalid",password:"wrong"})});
  assert.equal(invalid.status,401);
  r=await fetch(base+"/login",{method:"POST",redirect:"manual",body:new URLSearchParams({email:"owner@example.invalid",password})});
  assert.equal(r.status,303,"Valid owner login must issue session");
  const cookie=r.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("__Host-cvxprospect="),"Expected HttpOnly owner session cookie");
  assert.match(r.headers.get("set-cookie"),/HttpOnly/);
  assert.match(r.headers.get("set-cookie"),/SameSite=Strict/);
  assert.equal((await fetch(base+"/prospect-ia",{headers:{Cookie:cookie}})).status,200);

  let overview=await mustJson(await fetch(base+"/api/master/prospect/overview",{headers:{Cookie:cookie}}),200);
  assert.equal(overview.counts.total,1);
  assert.equal(overview.counts.opted,1);
  const create=await mustJson(await post("/api/master/prospect/leads",{name:"Sem Permissão",phone:"5531999990002",notes:"Pedido de cotação",consent:false},cookie),201);
  assert.ok(create.id);
  const duplicate=await mustJson(await post("/api/master/prospect/leads",{name:"Ana Teste",phone:"5531999990001",notes:"Cliente tem urgência em seguro",consent:false},cookie),201);
  assert.equal(duplicate.updated,true,"Duplicate phone should update without changing opt-out");
  overview=await mustJson(await fetch(base+"/api/master/prospect/overview",{headers:{Cookie:cookie}}),200);
  assert.equal(overview.counts.total,2);
  const scored=await mustJson(await post("/api/master/prospect/score",{},cookie),200);
  assert.equal(scored.updated,2);

  const before=await mustJson(await post("/api/master/prospect/campaigns",{name:"Campanha sem validacao",template_name:"test_approved_template"},cookie),201);
  assert.equal(before.queued,0,"Public form consent alone must not authorize a marketing send");
  const captured=(await mustJson(await fetch(base+"/api/master/prospect/leads",{headers:{Cookie:cookie}}),200)).items.find(x=>x.phone==="5531999990001");
  assert.ok(captured&&!captured.approved);
  assert.equal((await post("/api/master/prospect/leads/"+captured.id+"/approve",{verification:"fraca"},cookie)).status,400,"Approval must require evidence");
  const reviewed=await mustJson(await post("/api/master/prospect/leads/"+captured.id+"/approve",{verification:"Verificado pelo responsável em canal oficial com documento de opt-in."},cookie),200);
  assert.equal(reviewed.ok,true);
  const campaign=await mustJson(await post("/api/master/prospect/campaigns",{name:"Teste de consentimento",template_name:"test_approved_template"},cookie),201);
  assert.equal(campaign.queued,1,"Only verified opt-in lead can enter outgoing campaign");
  r=await post("/api/master/prospect/campaigns/"+campaign.id+"/send",{},cookie);
  assert.equal(r.status,503,"No Meta credentials => no real send");
  const ai=await post("/api/master/prospect/ai",{context:"Quero seguro do meu veículo ainda hoje, orçamento e assistência"},cookie);
  assert.equal(ai.status,503,"No OpenAI credentials => no simulated model answer");

  const leads=await mustJson(await fetch(base+"/api/master/prospect/leads",{headers:{Cookie:cookie}}),200);
  const ana=leads.items.find(x=>x.phone==="5531999990001");
  assert.ok(ana?.consent);
  const optout=await mustJson(await post("/api/master/prospect/leads/"+ana.id+"/optout",{},cookie),200);
  assert.equal(optout.ok,true);
  overview=await mustJson(await fetch(base+"/api/master/prospect/overview",{headers:{Cookie:cookie}}),200);
  assert.equal(overview.counts.opted,0);
  const campaigns=await mustJson(await fetch(base+"/api/master/prospect/campaigns",{headers:{Cookie:cookie}}),200);
  assert.equal(campaigns.items[0].pending,0,"Opt-out must remove queued sends");
  assert.equal((await fetch(base+"/api/master/prospect/leads",{headers:{Cookie:cookie}})).status,200);
  const handshake=await fetch(base+"/webhooks/meta?hub.mode=subscribe&hub.verify_token=test_meta_verify_token&hub.challenge=ABCD1234");
  assert.equal(handshake.status,200);
  assert.equal(await handshake.text(),"ABCD1234");
  assert.equal((await fetch(base+"/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=ABC")).status,403);
  const metaEvent=(phone,text)=>JSON.stringify({object:"whatsapp_business_account",entry:[{changes:[{field:"messages",value:{metadata:{phone_number_id:"987654321"},contacts:[{wa_id:phone,profile:{name:"Contato de Teste"}}],messages:[{from:phone,type:"text",text:{body:text}}]}}]}]});
  const signedPost=(raw,valid=true)=>fetch(base+"/webhooks/meta",{method:"POST",headers:{"Content-Type":"application/json","x-hub-signature-256":valid?"sha256="+createHmac("sha256","test_meta_app_secret").update(raw).digest("hex"):"sha256=00"},body:raw});
  const incoming=metaEvent("5531999990003","Quero cotação de seguro hoje, assistência 24 horas");
  assert.equal((await signedPost(incoming,false)).status,401,"Forged webhook must be rejected");
  assert.equal((await signedPost(incoming)).status,200,"Signed inbound event should be accepted");
  let inbound=(await mustJson(await fetch(base+"/api/master/prospect/leads",{headers:{Cookie:cookie}}),200)).items.find(l=>l.phone==="5531999990003");
  assert.ok(inbound&&!inbound.consent&&!inbound.approved,"Inbound conversations do not imply consent to mass advertising");
  assert.equal((await signedPost(metaEvent("5531999990003","SAIR"))).status,200);
  inbound=(await mustJson(await fetch(base+"/api/master/prospect/leads",{headers:{Cookie:cookie}}),200)).items.find(l=>l.phone==="5531999990003");
  assert.ok(inbound.opt_out&&!inbound.approved,"STOP must revoke all marketing permission");
  const logout=await fetch(base+"/logout",{method:"POST",headers:{Cookie:cookie},redirect:"manual"});
  assert.equal(logout.status,303,"Logout must succeed");
  assert.equal((await fetch(base+"/prospect-ia",{headers:{Cookie:cookie}})).status,401,"Logged-out cookie must be revoked server-side");
  console.log("PASS: health, capture, revocable owner auth, verified opt-in, score, deduplication, campaign, Meta/AI fail-closed, opt-out");
 }finally{
  child.kill("SIGTERM");
  await new Promise(resolve=>setTimeout(resolve,200));
  rmSync(dir,{recursive:true,force:true});
 }
});
