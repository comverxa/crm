import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {chromium} from "playwright-core";
const target="https://app.comverxa.com.br/";
const code=readFileSync("backend/mass-send-cost-estimator.js","utf8");
assert.ok(!/fetch\(|sendText\(|\.submit\(/.test(code),"Estimador nao deve realizar envios nem chamadas HTTP.");
new Function(code); // syntax check
const browser=await chromium.launch({headless:true,executablePath:"/usr/bin/google-chrome",args:["--no-sandbox"]});
try{
 const page=await browser.newPage({viewport:{width:1365,height:830}});
 const res=await page.goto(target,{waitUntil:"domcontentloaded",timeout:25000});
 assert.equal(res.status(),200);
 let html=await res.text();
 assert.match(html,/cvx-disparo-orcamento/,"Script nao incluido na resposta real do CRM.");
 await page.evaluate(()=>{const app=document.getElementById("app")||document.createElement("div");app.id="app";app.hidden=false;app.classList.remove("hide","hidden");app.style.setProperty("display","block","important");app.style.setProperty("visibility","visible","important");app.innerHTML='<nav class="tabs"></nav><section class="screen" id="campaigns"><h2>Campanhas</h2><div class="actions"></div></section>';if(!app.isConnected)document.body.appendChild(app);app.querySelector("nav.tabs").style.setProperty("display","flex","important");});
 await page.waitForSelector("#app .cvx-bgt-launch",{timeout:9000});
 await page.locator("#app .cvx-bgt-launch").first().click();
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
  leads.push({id:960001,name:"Contato QA Um",stage:"novo",line:2});
  leads.push({id:960002,name:"Contato QA Dois",stage:"proposta",line:2});
  lines.push({slot:2,name:"Linha QA QR",mode:"qr"});
 });
 await page.locator("#app .cvx-bgt-launch").first().click();
 await page.locator("#cvx-budget-contacts").waitFor({state:"attached",timeout:8000});
 await page.locator("#cvx-budget-contacts > summary").click();
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

 console.log("PASS: modal/QR/Meta, 50 destinatarios, 0/10/15/21.09 BRL, saldo 3, Escape. Sem uso de contas reais.");
}finally{await browser.close();}
