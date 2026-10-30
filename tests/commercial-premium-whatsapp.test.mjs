import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createHmac,randomBytes} from "node:crypto";
import {createCommercialWhatsApp} from "../backend/commercial-premium-whatsapp.mjs";
import {createPremiumServer} from "../backend/commercial-premium-server.mjs";
import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
const secret=randomBytes(32).toString("base64");
const master={tenantId:"agency-A",userId:"masterA",role:"admin"};
const operator={tenantId:"agency-A",userId:"seller",role:"operator"};
const other={tenantId:"agency-B",userId:"adminB",role:"admin"};
const png="data:image/png;base64,"+"A".repeat(240);
const officialToken="EAAG-META-TEST-SECRET-DO-NOT-LEAK-001";
const appSecret="meta_secret_unit_test";
const origin="https://pilot.example";
function gateway(){
 let createdUrl,tokenSeen,requests=[],connected=false;
 const fetchImpl=async(url,opt={})=>{
  const u=new URL(url);requests.push({url:u.href,method:opt.method||"GET"});
  if(u.hostname==="evolution.example"){
   assert.equal(opt.headers.apikey,"evolution-test-key");
   if(u.pathname==="/instance/create"){
    const body=JSON.parse(opt.body);createdUrl=body.webhook.url;
    assert.ok(/^cvx-[a-f0-9]{24}$/.test(body.instanceName));
    assert.equal(body.integration,"WHATSAPP-BAILEYS");
    assert.deepEqual(body.webhook.events,["MESSAGES_UPSERT","CONNECTION_UPDATE"]);
    return new Response(JSON.stringify({instance:{instanceName:body.instanceName,status:"created"}}),{status:201});
   }
   if(u.pathname.startsWith("/instance/connectionState/"))
    return new Response(JSON.stringify({instance:{state:connected?"open":"close"}}),{status:200});
   if(u.pathname.startsWith("/instance/connect/"))
    return new Response(JSON.stringify({base64:png}),{status:200});
   return new Response("Not found",{status:404});
  }
  if(u.hostname==="graph.facebook.com"){
   assert.equal(opt.headers.Authorization,"Bearer "+officialToken);
   tokenSeen=opt.headers.Authorization;
   return new Response(JSON.stringify({id:"123456789012345",display_phone_number:"+55 31 99999-1234",verified_name:"COMVERXA"}),{status:200});
  }
  throw Error("Unexpected URL "+u.href);
 };
 return {fetchImpl,get createdUrl(){return createdUrl},get tokenSeen(){return tokenSeen},get requests(){return requests},connected(v){connected=v}};
}
function setup(db,g){
 return createCommercialWhatsApp({db,publicOrigin:origin,credentialKey:secret,
  evolutionUrl:"https://evolution.example",evolutionApiKey:"evolution-test-key",
  metaAppSecret:appSecret,fetchImpl:g.fetchImpl});
}
test("exactly two WhatsApp channels per tenant, no third slot, tenant isolation and non-fake status",async()=>{
 const db=new DatabaseSync(":memory:");
 try{
  const g=gateway(),wa=setup(db,g);
  const list=await wa.list(master);
  assert.deepEqual(list.map(x=>x.slot),[1,2]);
  assert.deepEqual(list.map(x=>x.mode),["qr","official"]);
  assert.ok(list.every(x=>!x.configured));
  assert.throws(()=>wa.inbox(master,3),/Only 2 channels/);
  await wa.registerQr(master);
  assert.match(g.createdUrl,/^https:\/\/pilot\.example\/api\/wa\/qr\/webhook\/[A-Za-z0-9_-]+$/);
  assert.equal((await wa.qrStatus(master)).state,"disconnected");
  assert.equal((await wa.qrCode(master)).qrDataUrl,png);
  g.connected(true);
  assert.equal((await wa.qrCode(master)).connected,true);
  assert.equal((await wa.qrStatus(master)).state,"connected");
  assert.equal((await wa.list(other))[0].configured,false);
  await assert.rejects(wa.registerQr(operator),/Forbidden/);
  const rawDb=db.prepare("SELECT * FROM cvx_com_wa_channels WHERE tenant_id='agency-A'").all();
  assert.equal(rawDb.length,1);assert.ok(!JSON.stringify(rawDb).includes(g.createdUrl));
  assert.ok(!JSON.stringify(rawDb).includes("evolution-test-key"));
 }finally{db.close()}
});
test("Evolution webhook rejects unknown secret, saves messages deduplicated, leaves other tenants private",async()=>{
 const db=new DatabaseSync(":memory:");
 try{
  const g=gateway(),wa=setup(db,g);await wa.registerQr(master);
  const hook=g.createdUrl.split("/").pop(),name=db.prepare("SELECT instance_name FROM cvx_com_wa_channels").get().instance_name;
  const body={event:"messages.upsert",instance:name,data:{key:{id:"msg-a1",fromMe:false,remoteJid:"5531999999999@s.whatsapp.net"},message:{conversation:"Olá, tenho interesse"},messageTimestamp:"1793360000"}};
  assert.throws(()=>wa.qrWebhook("fake-secret-that-is-not-registered",body),/Unknown QR webhook/);
  assert.equal(wa.qrWebhook(hook,body).processed,1);
  assert.equal(wa.qrWebhook(hook,body).processed,0);
  assert.equal(wa.inbox(master,1).length,1);assert.equal(wa.inbox(other,1).length,0);
  assert.equal(wa.inbox(master,1)[0].body,"Olá, tenho interesse");
  assert.equal(wa.qrWebhook(hook,{...body,instance:"other-instance"}).processed,0);
  assert.equal(wa.qrWebhook(hook,{...body,data:{...body.data,key:{...body.data.key,fromMe:true}}}).processed,0);
 }finally{db.close()}
});
test("official Meta phone verified via Graph, encrypted token and signed inbound webhook",async()=>{
 const db=new DatabaseSync(":memory:");
 try{
  const g=gateway(),wa=setup(db,g);
  const validated=await wa.registerOfficial(master,{phoneNumberId:"123456789012345",accessToken:officialToken});
  assert.equal(validated.state,"validated");
  assert.equal((await wa.officialStatus(master)).state,"verified");
  assert.equal((await wa.list(other))[1].configured,false);
  await assert.rejects(wa.registerOfficial(other,{phoneNumberId:"123456789012345",accessToken:officialToken}),/UNIQUE constraint/);
  const stored=JSON.stringify(db.prepare("SELECT * FROM cvx_com_wa_channels").all());
  assert.ok(!stored.includes(officialToken));
  assert.ok(!stored.includes(appSecret));
  const details=wa.webhookDetails(master);
  assert.equal(details.callbackUrl,origin+"/api/wa/meta/agency-A/webhook");
  assert.ok(wa.verifyMeta(master.tenantId,details.verifyToken));
  assert.equal(wa.verifyMeta(other.tenantId,details.verifyToken),false);
  const payload={object:"whatsapp_business_account",entry:[{changes:[{value:{
   metadata:{phone_number_id:"123456789012345"},messages:[{id:"wamid.qwerty",from:"5531999999999",timestamp:"1793360000",type:"text",text:{body:"Cotação de seguro"}}]
  }}]}]};
  const bytes=Buffer.from(JSON.stringify(payload));
  const sig="sha256="+createHmac("sha256",appSecret).update(bytes).digest("hex");
  assert.throws(()=>wa.metaWebhook(master.tenantId,bytes,"sha256=wrong"),/signature/);
  assert.equal(wa.metaWebhook(master.tenantId,bytes,sig).processed,1);
  assert.equal(wa.metaWebhook(master.tenantId,bytes,sig).processed,0);
  assert.equal(wa.inbox(master,2)[0].body,"Cotação de seguro");
  assert.equal(wa.inbox(other,2).length,0);
  assert.equal(wa.inbox(master,1).length,0);
  const cross=Buffer.from(JSON.stringify({...payload,entry:[{changes:[{value:{
   metadata:{phone_number_id:"another-phone"},messages:payload.entry[0].changes[0].value.messages
  }}]}]}));
  assert.equal(wa.metaWebhook(master.tenantId,cross,"sha256="+createHmac("sha256",appSecret).update(cross).digest("hex")).processed,0);
 }finally{db.close()}
});
test("pilot HTTP rejects anonymous WhatsApp data and forbids third channel and spoofed webhooks",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"cvx-two-wa-"));
 const app=createPremiumServer({dbPath:join(dir,"pilot.sqlite"),bootstrapEmail:"owner@example.test",
  bootstrapPassword:"SecurePassTwoWA-2026#",cookieSecure:false,
  publicOrigin:origin,whatsAppConfig:{
   credentialKey:secret,evolutionUrl:"https://evolution.example",
   evolutionApiKey:"evolution-test-key",metaAppSecret:appSecret,
   fetchImpl:gateway().fetchImpl
  }});
 try{
  await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+app.server.address().port;
  let r=await fetch(base+"/api/wa/channels");assert.equal(r.status,401);
  r=await fetch(base+"/api/wa/inbox?slot=3");assert.equal(r.status,401);
  r=await fetch(base+"/assets/commercial-theme.css");assert.equal(r.status,200);
  assert.match(await r.text(),/wa-channel-grid/);
  r=await fetch(base+"/app",{redirect:"manual"});assert.equal(r.status,303);
  r=await fetch(base+"/api/wa/meta/agency-A/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1234");
  assert.equal(r.status,403);
  r=await fetch(base+"/api/wa/qr/webhook/not-valid",{method:"POST",
   headers:{"content-type":"application/json"},body:JSON.stringify({})});assert.equal(r.status,401);
  r=await fetch(base+"/login");assert.equal(r.status,200);
  r=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({email:"owner@example.test",password:"SecurePassTwoWA-2026#"})});
  const cookie=r.headers.get("set-cookie").split(";")[0];
  const me=await(await fetch(base+"/api/auth/me",{headers:{cookie}})).json();
  assert.equal(me.mustChangePassword,true);
  r=await fetch(base+"/api/wa/channels",{headers:{cookie}});assert.equal(r.status,403);
  r=await fetch(base+"/api/auth/password",{method:"POST",headers:{"content-type":"application/json",cookie,"x-csrf-token":me.csrf},
   body:JSON.stringify({oldPassword:"SecurePassTwoWA-2026#",newPassword:"ChangedTwoWA-2026#"})});
  assert.equal(r.status,200);
  r=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({email:"owner@example.test",password:"ChangedTwoWA-2026#"})});
  const auth=r.headers.get("set-cookie").split(";")[0];
  const session=await(await fetch(base+"/api/auth/me",{headers:{cookie:auth}})).json();
  r=await fetch(base+"/api/wa/channels",{headers:{cookie:auth}});
  assert.equal(r.status,200);
  const channelInfo=await r.json();
  assert.deepEqual(channelInfo.channels.map(x=>x.slot),[1,2]);
  assert.deepEqual(channelInfo.providerConfigured,{qr:true,official:true});
  r=await fetch(base+"/api/wa/qr/register",{method:"POST",headers:{"content-type":"application/json",cookie:auth,"x-csrf-token":"bad"},body:"{}"});
  assert.equal(r.status,403);
  r=await fetch(base+"/api/wa/qr/register",{method:"POST",headers:{"content-type":"application/json",cookie:auth,"x-csrf-token":session.csrf},body:"{}"});
  assert.equal(r.status,200);
  r=await fetch(base+"/api/wa/inbox?slot=3",{headers:{cookie:auth}});
  assert.equal(r.status,400);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true})}
});

