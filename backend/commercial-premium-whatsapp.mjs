/**
 * Exactly TWO WhatsApp channels per COMVERXA tenant:
 * 1 = Evolution API (QR, non-official); 2 = Meta Cloud API (official).
 * Self-contained, isolated pilot; never modifies the legacy CRM's lines.
 *
 * Connection and message-sync APIs are fail-closed until provider credentials
 * exist. Messages are imported from authenticated provider webhooks only.
 * No mass sending, contact scraping, automatic chats or fake connected states.
 */
import {createHash,createHmac,randomBytes,createCipheriv,createDecipheriv,timingSafeEqual} from "node:crypto";

const slots=Object.freeze([{slot:1,mode:"qr",label:"WhatsApp 1 · QR Code"},{slot:2,mode:"official",label:"WhatsApp 2 · API oficial Meta"}]);
const limited=(s,n=120)=>String(s??"").replace(/[\u0000-\u001f\u007f]/g," ").slice(0,n);
const hash=s=>createHash("sha256").update(s).digest("hex");
const match=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};
const validateId=s=>typeof s==="string"&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(s);
const secretKey=s=>{const b=Buffer.from(s||"","base64");if(b.length!==32)throw Error("WhatsApp encryption key missing");return b};
const safeOrigin=s=>{const u=new URL(s);if(u.protocol!=="https:"||u.pathname!=="/"||u.username||u.password||u.search||u.hash)throw Error("Invalid WhatsApp callback origin");return u.origin};
function encrypt(value,key){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);const blob=Buffer.concat([cipher.update(String(value),"utf8"),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),blob]).toString("base64")}
function decrypt(value,key){if(!value)return "";const b=Buffer.from(value,"base64");if(b.length<29)throw Error("Invalid encrypted credential");const cipher=createDecipheriv("aes-256-gcm",key,b.subarray(0,12));cipher.setAuthTag(b.subarray(12,28));return Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString("utf8")}
function apiEndpoint(value){
 if(!value)return null;
 const u=new URL(value);
 if(!["https:","http:"].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error("Invalid Evolution endpoint");
 if(u.protocol!=="https:"&&!["localhost","127.0.0.1"].includes(u.hostname)&&!u.hostname.endsWith(".railway.internal"))throw Error("Evolution endpoint must use HTTPS");
 return u.href.replace(/\/$/,"");
}
function defaultReply(status,value){return {status,value}}
export function createCommercialWhatsApp({db,publicOrigin,credentialKey,evolutionUrl="",evolutionApiKey="",
  metaAppSecret="",metaGraphVersion="v23.0",fetchImpl=fetch,now=()=>Date.now()}={}){
 if(!db?.prepare)throw Error("SQLite required");
 const key=secretKey(credentialKey),origin=safeOrigin(publicOrigin),evo=apiEndpoint(evolutionUrl);
 if(evo&&!evolutionApiKey)throw Error("Evolution key missing");
 if(!/^v\d{1,2}\.\d{1,2}$/.test(metaGraphVersion))throw Error("Invalid Meta Graph version");
 const stmt=sql=>db.prepare(sql);
 db.exec("CREATE TABLE IF NOT EXISTS cvx_com_wa_channels (tenant_id TEXT NOT NULL,slot INTEGER NOT NULL CHECK(slot IN (1,2)),mode TEXT NOT NULL,instance_name TEXT,phone_id TEXT,display_number TEXT NOT NULL DEFAULT '',credential_enc TEXT,callback_enc TEXT,hook_hash TEXT,provider_state TEXT NOT NULL DEFAULT 'not_configured',updated_at TEXT NOT NULL,PRIMARY KEY(tenant_id,slot))");
 db.exec("CREATE UNIQUE INDEX IF NOT EXISTS cvx_com_wa_instance_unique ON cvx_com_wa_channels(instance_name) WHERE instance_name IS NOT NULL");
 db.exec("CREATE TABLE IF NOT EXISTS cvx_com_wa_messages (tenant_id TEXT NOT NULL,slot INTEGER NOT NULL CHECK(slot IN (1,2)),provider_id TEXT NOT NULL,contact TEXT NOT NULL,body TEXT NOT NULL,kind TEXT NOT NULL,direction TEXT NOT NULL,occurred_at TEXT NOT NULL,received_at TEXT NOT NULL,PRIMARY KEY(tenant_id,slot,provider_id))");
 db.exec("CREATE INDEX IF NOT EXISTS cvx_com_wa_message_recent ON cvx_com_wa_messages(tenant_id,slot,received_at)");
 function entry(tenant,slot){
  if(!validateId(tenant)||![1,2].includes(slot))throw Error("Invalid tenant or channel");
  return stmt("SELECT * FROM cvx_com_wa_channels WHERE tenant_id=? AND slot=?").get(tenant,slot)||null;
 }
 const isManager=session=>["master","admin","manager"].includes(session?.role);
 const scope=session=>{if(!validateId(session?.tenantId)||!session?.userId)throw Error("Unauthorized");return session.tenantId};
 const safeState=(channel,extra={})=>({
  slot:channel.slot,mode:channel.mode,label:channel.label,configured:!!extra.configured,
  state:extra.state||"not_configured",displayNumber:limited(extra.displayNumber||"",35),
  provider:channel.mode==="qr"?"Evolution API (não oficial)":"Meta Cloud API (oficial)",
  ...extra
 });
 const upsert=(tenant,slot,mode,fields={})=>{
  const previous=entry(tenant,slot);
  const values={
   instance_name:fields.instanceName??previous?.instance_name??null,
   phone_id:fields.phoneId??previous?.phone_id??null,
   display_number:fields.displayNumber??previous?.display_number??"",
   credential_enc:fields.tokenEnc??previous?.credential_enc??null,
   callback_enc:fields.callbackEnc??previous?.callback_enc??null,
   hook_hash:fields.hookHash??previous?.hook_hash??null,
   provider_state:fields.state??previous?.provider_state??"pending"
  };
  stmt("INSERT INTO cvx_com_wa_channels(tenant_id,slot,mode,instance_name,phone_id,display_number,credential_enc,callback_enc,hook_hash,provider_state,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,slot) DO UPDATE SET mode=excluded.mode,instance_name=excluded.instance_name,phone_id=excluded.phone_id,display_number=excluded.display_number,credential_enc=excluded.credential_enc,callback_enc=excluded.callback_enc,hook_hash=excluded.hook_hash,provider_state=excluded.provider_state,updated_at=excluded.updated_at")
   .run(tenant,slot,mode,values.instance_name,values.phone_id,values.display_number,values.credential_enc,values.callback_enc,values.hook_hash,values.provider_state,new Date(now()).toISOString());
 };
 async function provider(path,{method="GET",body}={}){
  if(!evo||!evolutionApiKey)throw Error("Evolution provider not configured");
  const url=new URL(evo+"/");
  url.pathname=url.pathname.replace(/\/$/,"")+path;
  const resp=await fetchImpl(url.href,{method,headers:{apikey:evolutionApiKey,Accept:"application/json",...(body?{"content-type":"application/json"}:{})},
   body:body?JSON.stringify(body):undefined,redirect:"error",signal:AbortSignal.timeout(12000)});
  if(!resp.ok)throw Error("Evolution provider HTTP "+resp.status);
  return resp.json();
 }
 function qrName(tenant){return "cvx-"+hash(tenant).slice(0,24)}
 async function registerQr(session){
  const tenant=scope(session);if(!isManager(session))throw Error("Forbidden");
  if(!evo)return {configured:false,state:"provider_missing"};
  const saved=entry(tenant,1);
  if(saved)return {configured:true,state:saved.provider_state,slot:1};
  const name=qrName(tenant);
  const hook=randomBytes(24).toString("base64url");
  const callbackUrl=origin+"/api/wa/qr/webhook/"+hook;
  // Instance provisioning is an explicit admin click; never on page load.
  await provider("/instance/create",{method:"POST",body:{
    instanceName:name,integration:"WHATSAPP-BAILEYS",qrcode:true,
    webhook:{enabled:true,url:callbackUrl,webhookByEvents:false,events:["MESSAGES_UPSERT","CONNECTION_UPDATE"]}
  }});
  upsert(tenant,1,"qr",{instanceName:name,callbackEnc:encrypt(hook,key),hookHash:hash(hook),state:"pending"});
  return {configured:true,state:"pending",slot:1};
 }
 async function qrStatus(session){
  const tenant=scope(session),line=entry(tenant,1);
  if(!line)return safeState(slots[0],{state:evo?"not_configured":"provider_missing"});
  if(!evo)return safeState(slots[0],{configured:true,state:"provider_missing"});
  try{
   const r=await provider("/instance/connectionState/"+encodeURIComponent(line.instance_name));
   const raw=String(r?.instance?.state||r?.state||r?.connectionStatus?.state||"unknown").toLowerCase();
   const state=raw==="open"?"connected":raw==="connecting"?"connecting":raw==="close"?"disconnected":"unknown";
   return safeState(slots[0],{configured:true,state});
  }catch{return safeState(slots[0],{configured:true,state:"unavailable"})}
 }
 async function qrCode(session){
  const tenant=scope(session);if(!isManager(session))throw Error("Forbidden");
  const line=entry(tenant,1);
  if(!line)throw Error("QR channel not registered");
  const current=await qrStatus(session);if(current.state==="connected")return {connected:true,state:"connected"};
  const result=await provider("/instance/connect/"+encodeURIComponent(line.instance_name));
  const payload=result?.base64||result?.qrcode?.base64||result?.code?.startsWith("data:image/png;base64,")&&result.code||null;
  // Only actual provider PNG image, no placeholder or fabricated QR.
  if(typeof payload!=="string"||payload.length>300000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(payload))
   return {connected:false,state:"waiting_qr",message:"Provider has not returned a PNG QR code"};
  return {connected:false,state:"waiting_scan",qrDataUrl:payload};
 }
 async function registerOfficial(session,{phoneNumberId,accessToken}={}){
  const tenant=scope(session);if(!isManager(session))throw Error("Forbidden");
  if(!/^\d{8,24}$/.test(phoneNumberId||"")||typeof accessToken!=="string"||accessToken.length<25||accessToken.length>600)
   throw Error("Invalid Meta credentials");
  if(!metaAppSecret)throw Error("Meta app secret not configured");
  const remote=await fetchImpl("https://graph.facebook.com/"+metaGraphVersion+"/"+phoneNumberId+"?fields=id,display_phone_number,verified_name",{
   headers:{Authorization:"Bearer "+accessToken},redirect:"error",signal:AbortSignal.timeout(12000)
  });
  if(!remote.ok)throw Error("Meta Graph failed to verify phone number");
  const data=await remote.json();
  if(String(data.id)!==phoneNumberId)throw Error("Meta Phone Number ID mismatch");
  const existing=entry(tenant,2),challenge=existing?.callback_enc?decrypt(existing.callback_enc,key):randomBytes(24).toString("hex");
  upsert(tenant,2,"official",{phoneId:phoneNumberId,displayNumber:limited(data.display_phone_number||"",35),
   tokenEnc:encrypt(accessToken,key),callbackEnc:encrypt(challenge,key),state:"validated"});
  return safeState(slots[1],{configured:true,state:"validated",displayNumber:data.display_phone_number||""});
 }
 async function officialStatus(session){
  const tenant=scope(session),line=entry(tenant,2);
  if(!line)return safeState(slots[1]);
  if(!metaAppSecret)return safeState(slots[1],{configured:true,state:"provider_missing"});
  try{
   const token=decrypt(line.credential_enc,key);
   const r=await fetchImpl("https://graph.facebook.com/"+metaGraphVersion+"/"+line.phone_id+"?fields=id,display_phone_number",{
    headers:{Authorization:"Bearer "+token},redirect:"error",signal:AbortSignal.timeout(12000)});
   if(!r.ok)return safeState(slots[1],{configured:true,state:"unavailable",displayNumber:line.display_number});
   const data=await r.json();
   return safeState(slots[1],{configured:true,state:String(data.id)===line.phone_id?"verified":"unavailable",displayNumber:line.display_number});
  }catch{return safeState(slots[1],{configured:true,state:"unavailable",displayNumber:line.display_number})}
 }
 function webhookDetails(session){
  const tenant=scope(session);if(!isManager(session))throw Error("Forbidden");
  const line=entry(tenant,2);
  if(!line)throw Error("Meta channel not configured");
  return {callbackUrl:origin+"/api/wa/meta/"+encodeURIComponent(tenant)+"/webhook",
    verifyToken:decrypt(line.callback_enc,key),instructions:"Configure WhatsApp messages webhook in Meta Developers. Keep this token private."};
 }
 function verifyMeta(tenant,verifyToken){
  const line=entry(tenant,2);
  return !!line?.callback_enc&&match(decrypt(line.callback_enc,key),verifyToken);
 }
 function insertMessage(tenant,slot,m){
  const providerId=limited(m.id,150),contact=limited(m.contact,35),body=limited(m.body,4000);
  if(!providerId||!contact)return false;
  const kind=["text","image","audio","document","video","unknown"].includes(m.kind)?m.kind:"unknown";
  const occurred=Number.isFinite(Number(m.timestamp))&&Number(m.timestamp)>0
    ?new Date(Math.min(Number(m.timestamp)*1000,now()+60000)).toISOString():new Date(now()).toISOString();
  const result=stmt("INSERT OR IGNORE INTO cvx_com_wa_messages(tenant_id,slot,provider_id,contact,body,kind,direction,occurred_at,received_at) VALUES(?,?,?,?,?,?,?,?,?)")
   .run(tenant,slot,providerId,contact,body,kind,"inbound",occurred,new Date(now()).toISOString());
  return result.changes>0;
 }
 function metaWebhook(tenant,raw,signature){
  if(!validateId(tenant)||!metaAppSecret)throw Error("Invalid webhook configuration");
  const line=entry(tenant,2);
  if(!line)throw Error("Unknown Meta channel");
  if(!Buffer.isBuffer(raw)||raw.length>512000)throw Error("Invalid webhook size");
  const expected="sha256="+createHmac("sha256",metaAppSecret).update(raw).digest("hex");
  if(!match(signature,expected))throw Error("Invalid Meta webhook signature");
  const obj=JSON.parse(raw.toString("utf8"));
  if(obj.object!=="whatsapp_business_account")throw Error("Invalid Meta event");
  let processed=0;
  for(const e of Array.isArray(obj.entry)?obj.entry.slice(0,20):[]){
   for(const change of Array.isArray(e.changes)?e.changes.slice(0,20):[]){
    const v=change?.value;
    if(String(v?.metadata?.phone_number_id)!==line.phone_id)continue;
    for(const m of Array.isArray(v.messages)?v.messages.slice(0,100):[]){
     if(insertMessage(tenant,2,{
      id:m.id,contact:m.from,body:m.text?.body||"",kind:m.type||"unknown",timestamp:m.timestamp
     }))processed++;
    }
   }
  }
  return {processed};
 }
 function qrWebhook(hook,payload){
  if(typeof hook!=="string"||hook.length<28||hook.length>150)throw Error("Invalid webhook secret");
  const line=stmt("SELECT tenant_id,instance_name FROM cvx_com_wa_channels WHERE slot=1 AND hook_hash=?").get(hash(hook));
  if(!line)throw Error("Unknown QR webhook");
  if(typeof payload!=="object"||!payload)throw Error("Invalid QR payload");
  if(payload.instance!==line.instance_name&&payload.instanceName!==line.instance_name)return {processed:0};
  const event=String(payload.event||"").toLowerCase();
  if(!["messages.upsert","messages_upsert"].includes(event))return {processed:0};
  const items=Array.isArray(payload.data)?payload.data:[payload.data];
  let processed=0;
  for(const item of items.slice(0,100)){
   const k=item?.key||{},message=item?.message||{};
   if(k.fromMe===true)continue;
   const contact=String(k.remoteJid||"").split("@")[0];
   if(insertMessage(line.tenant_id,1,{id:k.id,contact,
      body:message.conversation||message.extendedTextMessage?.text||"",
      kind:message.conversation||message.extendedTextMessage?"text":
       message.imageMessage?"image":message.audioMessage?"audio":message.documentMessage?"document":"unknown",
      timestamp:item?.messageTimestamp?.low??item?.messageTimestamp
   }))processed++;
  }
  return {processed};
 }
 function inbox(session,slot){
  const tenant=scope(session);if(![1,2].includes(slot))throw Error("Only 2 channels exist");
  return stmt("SELECT slot,contact,body,kind,direction,occurred_at AS occurredAt FROM cvx_com_wa_messages WHERE tenant_id=? AND slot=? ORDER BY received_at DESC LIMIT 100").all(tenant,slot);
 }
 return {slots,list:async session=>{
  scope(session);
  return [await qrStatus(session),await officialStatus(session)];
 },registerQr,qrStatus,qrCode,registerOfficial,officialStatus,webhookDetails,verifyMeta,metaWebhook,qrWebhook,inbox};
}
