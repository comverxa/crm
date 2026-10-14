import {chromium} from "playwright-core";
import assert from "node:assert/strict";
const base="https://comverxa.github.io/crm/";
const browser=await chromium.launch({headless:true,executablePath:"/usr/bin/google-chrome",args:["--no-sandbox"]});
let problems=[];
for(const size of [{width:390,height:844,name:"iPhone"},{width:1440,height:900,name:"Desktop"}]){
 const page=await browser.newPage({viewport:size,deviceScaleFactor:1});
 const pageErrors=[];page.on("pageerror",e=>pageErrors.push(String(e)));
 try{
  const response=await page.goto(base,{waitUntil:"domcontentloaded",timeout:30000});
  assert.equal(response.status(),200,size.name+" site must load");
  await page.locator("#hero-title").waitFor();
  assert.ok((await page.locator("#hero-title").textContent()).includes("Seu CRM movimenta negócios"));
  const metrics=await page.evaluate(()=>({outer:document.documentElement.scrollWidth,inner:innerWidth,body:document.body.scrollWidth}));
  assert.ok(metrics.outer<=metrics.inner+3,size.name+" page overflow "+JSON.stringify(metrics));
  const cta=page.getByRole("link",{name:/começar teste grátis/i}).first();
  assert.ok(await cta.isVisible(),size.name+" trial CTA invisible");
  const demo=page.getByRole("link",{name:/Solicitar demonstração por e-mail/i});
  assert.ok(await demo.count(),size.name+" demo CTA missing");
  assert.ok((await demo.first().getAttribute("href")).startsWith("mailto:"));
  const customerLinks=await page.locator('a[href="./acesso.html"]').count();
  assert.ok(customerLinks>=1,size.name+" customer access links missing");
  const links=await page.locator('a[href="./privacidade.html"],a[href="./termos.html"]').count();
  assert.ok(links>=2,size.name+" legal links absent");
  if(size.name==="iPhone"){
   const menu=page.locator("#menu-toggle");assert.ok(await menu.isVisible());
   await menu.click();assert.equal(await menu.getAttribute("aria-expanded"),"true");
   const nav=page.locator("#primary-nav");assert.ok(await nav.isVisible());
   const mobileCustomer=nav.locator('a[href="./acesso.html"]');assert.ok(await mobileCustomer.isVisible(),"Customer access must be visible in expanded mobile menu");
   await menu.click();assert.equal(await menu.getAttribute("aria-expanded"),"false");
  }
  await page.locator("#avaliacao").scrollIntoViewIfNeeded();
  const plan=page.locator("#cx-plan-form");
  assert.ok(await plan.count(),"plan suitability form absent");
  if(pageErrors.length)throw Error("Browser errors: "+pageErrors.join(" | ").slice(0,1000));
  console.log("PASS | "+size.name+" page responsive, lead CTA, plan evaluation and legal links");
 }catch(error){problems.push(size.name+": "+error.message)}
 finally{await page.close()}
}
for(const relative of ["privacidade.html","termos.html","acesso.html"]){
 const page=await browser.newPage({viewport:{width:375,height:812}});
 try{
  const response=await page.goto(base+relative,{waitUntil:"domcontentloaded",timeout:30000});
  assert.equal(response.status(),200);
  const dimensions=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(dimensions.width<=dimensions.viewport+3,relative+" overflow "+JSON.stringify(dimensions));
  assert.ok(await page.locator("h1").isVisible());
  if(relative==="acesso.html"){
   const signIn=page.locator("#login-btn");
   assert.ok(await signIn.isVisible());
   assert.equal(await signIn.getAttribute("href"),"https://app.comverxa.com.br/");
  }
  console.log("PASS | "+relative+" legal page mobile");
 }catch(e){problems.push(relative+": "+e.message)}
 finally{await page.close()}
}
await browser.close();
if(problems.length){problems.forEach(x=>console.error("FAIL | "+x));process.exit(1)}
console.log("PASS | COMVERXA marketing responsive browser tests");
