import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {chromium} from "playwright-core";
const target="https://app.comverxa.com.br/";
const code=readFileSync("backend/mass-send-cost-estimator.js","utf8");
assert.ok(!/\bfetch\(|sendText\(|\.submit\(/.test(code),"Modulo nao deve fazer chamadas diretas ao fornecedor: utilizar apenas API autenticada existente.");
new Function(code); // syntax check
const browser=await chromium.launch({headless:true,executablePath:"/usr/bin/google-chrome",args:["--no-sandbox"]});
try{
 const page=await browser.newPage({viewport:{width:1365,height:830}});
 // Validate the candidate module before updating production. It will supersede the deployed read-only widget for this synthetic browser session.
 await page.addInitScript({content:code});
 const res=await page.goto(target,{waitUntil:"domcontentloaded",timeout:25000});
 assert.equal(res.status(),200);
 let html=await res.text();
 assert.match(html,/cvx-disparo-orcamento/,"Script nao incluido na resposta real do CRM.");
 assert.match(html,/__cvxQrAssistedQueueInstalled/,"Fila assistida QR nao incluida no HTML publicado do CRM.");
 assert.ok(html.includes("Disparador em massa (WhatsApp QR)"),"Botão de disparo ainda não incluído no HTML de produção.");
 assert.ok(html.includes("async function sendBatch("),"Lote QR autenticado ainda não publicado.");
 await page.evaluate(()=>{const app=document.getElementById("app")||document.createElement("div");app.id="app";app.hidden=false;app.classList.remove("hide","hidden");app.style.setProperty("display","block","important");app.style.setProperty("visibility","visible","important");app.innerHTML='<nav class="tabs"></nav><section class="screen" id="campaigns"><h2>Campanhas</h2><div class="actions"></div></section>';if(!app.isConnected)document.body.appendChild(app);app.querySelector("nav.tabs").style.setProperty("display","flex","important");});
 await page.waitForSelector("#app .cvx-bgt-launch",{timeout:9000});
 const launch=page.locator("#app .cvx-bgt-launch").first();
 assert.match(await launch.textContent(),/Disparador em massa/,"Botão visível no menu");
 await launch.click();
 assert.equal(await page.locator("#cvx-bgt-rtotal").innerText(),"R$ 0,00");
 await page.locator("#cvx-bgt-rate").fill("0,20");
 assert.equal(await page.locator("#cvx-bgt-rtotal").innerText(),"R$ 10,00");
 await page.locator("#cvx-bgt-fixed").fill("5");
 assert.equal(await page.locator("#cvx-bgt-rtotal").innerText(),"R$ 15,00");
 await page.locator("#cvx-bgt-balance").fill("3");
 assert.equal(await page.locator("#cvx-bgt-rneed").innerText(),"R$ 12,00");
 await page.locator("#cvx-bgt-channel").selectOption("meta");
 assert.equal(await page.locator("#cvx-bgt-kind-label").isVisible(),true);
 assert.equal(await page.locator("#cvx-bgt-rate").inputValue(),"0,3217");
 assert.equal(await page.locator("#cvx-bgt-rtotal").innerText(),"R$ 21,09");
 await page.keyboard.press("Escape");
 assert.equal(await page.locator("#cvx-bgt-rpeople").count(),1);
 assert.equal(await page.locator(".cvx-bgt-back").isHidden(),true);
 // Contatos ficticios apenas no navegador sem autenticacao, nunca no backend.
 await page.evaluate(()=>{
  if(!Array.isArray(leads)||!Array.isArray(lines))throw new Error("CRM session arrays unavailable");
  leads.push({id:960001,name:"Contato QA Um",stage:"novo",line:2,phone:"00000000001"});
  leads.push({id:960002,name:"Contato QA Dois",stage:"proposta",line:2,phone:"00000000002"});
  lines.push({slot:2,name:"Linha QA QR",mode:"qr"});
 });
 await page.locator("#app .cvx-bgt-launch").first().click();
 await page.locator("#cvx-budget-contacts").waitFor({state:"attached",timeout:8000});
 const details=page.locator("#cvx-budget-contacts");
 if(!(await details.evaluate(node=>node.open)))await page.locator("#cvx-budget-contacts > summary").click();
 assert.equal(await details.evaluate(node=>node.open),true,"Seletor de leads do disparador deve abrir diretamente");
 await page.locator("#cvx-bc-line").selectOption("2");
 assert.equal(await page.locator("#cvx-bc-list .cvx-contact-row").count(),2);
 await page.locator("#cvx-bc-list input[type='checkbox']").first().check();
 assert.equal(await page.locator("#cvx-bgt-people").inputValue(),"1");
 await page.locator("#cvx-bc-list input[type='checkbox']").nth(1).check();
 assert.equal(await page.locator("#cvx-bgt-people").inputValue(),"2");
 await page.locator("#cvx-bgt-channel").selectOption("qr");
 await page.locator("#cvx-bgt-rate").fill("0,50");
 await page.locator("#cvx-bgt-fixed").fill("0");
 await page.locator("#cvx-bgt-balance").fill("0");
 assert.equal(await page.locator("#cvx-bgt-rtotal").innerText(),"R$ 1,00");
 await page.locator("#cvx-bc-msg").fill("Olá, {nome}!");
 assert.equal(await page.locator("#cvx-bc-preview").innerText(),"Olá, Contato QA Um!");
 await page.locator("#cvx-bc-clear").click();
 assert.equal(await page.locator("#cvx-bgt-people").inputValue(),"0");
 assert.equal(await page.locator("#cvx-bgt-rtotal").innerText(),"R$ 0,00");

 // Fila QR assistida: somente registros com consentimento, nao dispara automaticamente.
 await page.evaluate(()=>{
  const a=leads.find(l=>l.id===960001),b=leads.find(l=>l.id===960002);
  a.optin=1;b.optin=0;delete a.consent;delete b.consent;
 });
 await page.locator("#cvx-bc-select-all").click();
 await page.locator("#cvx-qa-line").selectOption("2");
 await page.locator("#cvx-qa-build").click();
 assert.match(await page.locator("#cvx-qa-summary").innerText(),/1 contatos aptos/);
 assert.match(await page.locator("#cvx-qa-summary").innerText(),/1 sem autorização registrada/);
 assert.equal(await page.locator("#cvx-qa-list .cvx-qa-row").count(),1);
 assert.equal(await page.locator("#cvx-qa-review").isVisible(),true,"Unapproved leads should have an actionable review control");
 assert.equal(await page.locator('[data-review-lead-id="960002"]').count(),1,"Show review beside the blocked lead");
 assert.equal(await page.evaluate(()=>window.__cvxQrOptinTrue("0")),false,"Textual zero must not count as consent");
 await page.locator("#cvx-qa-review").click();
 assert.equal(await page.locator("#cvx-budget-contacts").evaluate(n=>n.open),true);
 await page.evaluate(()=>{
  window.__qaReview=[];
  window.editLead=(id)=>window.__qaReview.push({action:"edit",id});
  window.switchTab=(tab)=>window.__qaReview.push({action:"tab",tab});
 });
 await page.locator('[data-review-lead-id="960002"]').click();
 assert.deepEqual(await page.evaluate(()=>window.__qaReview),[{action:"tab",tab:"leads"},{action:"edit",id:960002}]);
 assert.equal(await page.locator(".cvx-bgt-back").isHidden(),true,"Review closes campaign without sending");
 await page.locator("#app .cvx-bgt-launch").first().click();
 assert.equal(await page.locator("#cvx-bc-count").innerText(),"2 destinatários selecionados","Selection should survive editor navigation");
 await page.locator("#cvx-bc-msg").fill("Olá, {nome}! Mensagem de teste.");
 await page.evaluate(()=>{
  window.__qaOpenCalls=[];
  if(!document.getElementById("replyText")){const reply=document.createElement("textarea");reply.id="replyText";document.getElementById("app").append(reply)}
  window.openThread=async(id)=>{window.__qaOpenCalls.push(id)};
 });
 await page.locator("#cvx-qa-next").click();
 const opened=await page.evaluate(()=>window.__qaOpenCalls);
 assert.deepEqual(opened,[960001]);
 assert.equal(await page.locator("#replyText").inputValue(),"Olá, Contato QA Um! Mensagem de teste.");
 assert.match(await page.locator("#cvx-qa-summary").innerText(),/Nenhum envio foi iniciado/);

 // Uma campanha real so pode ser iniciada com opt-in verificado no app e
 // confirmacao expressa. TODAS as chamadas abaixo sao mocks locais do Chrome.
 await page.evaluate(()=>{
  const second=leads.find(l=>l.id===960002);second.optin=1;
  window.__qaSendRequests=[];window.__qaPrompts=[];
  window.api=async(path,method,payload)=>{
   if(path==="/api/me")return {user:{id:1},company:{status:"active"}};
   if(path==="/api/lines")return {items:lines};
   if(path==="/api/leads")return {items:leads};
   if(path.endsWith("/send")){
    window.__qaSendRequests.push({path,body:payload.message});
    return {ok:true};
   }
   throw Error("Mock route prohibited");
  };
  window.prompt=text=>{window.__qaPrompts.push(text);return "ENVIAR 2"};
 });
 await page.locator("#cvx-qa-build").click();
 assert.match(await page.locator("#cvx-qa-summary").innerText(),/2 contatos aptos/);
 // A budget set to Meta must never trigger a QR campaign.
 await page.locator("#cvx-bgt-channel").selectOption("meta");
 await page.locator("#cvx-qa-send").click();
 assert.match(await page.locator("#cvx-qa-summary").innerText(),/selecione WhatsApp por QR/);
 assert.equal(await page.evaluate(()=>window.__qaSendRequests.length),0,"Mode mismatch cannot send");
 await page.locator("#cvx-bgt-channel").selectOption("qr");
 await page.locator("#cvx-qa-send").click();
 await page.waitForFunction(()=>window.__qaSendRequests?.length===1,{timeout:12000});
 assert.equal(await page.locator("#cvx-qa-build").isDisabled(),true,"Cannot rebuild queue while sending");
 assert.equal(await page.locator("#cvx-qa-line").isDisabled(),true,"Cannot change QR line while sending");
 await page.waitForFunction(()=>window.__qaSendRequests?.length===2,{timeout:20000});
 const result=await page.evaluate(()=>({posts:window.__qaSendRequests,prompts:window.__qaPrompts}));
 assert.equal(result.posts.length,2);
 assert.deepEqual(result.posts.map(x=>x.path),["/api/inbox/960001/send","/api/inbox/960002/send"]);
 assert.match(result.posts[0].body,/Contato QA Um/);
 assert.equal(result.prompts.length,1);
 await page.locator("#cvx-qa-send").waitFor({state:"visible"});
 await page.waitForFunction(()=>document.querySelector("#cvx-qa-send")?.disabled===true);
 console.log("PASS | QR consented mini-batch 2 mocks; 0 HTTP writes to real CRM.");



 console.log("PASS: modal/QR/Meta, 50 destinatarios, 0/10/15/21.09 BRL, saldo 3, Escape. Sem uso de contas reais.");
}finally{await browser.close();}
