import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import vm from "node:vm";
import {createPremiumServer} from "../backend/commercial-premium-server.mjs";

class MockElement {
 constructor(tag="span"){
  this.tagName=tag;this.type=tag==="input"?"password":undefined;this.attributes=new Map();
  this.events=new Map();this.children=[];this.parentNode=null;this.value="";
  this.classList={add:(value)=>{this.className=(this.className?this.className+" ":"")+value}};
 }
 append(...items){
  for(const item of items){
   if(item.parentNode)item.parentNode.removeChild(item);
   this.children.push(item);item.parentNode=this;
  }
 }
 removeChild(item){const pos=this.children.indexOf(item);if(pos>=0)this.children.splice(pos,1);item.parentNode=null}
 insertBefore(item,before){
  if(item.parentNode)item.parentNode.removeChild(item);
  const pos=this.children.indexOf(before);
  if(pos<0)throw Error("Invalid test insertion");
  this.children.splice(pos,0,item);item.parentNode=this;
 }
 setAttribute(k,v){this.attributes.set(k,String(v))}
 getAttribute(k){return this.attributes.get(k)||null}
 hasAttribute(k){return this.attributes.has(k)}
 addEventListener(k,fn){const listeners=this.events.get(k)||[];listeners.push(fn);this.events.set(k,listeners)}
 dispatch(k){for(const fn of this.events.get(k)||[])fn({type:k,currentTarget:this})}
 closest(selector){
  let cursor=this.parentNode;
  while(cursor){
   if(selector===".cvx-password-wrap"&&cursor.className==="cvx-password-wrap")return cursor;
   cursor=cursor.parentNode;
  }
  return null;
 }
}
test("eye icon toggles original password input without clearing content or submitting forms",()=>{
 const script=readFileSync(new URL("../site/comverxa-premium-password.js",import.meta.url),"utf8");
 const form=new MockElement("form"),label=new MockElement("label"),input=new MockElement("input");
 input.form=form;input.value="Sample-Complex-Password#9";label.append(input);
 const ignoredLabel=new MockElement("label"),ignored=new MockElement("input");
 ignored.setAttribute("data-no-password-toggle","");
 ignoredLabel.append(ignored);
 const document={
  readyState:"complete",
  querySelectorAll:selector=>{assert.equal(selector,'input[type="password"]');return [input,ignored]},
  createElement:tag=>new MockElement(tag),
  createElementNS:(ns,tag)=>{assert.equal(ns,"http://www.w3.org/2000/svg");return new MockElement(tag)}
 };
 vm.runInNewContext(script,{document},{timeout:1000});
 assert.equal(input.parentNode.className,"cvx-password-wrap");
 assert.equal(ignored.parentNode,ignoredLabel,"existing webhook token reveal must not be modified");
 const toggle=input.parentNode.children.find(x=>x.tagName==="button");
 assert.ok(toggle);
 assert.equal(toggle.type,"button");
 assert.equal(toggle.getAttribute("aria-label"),"Mostrar senha");
 assert.equal(toggle.getAttribute("aria-pressed"),"false");
 assert.equal(input.type,"password");
 toggle.dispatch("click");
 assert.equal(input.type,"text");
 assert.equal(toggle.getAttribute("aria-label"),"Ocultar senha");
 assert.equal(toggle.getAttribute("aria-pressed"),"true");
 assert.equal(input.value,"Sample-Complex-Password#9");
 toggle.dispatch("click");
 assert.equal(input.type,"password");
 assert.equal(toggle.getAttribute("aria-label"),"Mostrar senha");
 toggle.dispatch("click");form.dispatch("reset");
 assert.equal(input.type,"password","form reset hides a previously revealed password");
 assert.equal(toggle.getAttribute("aria-pressed"),"false");
});
test("login, recovery and authenticated application serve eye-toggle JS and CSS",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"cvx-eye-ui-")),dbPath=join(dir,"db.sqlite");
 const app=createPremiumServer({
  dbPath,bootstrapEmail:"test@example.test",
  bootstrapPassword:"StrongPassword-123456!",cookieSecure:false
 });
 try{
  await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+app.server.address().port;
  for(const route of ["/login","/reset","/forgot"]){
   const page=await fetch(base+route);
   assert.equal(page.status,200);
   const html=await page.text();
   assert.ok(html.includes("/assets/commercial-password.js"),route+" must load toggle");
   assert.ok(html.includes("/assets/commercial-password.css"),route+" must load styles");
  }
  for(const [route,ctype] of [
   ["/assets/commercial-password.js","text/javascript"],
   ["/assets/commercial-password.css","text/css"]
  ]){
   const asset=await fetch(base+route);
   assert.equal(asset.status,200);
   assert.match(asset.headers.get("content-type")||"",new RegExp(ctype));
   assert.ok((await asset.text()).includes("cvx-password-"));
  }
  let login=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
   email:"test@example.test",password:"StrongPassword-123456!"
  })});
  assert.equal(login.status,200);
  const cookie=login.headers.get("set-cookie").split(";")[0];
  const page=await fetch(base+"/app",{headers:{cookie}});
  assert.equal(page.status,200);
  const html=await page.text();
  assert.ok(html.includes("/assets/commercial-password.js"));
  assert.ok(html.includes("/assets/commercial-password.css"));
  assert.ok(html.includes('name="oldPassword" type="password"'));
  assert.ok(html.includes('name="adminPassword" type="password"'));
 }finally{await app.close();rmSync(dir,{recursive:true,force:true})}
});
