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
 await page.evaluate(()=>{document.getElementById("app")?.remove();const app=document.createElement("div");app.id="app";app.innerHTML='<nav class="tabs"></nav><section class="screen" id="campaigns"><h2>Campanhas</h2><div class="actions"></div></section>';document.body.appendChild(app);});
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
 console.log("PASS: modal/QR/Meta, 50 destinatarios, 0/10/15/21.09 BRL, saldo 3, Escape. Sem uso de contas reais.");
}finally{await browser.close();}
