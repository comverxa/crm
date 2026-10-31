import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createPremiumServer} from "../backend/commercial-premium-server.mjs";

test("Bootstrap recovery is single-use, preserves records and never overrides an activated password", async () => {
 const dir=mkdtempSync(join(tmpdir(),"cvx-recover-")), dbPath=join(dir,"professional.sqlite");
 const firstPass="TemporarySecurePass2026-A!", resetPass="TemporarySecurePass2026-B!";
 const normalPass="PermanentSecurePass2026-C!", alternate="TemporarySecurePass2026-D!";
 const email="initial@example.test";
 const create=(password,token=null)=>createPremiumServer({
  dbPath,bootstrapEmail:email,bootstrapPassword:password,bootstrapTenant:"bootstrap-professional",
  portalMode:"individual",enablePlatformMaster:true,cookieSecure:false,
  publicOrigin:"https://professional.example.test",bootstrapResetToken:token
 });
 const post=(app,path,body,cookie=null,csrf=null)=>app.handler(new Request("https://professional.example.test"+path,{
  method:"POST",headers:{"content-type":"application/json",...(cookie?{cookie}:{}),...(csrf?{"x-csrf-token":csrf}:{})},
  body:JSON.stringify(body)
 }));
 const login=(app,password)=>post(app,"/api/profissional/auth/login",{email,password});
 const me=(app,cookie)=>app.handler(new Request("https://professional.example.test/api/profissional/auth/me",{headers:{cookie}}));
 let app;
 try{
  app=create(firstPass);
  app.db.exec("CREATE TABLE cvx_recovery_canary (id TEXT PRIMARY KEY)");
  app.db.prepare("INSERT INTO cvx_recovery_canary VALUES(?)").run("preserve-me");
  assert.equal((await login(app,firstPass)).status,200);
  app.db.close();app=null;

  const token="single_use_bootstrap_reset_token_2026_0001";
  app=create(resetPass,token);
  assert.equal(app.db.prepare("SELECT COUNT(*) AS n FROM cvx_recovery_canary").get().n,1);
  assert.equal((await login(app,firstPass)).status,401);
  let signedIn=await login(app,resetPass);
  assert.equal(signedIn.status,200);
  let cookie=signedIn.headers.get("set-cookie").split(";")[0];
  let profile=await (await me(app,cookie)).json();
  assert.equal(profile.mustChangePassword,true);
  // Regression: the first-login account can choose its dashboard type
  // without disabling the required password rotation for business access.
  const saved=await post(app,"/api/profissional/auth/profile",{professionalType:"executive"},cookie,profile.csrf);
  assert.equal(saved.status,200);
  assert.equal((await saved.json()).professionalType,"executive");
  const refreshed=await (await me(app,cookie)).json();
  assert.equal(refreshed.user.professionalType,"executive");
  assert.equal(refreshed.mustChangePassword,true);
  assert.equal((await post(app,"/api/profissional/auth/profile",{professionalType:"broker"},cookie,"invalid-csrf")).status,403);
  assert.equal((await post(app,"/api/profissional/auth/profile",{professionalType:"director"},cookie,profile.csrf)).status,400);
  const protectedApi=await app.handler(new Request("https://professional.example.test/api/profissional/commercial/configuration-status",{
   headers:{cookie}
  }));
  assert.equal(protectedApi.status,403);
  app.db.close();app=null;

  // A repeated token must never rotate credentials on another restart.
  app=create(alternate,token);
  assert.equal((await login(app,alternate)).status,401);
  signedIn=await login(app,resetPass);
  assert.equal(signedIn.status,200);
  cookie=signedIn.headers.get("set-cookie").split(";")[0];
  profile=await (await me(app,cookie)).json();
  const changed=await post(app,"/api/profissional/auth/password",{
   oldPassword:resetPass,newPassword:normalPass
  },cookie,profile.csrf);
  assert.equal(changed.status,200);
  app.db.close();app=null;

  // An activated account is not eligible, even with an unseen reset nonce.
  app=create(alternate,"different_bootstrap_reset_token_2026_0002");
  assert.equal((await login(app,alternate)).status,401);
  assert.equal((await login(app,normalPass)).status,200);
  assert.equal(app.db.prepare("SELECT id FROM cvx_recovery_canary").get().id,"preserve-me");
 }finally{
  try{app?.db.close()}catch{}
  rmSync(dir,{recursive:true,force:true});
 }
});
