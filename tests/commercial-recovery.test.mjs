import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createPremiumServer} from "../backend/commercial-premium-server.mjs";
import {createRecoveryMailer} from "../backend/commercial-premium-mail.mjs";
const originalPassword="DemoRecoveryPassword-123456";
const adminEmail="recovery@exemplo.test";
async function setup(options={}){
 const dir=mkdtempSync(join(tmpdir(),"cvx-reset-"));
 const app=createPremiumServer({dbPath:join(dir,"pilot.sqlite"),bootstrapEmail:adminEmail,
  bootstrapPassword:originalPassword,cookieSecure:false,...options});
 await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
 const base="http://127.0.0.1:"+app.server.address().port;
 return {app,dir,base,close:async()=>{await app.close();rmSync(dir,{recursive:true,force:true})}};
}
const post=(base,path,body)=>fetch(base+path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
test("password recovery: no enumeration, single-use tokens and session revocation",async()=>{
 let clock=Date.parse("2026-10-30T01:00:00.000Z"),sent=[];
 const x=await setup({now:()=>clock,sendRecoveryEmail:async mail=>{sent.push(mail);return {accepted:true}}});
 try{
  let r=await post(x.base,"/api/auth/login",{email:adminEmail,password:originalPassword});
  assert.equal(r.status,200);const cookie=r.headers.get("set-cookie").split(";")[0];
  const before=await(await fetch(x.base+"/api/auth/me",{headers:{cookie}})).json();
  assert.equal(before.mustChangePassword,true);
  r=await post(x.base,"/api/auth/forgot",{email:"missing@exemplo.test"});
  assert.equal(r.status,202);assert.equal(sent.length,0);
  r=await post(x.base,"/api/auth/forgot",{email:adminEmail});
  assert.equal(r.status,202);assert.equal(sent.length,1);assert.equal(sent[0].to,adminEmail);
  const url=new URL(sent[0].resetUrl),token=url.searchParams.get("token");
  assert.equal(url.origin,"https://comverxa-comercial-piloto-production.up.railway.app");
  assert.match(token,/^[A-Za-z0-9_-]{40,100}$/);
  assert.equal((await fetch(x.base+"/reset?token="+token)).status,200);
  assert.equal((await fetch(x.base+"/assets/commercial-recovery.js")).status,200);
  r=await post(x.base,"/api/auth/reset",{token,newPassword:"new"});
  assert.equal(r.status,400);
  r=await post(x.base,"/api/auth/reset",{token,newPassword:"NewRecoveryPassword-123456"});
  assert.equal(r.status,200);
  r=await post(x.base,"/api/auth/reset",{token,newPassword:"AnotherRecoveryPassword-123"});
  assert.equal(r.status,400);
  r=await fetch(x.base+"/api/auth/me",{headers:{cookie}});
  assert.equal(r.status,401);
  assert.equal((await post(x.base,"/api/auth/login",{email:adminEmail,password:originalPassword})).status,401);
  assert.equal((await post(x.base,"/api/auth/login",{email:adminEmail,password:"NewRecoveryPassword-123456"})).status,200);
 }finally{await x.close()}
});
test("expired recovery token fails closed and no link is returned in response",async()=>{
 let clock=Date.parse("2026-10-30T01:00:00.000Z"),sent=[];
 const x=await setup({now:()=>clock,sendRecoveryEmail:async mail=>{sent.push(mail)}});
 try{
  const response=await post(x.base,"/api/auth/forgot",{email:adminEmail});
  assert.equal(response.status,202);
  const body=await response.text();assert.ok(!body.includes("token"));
  clock+=16*60*1000;
  const token=new URL(sent[0].resetUrl).searchParams.get("token");
  const fail=await post(x.base,"/api/auth/reset",{token,newPassword:"ValidButExpiredPassword-123"});
  assert.equal(fail.status,400);
 }finally{await x.close()}
});
test("Resend adapter uses verified sender configuration and never exposes API key",async()=>{
 let payload,headers,url;
 const sender=createRecoveryMailer({apiKey:"re_fake_testing_key_not_real",from:"COMVERXA <no-reply@comverxa.com.br>",fetchImpl:async(u,options)=>{
  url=u;headers=options.headers;payload=JSON.parse(options.body);return new Response('{"id":"test"}',{status:200});
 }});
 const result=await sender({to:"admin@exemplo.test",resetUrl:"https://pilot.example/reset?token=secretvalue"});
 assert.equal(result.accepted,true);
 assert.equal(url,"https://api.resend.com/emails");
 assert.equal(payload.to[0],"admin@exemplo.test");
 assert.ok(payload.subject.includes("COMVERXA"));
 assert.ok(headers.Authorization.startsWith("Bearer re_fake"));
 assert.throws(()=>createRecoveryMailer({apiKey:"bad",from:"noreply@exemplo.test"}),/not configured/);
});
