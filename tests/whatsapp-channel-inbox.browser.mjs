import fs from "node:fs";
import assert from "node:assert/strict";
import {chromium} from "playwright-core";
const addon=fs.readFileSync("backend/whatsapp-channel-inbox.js","utf8");
const browser=await chromium.launch({headless:true,executablePath:"/usr/bin/google-chrome",args:["--no-sandbox"]});
try{
 const page=await browser.newPage({viewport:{width:1365,height:768}});
 await page.route("https://app.comverxa.com.br/",async route=>{
   const remote=await route.fetch();
   const html=await remote.text();
   const marker=/<script id="cvx-inbox-channel-patch">[\s\S]*?<\/script>/;
   assert.ok(marker.test(html),"production patch marker missing");
   await route.fulfill({response:remote,body:html.replace(marker,()=>'<script id="cvx-inbox-channel-patch">'+addon+'</script>')});
 });
 const response=await page.goto("https://app.comverxa.com.br/",{waitUntil:"domcontentloaded",timeout:30000});
 assert.equal(response.status(),200);
 await page.evaluate(()=>{
  document.querySelector("#marketing")?.classList.add("hide");
  document.querySelector("#app")?.classList.remove("hide");
  document.querySelectorAll("#app .screen").forEach(x=>x.classList.add("hide"));
  document.getElementById("inbox").classList.remove("hide");
  selected={id:1,name:"Lead fictício de QA",phone:"5531000000000",line:1};
  lines=[{slot:1,name:"Linha Meta",mode:"api"},{slot:2,name:"QR Evolution Teste",mode:"qr"}];
  leads=[{id:1,name:"Lead fictício de QA",phone:"5531000000000",line:2}];
  document.getElementById("lineSelect").innerHTML='<option value="1">Meta</option><option value="2">Evolution QR</option>';
  window.__qaCalls=[];
  window.sendReply=(t)=>{window.__qaCalls.push(t)};
 });
 if(!(await page.locator("#cvx-inbox-channel-patch").count()))await page.addScriptTag({content:addon});
 await page.evaluate(()=>{document.getElementById("chatHeader").textContent="Lead QA Evolution inicial";});
 await page.waitForTimeout(120);
 const button=page.locator('#inbox button[onclick="sendReply(\'text\')"]');
 await assert.equal(await button.textContent(),"Enviar pela Evolution API (QR)");
 assert.equal(await page.evaluate(()=>selected.line),2,"Stale thread line must synchronize from saved lead");
 assert.equal(await page.locator('#inbox button[onclick="sendReply(\'template\')"]').isVisible(),false,"Meta template hidden in QR mode");
 await page.evaluate(()=>sendReply("text")); // synthetic handler; never sends to production
 assert.deepEqual(await page.evaluate(()=>window.__qaCalls),["text"],"QR text send dispatched to existing backend API only after click");
 await page.evaluate(()=>{
  leads[0].line=1;selected={id:1,name:"Lead fictício de QA",phone:"5531000000000",line:1};
  document.getElementById("chatHeader").textContent="Lead fictício de QA - Meta";
 });
 await page.waitForTimeout(120);
 assert.equal(await button.textContent(),"Enviar pela Meta API");
 assert.equal(await page.locator("#cvx-inbox-change-line").evaluate(el=>el.hidden),false,"QR reassignment action offered");
 await page.evaluate(()=>document.getElementById("cvx-inbox-change-line").click());
 const state=await page.evaluate(()=>({modal:document.getElementById("leadModal")?.open,selectedLine:document.getElementById("leadForm")?.elements?.line?.value,leadLine:leads[0].line,sendCalls:window.__qaCalls.length}));
 assert.equal(state.modal,true,"Existing lead edit form opened, not auto-updated");
 assert.equal(state.selectedLine,"2","QR line is suggested in lead editor");
 assert.equal(state.leadLine,1,"No lead data changed automatically");
 assert.equal(state.sendCalls,1,"No new message sent on editor open");

 // Connection center is a read-only view over this company's authenticated API.
 // All network results below are synthetic — do not pair numbers or send messages.
 await page.evaluate(()=>{
  window.__qaConnectionCalls=[];window.__qaNav=[];
  window.api=async(path,method="GET")=>{
   window.__qaConnectionCalls.push({path,method});
   if(method!=="GET")throw Error("Connection center attempted to write data");
   if(path==="/api/lines")return {qrGatewayReady:true,webhookConfigured:false,items:[
    {slot:1,name:"Meta oficial QA",mode:"api",configured:true,meta_phone_id:"QA123"},
    {slot:2,name:"Evolution QR QA",mode:"qr"}
   ]};
   if(path==="/api/lines/2/qr/status")return {connected:true,message:"Conectado"};
   throw Error("Unexpected read-only route "+path);
  };
  window.switchTab=dest=>window.__qaNav.push(dest);
 });
 await page.locator(".cvx-wa-launch").first().waitFor({state:"visible",timeout:8000});
 await page.locator(".cvx-wa-launch").first().click();
 await page.waitForFunction(()=>document.getElementById("cvx-wa-hub-summary")?.textContent.includes("2 linhas encontradas"));
 assert.match(await page.locator("#cvx-wa-hub-summary").innerText(),/1 QR conectada/);
 assert.match(await page.locator("#cvx-wa-hub-lines").innerText(),/Meta configurada · webhook pendente/);
 assert.equal(await page.locator("#cvx-wa-hub-lines .cvx-wa-line").count(),2);
 assert.ok(!(await page.locator("#cvx-wa-hub-lines").innerText()).includes("QA123"),"Phone Number ID must not appear in status summary");
 assert.deepEqual(await page.evaluate(()=>window.__qaConnectionCalls.map(x=>x.path)),["/api/lines","/api/lines/2/qr/status"]);
 await page.locator("#cvx-wa-hub-lines .cvx-wa-line").first().getByRole("button",{name:"Abrir configuração Meta"}).click();
 assert.deepEqual(await page.evaluate(()=>window.__qaNav),["lines"]);
 assert.equal(await page.locator("#cvx-wa-connection-hub-v1").isHidden(),true);
 await page.locator(".cvx-wa-launch").first().click();
 await page.waitForFunction(()=>document.getElementById("cvx-wa-hub-lines")?.querySelectorAll(".cvx-wa-line").length===2);
 await page.locator("#cvx-wa-hub-lines .cvx-wa-line").nth(1).getByRole("button",{name:"Abrir conexão QR"}).click();
 assert.deepEqual(await page.evaluate(()=>window.__qaNav),["lines","waweb"]);
 assert.equal((await page.evaluate(()=>window.__qaConnectionCalls)).every(x=>x.method==="GET"),true);

 console.log("PASS | Evolution QR / Meta selection, safe editing, read-only connection status, no automatic reassignment or sends");
 await page.close();
}finally{await browser.close()}
