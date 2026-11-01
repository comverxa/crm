import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomBytes,scryptSync} from "node:crypto";
import {createServer} from "node:net";
const port=await new Promise((resolve,reject)=>{const s=createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p))});s.on("error",reject)});
const salt=randomBytes(16).toString("hex"),password="OwnerVeryStrongPassword2026!",email="owner@example.test";
const hash=salt+":"+scryptSync(password,Buffer.from(salt,"hex"),64).toString("hex");
const origin="https://admin.example.test";
const child=spawn(process.execPath,["backend/owner-control-center.mjs"],{env:{...process.env,PORT:String(port),CVX_OWNER_EMAIL:email,CVX_OWNER_PASSWORD_HASH:hash,CVX_OWNER_ORIGIN:origin},stdio:"pipe"});
const endpoint="http://127.0.0.1:"+port;
async function waitReady(){for(let i=0;i<40;i++){if(child.exitCode!==null)throw Error("Process exited");try{if((await fetch(endpoint+"/healthz")).ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw Error("Control Center not ready")}
test("owner panel login is isolated, access controlled and rejects invalid origin",async t=>{
 t.after(()=>child.kill());
 await waitReady();
 const unauth=await fetch(endpoint+"/owner");assert.equal(unauth.status,200);assert.match(await unauth.text(),/Área exclusiva/);
 const forbidden=await fetch(endpoint+"/owner/login",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","origin":"https://untrusted.test"},body:new URLSearchParams({email,password})});assert.equal(forbidden.status,403);
 const denied=await fetch(endpoint+"/owner/login",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded",origin},body:new URLSearchParams({email,password:"wrong"})});assert.equal(denied.status,401);
 const allowed=await fetch(endpoint+"/owner/login",{method:"POST",redirect:"manual",headers:{"content-type":"application/x-www-form-urlencoded",origin},body:new URLSearchParams({email,password})});
 assert.equal(allowed.status,303);
 assert.match(allowed.headers.get("set-cookie"),/HttpOnly; Secure; SameSite=Strict/);
 const cookie=allowed.headers.get("set-cookie").split(";")[0];
 const dashboard=await fetch(endpoint+"/owner",{headers:{cookie}});assert.equal(dashboard.status,200);assert.match(await dashboard.text(),/Administração comercial privativa/);
 const tenant=await fetch(endpoint+"/api/platform/companies",{headers:{cookie}});assert.equal(tenant.status,404);
 const logout=await fetch(endpoint+"/owner/logout",{method:"POST",redirect:"manual",headers:{cookie,origin}});
 assert.equal(logout.status,303);
 const postLogout=await fetch(endpoint+"/owner",{headers:{cookie}});assert.match(await postLogout.text(),/Área exclusiva/);
});
