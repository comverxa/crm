import { chromium } from "playwright-core";
const browser=await chromium.launch({headless:true,executablePath:"/usr/bin/google-chrome",args:["--no-sandbox"]});
try{
 const page=await browser.newPage({viewport:{width:1365,height:860}});
 const response=await page.goto("https://app.comverxa.com.br/",{waitUntil:"domcontentloaded",timeout:25000});
 const data=await page.evaluate(()=>{
  const app=document.querySelector("#app"),form=document.querySelector("#campaignForm"),sec=document.querySelector("#campaigns");
  const picks=document.querySelectorAll("input[type=checkbox],input[type=radio]");
  const handlers={};
  for(const fn of ["createCampaign","saveCampaign","renderCampaigns","renderCampaignList","openCampaign","createQueue","sendCampaign"]){const f=window[fn];if(typeof f==="function") handlers[fn]=String(f).slice(0,1500)}
  const s=[...document.querySelectorAll("script")].filter(x=>!x.src).map(x=>x.textContent||"");
  const idx=s.map((x,i)=>({i,len:x.length,hasCampaign:x.includes("campaignForm"),hasBatch:x.includes("/api/campaigns")})).filter(x=>x.hasCampaign||x.hasBatch);
  const panels=[...document.querySelectorAll("#campaigns input,#campaigns select,#campaigns button,#campaigns textarea")].map(x=>({tag:x.tagName,type:x.type,name:x.name,id:x.id,action:(x.getAttribute("onclick")||"").slice(0,80),text:(x.textContent||"").slice(0,85)}));
  return {httpSnippet:location.pathname,appExists:!!app,sectionExists:!!sec,sectionMarkup:sec?.outerHTML.slice(0,9000)||null,formExists:!!form,campaignControls:panels,inlineScripts:idx,functions:handlers,checkboxCount:picks.length,globalNames:["leads","campaigns","lines"].map(n=>{try{return {name:n,kind:eval("typeof "+n)}}catch{return {name:n,kind:"unknown"}}})};
 });
 console.log("CAMPAIGN_DIAGNOSTICS_SAFE\n"+JSON.stringify({status:response.status(),...data},null,2));
}finally{await browser.close()}