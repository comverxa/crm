import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
 const env={...process.env,PORT:String(port),PROSPECT_DATA_DIR:dir,PROSPECT_PUBLIC_CAPTURE_ENABLED:"true",
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
  assert.equal((await fetch(base+"/api/master/prospect/export.csv")).status,401);
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


  // Commercial pipeline, 2 companies' leads are not implied: this is admin-only prospect module.
  let metrics=await mustJson(await fetch(base+"/api/master/prospect/overview",{headers:{Cookie:cookie}}),200);
  assert.equal(metrics.performance.won,0);
  assert.equal(metrics.performance.lost,0);
  assert.ok(metrics.regions.some(x=>x.uf==="MG"&&x.leads===1));
  assert.equal((await post("/api/master/prospect/leads/"+create.id+"/pipeline",{stage:"perdido"},cookie)).status,400,"Loss reason required");
  assert.equal((await post("/api/master/prospect/leads/"+create.id+"/pipeline",{stage:"other"},cookie)).status,400,"Unknown stage refused");
  assert.equal((await post("/api/master/prospect/leads/"+create.id+"/pipeline",{stage:"perdido",loss_reason:"Escolheu concorrente"})).status,401,"Anon cannot change pipeline");
  assert.equal((await fetch(base+"/api/master/prospect/leads/"+create.id+"/pipeline",{method:"POST",headers:{Cookie:cookie,"Content-Type":"application/json"},body:JSON.stringify({stage:"perdido",loss_reason:"Escolheu concorrente"})})).status,403,"CSRF required");
  assert.equal((await post("/api/master/prospect/leads/"+create.id+"/pipeline",{stage:"perdido",loss_reason:"Sem retorno",ad_spend_brl:"11,25",ad_campaign:"Meta Outubro"},cookie)).status,200,"Valid loss and ad spend");
  const win=(await mustJson(await fetch(base+"/api/master/prospect/leads",{headers:{Cookie:cookie}}),200)).items.find(x=>x.phone==="5531999990001");
  assert.equal((await post("/api/master/prospect/leads/"+win.id+"/pipeline",{stage:"ganho",sale_brl:"200,00",ad_spend_brl:"20.75",ad_campaign:"Google Pesquisa"},cookie)).status,200);
  metrics=await mustJson(await fetch(base+"/api/master/prospect/overview",{headers:{Cookie:cookie}}),200);
  assert.equal(metrics.performance.won,1);
  assert.equal(metrics.performance.lost,1);
  assert.equal(metrics.performance.revenue_cents,20000);
  assert.equal(metrics.performance.ad_spend_cents,3200);
  assert.equal((await post("/api/master/prospect/leads/"+win.id+"/pipeline",{stage:"proposta"},cookie)).status,200,"Negotiation followed by proposal stage");
  metrics=await mustJson(await fetch(base+"/api/master/prospect/overview",{headers:{Cookie:cookie}}),200);
  assert.equal(metrics.performance.proposals,1);
  assert.equal(metrics.performance.revenue_cents,0,"Unclosed deals do not count as revenue");
  assert.equal(metrics.performance.ad_spend_cents,3200,"Cost persists after stage change");
  assert.equal((await post("/api/master/prospect/leads/999999/pipeline",{stage:"contato"},cookie)).status,404);

  // Consistent database snapshot: authenticated only, CSRF header enforced.
  assert.equal((await post("/api/master/prospect/backup",{})).status,401,"Anon must not download backup");
  assert.equal((await fetch(base+"/api/master/prospect/backup",{method:"POST",headers:{Cookie:cookie}})).status,403,"Missing CSRF header must block backup");
  const backupRes=await post("/api/master/prospect/backup",{},cookie);
  assert.equal(backupRes.status,200,"Owner should download a consistent SQLite backup");
  assert.match(backupRes.headers.get("content-disposition")||"",/attachment/);
  assert.match(backupRes.headers.get("cache-control")||"",/no-store/);
  const backup=Buffer.from(await backupRes.arrayBuffer());
  assert.equal(backup.subarray(0,15).toString(),"SQLite format 3","Backup must contain SQLite header");
  const backupPath=join(dir,"backup-verified.sqlite");
  writeFileSync(backupPath,backup);
  const checkedBackup=spawnSync("bun",["-e",
    "import {Database} from 'bun:sqlite';const db=new Database(process.argv[1],{readonly:true});if(db.query('PRAGMA integrity_check').get().integrity_check!=='ok'||db.query('SELECT COUNT(*) AS n FROM prospect_leads').get().n!==2)process.exit(7);db.close();",backupPath],{encoding:"utf8"});
  assert.equal(checkedBackup.status,0,"SQLite restore verification failed: "+checkedBackup.stderr);

  const csvResponse=await fetch(base+"/api/master/prospect/export.csv",{headers:{Cookie:cookie}});
  assert.equal(csvResponse.status,200,"CSV export requires authenticated owner");
  assert.ok((csvResponse.headers.get("content-type")||"").includes("text/csv"));
  assert.match(csvResponse.headers.get("content-disposition")||"",/attachment/);
  assert.equal(csvResponse.headers.get("cache-control"),"private, no-store");
  const csvBytes=Buffer.from(await csvResponse.arrayBuffer());
  assert.deepEqual([...csvBytes.subarray(0,3)],[0xef,0xbb,0xbf],"UTF-8 CSV BOM expected");
  const csvText=csvBytes.toString("utf8");
  assert.match(csvText,/Sem Permissão/);
  assert.match(csvText,/consentimento/);

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

  // LGPD: owner can export a single lead and erase it only with explicit matching confirmation.
  const ownerExport=await fetch(base+"/api/master/prospect/leads/"+create.id+"/export",{headers:{Cookie:cookie}});
  assert.equal(ownerExport.status,200,"Owner export should succeed");
  assert.match(ownerExport.headers.get("cache-control")||"",/no-store/);
  const individual=await ownerExport.json();
  assert.equal(individual.lead.id,create.id);
  assert.equal(individual.lead.name,"Sem Permissão");
  assert.equal((await fetch(base+"/api/master/prospect/leads/"+create.id+"/export")).status,401,"Anon export must be blocked");
  assert.equal((await post("/api/master/prospect/leads/"+create.id+"/erase",{confirmation:"EXCLUIR "+create.id,request_basis:"titular"})).status,401,"Anon erasure must be blocked");
  assert.equal((await fetch(base+"/api/master/prospect/leads/"+create.id+"/erase",{method:"POST",headers:{"Cookie":cookie,"Content-Type":"application/json"},body:'{"confirmation":"EXCLUIR 1","request_basis":"titular"}'})).status,403,"CSRF without header must fail");
  assert.equal((await post("/api/master/prospect/leads/"+create.id+"/erase",{confirmation:"EXCLUIR 999",request_basis:"titular"},cookie)).status,400,"Mismatched confirmation must fail");
  assert.equal((await post("/api/master/prospect/leads/"+create.id+"/erase",{confirmation:"EXCLUIR "+create.id,request_basis:"invalid"},cookie)).status,400,"Invalid justification must fail");
  const erased=await mustJson(await post("/api/master/prospect/leads/"+create.id+"/erase",{confirmation:"EXCLUIR "+create.id,request_basis:"titular"},cookie),200);
  assert.equal(erased.erased_id,create.id);
  assert.equal((await fetch(base+"/api/master/prospect/leads/"+create.id+"/export",{headers:{Cookie:cookie}})).status,404,"Erased contact must be absent");
  assert.equal((await post("/api/master/prospect/leads/"+create.id+"/erase",{confirmation:"EXCLUIR "+create.id,request_basis:"titular"},cookie)).status,404,"Repeated erasure should not be silent");

  const logout=await fetch(base+"/logout",{method:"POST",headers:{Cookie:cookie},redirect:"manual"});
  assert.equal(logout.status,303,"Logout must succeed");
  assert.equal((await fetch(base+"/prospect-ia",{headers:{Cookie:cookie}})).status,401,"Logged-out cookie must be revoked server-side");
  assert.equal((await post("/api/master/prospect/backup",{},cookie)).status,401,"Revoked session must not download backup");
  console.log("PASS: health, capture, revocable owner auth, verified opt-in, score, deduplication, campaign, Meta/AI fail-closed, opt-out");
 }finally{
  child.kill("SIGTERM");
  await new Promise(resolve=>setTimeout(resolve,200));
  rmSync(dir,{recursive:true,force:true});
 }
});
