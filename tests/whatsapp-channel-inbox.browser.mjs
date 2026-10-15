import fs from "node:fs";
import assert from "node:assert/strict";
import {chromium} from "playwright-core";
const addon=fs.readFileSync("backend/whatsapp-channel-inbox.js","utf8");
const browser=await chromium.launch({headless:true,executablePath:"/usr/bin/google-chrome",args:["--no-sandbox"]});
try{
 const page=await browser.newPage({viewport:{width:1365,height:768}});
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
 await button.click();
 assert.deepEqual(await page.evaluate(()=>window.__qaCalls),["text"],"QR text send dispatched to existing backend API only after click");
 await page.evaluate(()=>{
  leads[0].line=1;selected={id:1,name:"Lead fictício de QA",phone:"5531000000000",line:1};
  document.getElementById("chatHeader").textContent="Lead fictício de QA - Meta";
 });
 await page.waitForTimeout(120);
 assert.equal(await button.textContent(),"Enviar pela Meta API");
 assert.equal(await page.locator("#cvx-inbox-change-line").isVisible(),true);
 await page.locator("#cvx-inbox-change-line").click();
 const state=await page.evaluate(()=>({modal:document.getElementById("leadModal")?.open,selectedLine:document.getElementById("leadForm")?.elements?.line?.value,leadLine:leads[0].line,sendCalls:window.__qaCalls.length}));
 assert.equal(state.modal,true,"Existing lead edit form opened, not auto-updated");
 assert.equal(state.selectedLine,"2","QR line is suggested in lead editor");
 assert.equal(state.leadLine,1,"No lead data changed automatically");
 assert.equal(state.sendCalls,1,"No new message sent on editor open");
 console.log("PASS | Evolution QR / Meta selection, safe editing, no automatic reassignment or sends");
 await page.close();
}finally{await browser.close()}
