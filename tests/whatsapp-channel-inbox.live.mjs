import assert from "node:assert/strict";
import {chromium} from "playwright-core";
const browser=await chromium.launch({headless:true,executablePath:"/usr/bin/google-chrome",args:["--no-sandbox"]});
try{
 const page=await browser.newPage({viewport:{width:1365,height:840}});
 const mutations=[];
 page.on("request",r=>{if(["POST","PUT","DELETE"].includes(r.method()))mutations.push({method:r.method(),path:new URL(r.url()).pathname})});
 const response=await page.goto("https://app.comverxa.com.br/",{waitUntil:"domcontentloaded",timeout:30000});
 assert.equal(response.status(),200,"CRM real must load");
 assert.equal(await page.locator("#cvx-inbox-channel-patch").count(),1,"Channel-aware script absent in real production");
 const productionHtml=await response.text();
 assert.ok(productionHtml.includes("cvx-wa-connection-hub-v1"),"Central de conexão WhatsApp QR/Meta não foi publicada");
 assert.ok(productionHtml.includes("async function cvxQrStatusAutoRefresh()"),"Consulta automática real do estado QR não publicada");
 await page.locator(".cvx-wa-launch").first().waitFor({state:"attached",timeout:9000});

 await page.evaluate(()=>{
   document.querySelector("#marketing")?.classList.add("hide");
   document.querySelector("#app")?.classList.remove("hide");
   document.querySelectorAll("#app .screen").forEach(x=>x.classList.add("hide"));
   document.getElementById("inbox").classList.remove("hide");
   lines=[{slot:1,name:"Meta QA",mode:"api"},{slot:2,name:"Evolution QR QA",mode:"qr"}];
   leads=[{id:999123,name:"Lead QA fictício",phone:"5531000000000",line:2}];
   document.getElementById("lineSelect").innerHTML='<option value="1">Meta QA</option><option value="2">Evolution QR QA</option>';
   selected={id:999123,name:"Lead QA fictício",phone:"5531000000000",line:1};
   document.getElementById("chatHeader").textContent="Lead QA Evolution";
 });
 await page.waitForTimeout(170);
 const textButton=page.locator('#inbox button[onclick="sendReply(\'text\')"]');
 assert.equal(await textButton.textContent(),"Enviar pela Evolution API (QR)");
 assert.equal(await page.evaluate(()=>selected.line),2,"Open thread must reconcile to saved QR line");
 assert.equal(await page.locator('#inbox button[onclick="sendReply(\'template\')"]').isVisible(),false,"QR hides Meta templates");
 await page.evaluate(()=>{
   leads[0].line=1;selected={id:999123,name:"Lead QA fictício",phone:"5531000000000",line:1};
   document.getElementById("chatHeader").textContent="Lead QA Meta";
 });
 await page.waitForTimeout(170);
 assert.equal(await textButton.textContent(),"Enviar pela Meta API");
 const edit=page.locator("#cvx-inbox-change-line");
 assert.equal(await edit.evaluate(el=>el.hidden),false,"QR reassignment action offered");
 await page.evaluate(()=>document.getElementById("cvx-inbox-change-line").click());
 const state=await page.evaluate(()=>({open:document.getElementById("leadModal").open,pending:document.getElementById("leadForm").elements.line.value,unchanged:leads.find(x=>x.id===999123)?.line}));
 assert.equal(state.open,true,"Lead editor should open");
 assert.equal(state.pending,"2","Evolution QR line should be suggested");
 assert.equal(state.unchanged,1,"Lead record must remain untouched before Save");
 assert.deepEqual(mutations,[],"Read-only synthetic UI QA must never write to production");
 console.log("PASS | Live CRM: Evolution QR button, Meta differentiation, safe edit and zero production writes");
 await page.close();
}finally{await browser.close()}
