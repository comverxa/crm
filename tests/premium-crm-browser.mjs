import fs from "node:fs";
import assert from "node:assert/strict";
import {chromium} from "playwright-core";
const source=fs.readFileSync("backend/premium-crm-ui.js","utf8");
function grab(name){
 const line=source.split("\n").find(x=>x.startsWith("const "+name+"="));
 assert.ok(line,name+" missing");
 return JSON.parse(line.slice(("const "+name+"=").length,-1));
}
const css=grab("cxPremiumCSS"),script=grab("cxPremiumJS");
assert.ok(css.includes("@media(max-width:600px)"));
assert.ok(css.includes("grid-template-columns:minmax(0,1fr)"));
assert.ok(script.includes("MutationObserver"));
const browser=await chromium.launch({headless:true,executablePath:"/usr/bin/google-chrome",args:["--no-sandbox"]});
try{
 for(const size of [
  {width:390,height:844,name:"iPhone"},
  {width:768,height:1024,name:"tablet"},
  {width:1440,height:900,name:"desktop"}
 ]){
  const page=await browser.newPage({viewport:{width:size.width,height:size.height}});
  let errors=[];page.on("pageerror",e=>errors.push(e.message));
  const response=await page.goto("https://app.comverxa.com.br/",{waitUntil:"domcontentloaded"});
  assert.equal(response.status(),200,size.name+" app status");
  await page.addStyleTag({content:css});
  await page.evaluate(src=>{const e=document.createElement("script");e.textContent=src;document.body.append(e)},script);
  await page.evaluate(()=>{
   document.querySelector("#marketing")?.classList.add("hide");
   const app=document.querySelector("#app");app.classList.remove("hide");
   document.querySelectorAll("#app .screen").forEach(el=>el.classList.add("hide"));
   document.getElementById("dashboard").classList.remove("hide");
   document.getElementById("dashboardStats").innerHTML=[
    ["Leads cadastrados","1"],["Negociações","0"],["Vendas ganhas","0"],["Follow-ups vencidos","0"]
   ].map(x=>'<div class="stat"><small>'+x[0]+'</small><b>'+x[1]+'</b></div>').join("");
  });
  await page.waitForTimeout(150);
  const d=await page.evaluate(()=>{
   const cards=[...document.querySelectorAll("#dashboardStats .stat")];
   return {documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,
    columns:getComputedStyle(document.getElementById("dashboardStats")).gridTemplateColumns,
    cards:cards.map(x=>({x:x.getBoundingClientRect().x,width:x.getBoundingClientRect().width,y:x.getBoundingClientRect().y})),
    leadCTA:document.querySelector("#dashboard>.panel button")?.textContent?.trim()};
  });
  assert.ok(d.documentWidth<=size.width+3,"Full page overflow in "+size.name+": "+JSON.stringify(d));
  assert.equal(d.cards.length,4);
  assert.equal(d.leadCTA,"Adicionar novo lead",size.name+" smart CTA");
  if(size.name==="iPhone"){
   assert.ok(d.cards[1].y>d.cards[0].y+30,"iPhone cards should stack vertically");
   assert.ok(d.cards[0].width<=size.width-20,"iPhone card too wide");
  }else if(size.name==="desktop"){
   assert.ok(Math.abs(d.cards[0].y-d.cards[1].y)<3,"Desktop should display grid");
  }
  await page.evaluate(()=>{document.querySelector("#dashboardStats .stat b").textContent="0"});
  await page.waitForTimeout(80);
  assert.equal(await page.locator("#dashboard>.panel button").textContent(),"Adicionar primeiro lead");
  if(errors.length)throw Error(size.name+" script errors "+errors.join("; "));
  console.log("PASS | "+size.name+" | responsive grid and dynamic lead CTA | "+JSON.stringify({width:d.documentWidth,columns:d.columns}));
  await page.close();
 }
}finally{await browser.close()}
console.log("PASS | premium UI mock-browser tests; no customer account or records used");
