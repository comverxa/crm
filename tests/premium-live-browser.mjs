import {chromium} from "playwright-core";
import assert from "node:assert/strict";
const base="https://app.comverxa.com.br/";
const browser=await chromium.launch({headless:true,executablePath:"/usr/bin/google-chrome",args:["--no-sandbox"]});
try{
 for(const size of [{width:390,height:844,name:"iPhone"},{width:1440,height:900,name:"desktop"}]){
  const page=await browser.newPage({viewport:{width:size.width,height:size.height}});
  const response=await page.goto(base,{waitUntil:"domcontentloaded",timeout:30000});
  assert.equal(response.status(),200,"Live CRM should load");
  assert.ok(await page.locator("#comverxa-premium-v2").count(),"Premium stylesheet not deployed");
  assert.ok(await page.locator("#comverxa-premium-v2-js").count(),"Premium JS not deployed");
  assert.equal(response.headers()["x-content-type-options"],"nosniff");
  assert.equal(response.headers()["x-frame-options"],"DENY");
  await page.evaluate(()=>{
   document.getElementById("marketing")?.classList.add("hide");
   document.getElementById("app").classList.remove("hide");
   document.querySelectorAll("#app .screen").forEach(node=>node.classList.add("hide"));
   document.getElementById("dashboard").classList.remove("hide");
   document.getElementById("dashboardStats").innerHTML=[
    ["Leads cadastrados","1"],["Negociações","0"],["Vendas ganhas","0"],["Follow-ups vencidos","0"]
   ].map(x=>'<div class="stat"><small>'+x[0]+'</small><b>'+x[1]+'</b></div>').join("");
  });
  await page.waitForTimeout(150);
  const d=await page.evaluate(()=>({
   doc:document.documentElement.scrollWidth,vw:innerWidth,
   cards:[...document.querySelectorAll("#dashboardStats .stat")].map(x=>({x:x.getBoundingClientRect().x,y:x.getBoundingClientRect().y,width:x.getBoundingClientRect().width})),
   label:document.querySelector("#dashboard>.panel button")?.textContent?.trim()
  }));
  assert.ok(d.doc<=d.vw+3,size.name+" layout extends outside viewport: "+JSON.stringify(d));
  assert.equal(d.label,"Adicionar novo lead",size.name+" lead button");
  if(size.name==="iPhone")assert.ok(d.cards[1].y>d.cards[0].y+30,"Cards should stack vertically");
  console.log("PASS | "+size.name+" CRM production rendering | "+JSON.stringify({document:d.doc,viewport:d.vw,label:d.label}));
  await page.close();
 }
}finally{await browser.close()}