test("read-only channel readiness refuses to imply Meta is configured without app secret",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"cvx-wa-missing-secret-"));
 const account="readiness@example.test",pass="SufficientReadinessPassword-2026!";
 const app=createPremiumServer({dbPath:join(dir,"pilot.sqlite"),bootstrapEmail:account,
  bootstrapPassword:pass,cookieSecure:false,publicOrigin:origin,
  whatsAppConfig:{credentialKey:secret,evolutionUrl:"https://evolution.example",evolutionApiKey:"evolution-test-key"}});
 try{
  await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+app.server.address().port;
  let r=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({email:account,password:pass})});
  let cookie=r.headers.get("set-cookie").split(";")[0];
  const me=await(await fetch(base+"/api/auth/me",{headers:{cookie}})).json();
  r=await fetch(base+"/api/auth/password",{method:"POST",headers:{"content-type":"application/json",cookie,"x-csrf-token":me.csrf},
   body:JSON.stringify({oldPassword:pass,newPassword:pass+"-rotated"})});
  assert.equal(r.status,200);
  r=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({email:account,password:pass+"-rotated"})});
  cookie=r.headers.get("set-cookie").split(";")[0];
  r=await fetch(base+"/api/wa/channels",{headers:{cookie}});
  assert.equal(r.status,200);
  const channels=await r.json();
  assert.equal(channels.integrationAvailable,true);
  assert.deepEqual(channels.providerConfigured,{qr:true,official:false});
  assert.deepEqual(channels.channels.map(x=>x.slot),[1,2]);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true})}
});
