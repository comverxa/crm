/**
 * COMVERXA Premium CRM — lead pipeline with ownership, audit and follow-ups.
 * Does not send messages, scrape leads or process payments.
 */
import {randomUUID} from "node:crypto";
import {assertScope,assertWriteScope} from "./commercial-premium-core.mjs";
const stages=["lead","contacted","negotiation","proposal","won","lost","on_hold"];
const heat=["cold","warm","hot"];
const origins=["whatsapp","referral","paid","campaign","organic","other"];
const activityTypes=["call","whatsapp","email","meeting","note"];
function id(value){if(typeof value!=="string"||!/^[a-zA-Z0-9_.:-]{1,100}$/.test(value))throw Error("Invalid identifier");return value}
function text(value,max,required=false){
 if(typeof value!=="string"){if(!required&&(value==null||value===""))return "";throw Error("Invalid text")}
 const v=value.trim();if(v.length>max||(required&&v.length<2))throw Error("Invalid text");return v;
}
function date(value){if(value==null||value==="")return null;if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+"T00:00:00Z"))||new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value)throw Error("Invalid date");return value}
function phone(value){
 if(!value)return "";const v=String(value).replace(/[^\d+]/g,"");
 if(!/^\+?[0-9]{10,15}$/.test(v))throw Error("Invalid phone");
 let digits=v.replace(/\D/g,"");if(digits.length>=10&&digits.length<=11)digits="55"+digits;
 return "+"+digits;
}
function email(value){const v=text(value,200).toLowerCase();if(v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))throw Error("Invalid email");return v}
function status(value,allow){if(!allow.includes(value))throw Error("Invalid status");return value}
function stmt(db,sql){return typeof db.query==="function"?db.query(sql):db.prepare(sql)}
function row(r){return {id:r.id,tenantId:r.tenant_id,sellerId:r.seller_id,name:r.name,phone:r.phone,email:r.email,
 stage:r.stage,temperature:r.temperature,source:r.source,uf:r.uf,ddd:r.ddd,nextFollowup:r.next_followup,
 lostReason:r.lost_reason,consentStatus:r.consent_status,notes:r.notes,version:r.version,createdAt:r.created_at,updatedAt:r.updated_at}}
const now=()=>new Date().toISOString();
export function createLeadsStore(db){
 db.exec("CREATE TABLE IF NOT EXISTS cvx_pilot_leads(tenant_id TEXT NOT NULL,id TEXT NOT NULL,seller_id TEXT NOT NULL,name TEXT NOT NULL,phone TEXT NOT NULL,email TEXT NOT NULL,stage TEXT NOT NULL,temperature TEXT NOT NULL,source TEXT NOT NULL,uf TEXT NOT NULL,ddd TEXT NOT NULL,next_followup TEXT,lost_reason TEXT NOT NULL,consent_status TEXT NOT NULL,notes TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(tenant_id,id))");
 db.exec("CREATE INDEX IF NOT EXISTS cvx_pilot_leads_pipeline ON cvx_pilot_leads(tenant_id,stage,seller_id)");
 db.exec("CREATE INDEX IF NOT EXISTS cvx_pilot_leads_followup ON cvx_pilot_leads(tenant_id,next_followup)");
 db.exec("CREATE TABLE IF NOT EXISTS cvx_pilot_lead_history(event_id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT NOT NULL,lead_id TEXT NOT NULL,actor_id TEXT NOT NULL,event_type TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL)");
 db.exec("CREATE INDEX IF NOT EXISTS cvx_pilot_lead_history_idx ON cvx_pilot_lead_history(tenant_id,lead_id,event_id)");
 const history=(session,leadId,event,detail="")=>stmt(db,"INSERT INTO cvx_pilot_lead_history(tenant_id,lead_id,actor_id,event_type,detail,created_at) VALUES(?,?,?,?,?,?)").run(session.tenantId,leadId,session.userId,event,detail,now());
 const scoped=(session,leadId)=>{
  assertScope(session);
  const r=stmt(db,"SELECT * FROM cvx_pilot_leads WHERE tenant_id=? AND id=?").get(session.tenantId,id(leadId));
  if(!r||(session.role==="operator"&&r.seller_id!==session.userId))throw Error("Not found");
  return r;
 };
 const canonical=(input,session)=>{
  if(!input||typeof input!=="object")throw Error("Invalid lead");
  if(input.tenantId!==undefined&&input.tenantId!==session.tenantId)throw Error("Not found");
  const sellerId=id(input.sellerId||session.userId);
  assertWriteScope(session,session.tenantId,sellerId);
  const fullName=text(input.name,120,true);
  const normalizedPhone=phone(input.phone);
  const normalizedEmail=email(input.email);
  const uf=(input.uf||"").toUpperCase();
  if(uf&&!/^[A-Z]{2}$/.test(uf))throw Error("Invalid state");
  const ddd=normalizedPhone.startsWith("+55")?normalizedPhone.slice(3,5):"";
  return {sellerId,name:fullName,phone:normalizedPhone,email:normalizedEmail,
   stage:status(input.stage??"lead",stages),temperature:status(input.temperature??"cold",heat),
   source:status(input.source??"other",origins),uf,ddd,
   nextFollowup:date(input.nextFollowup),lostReason:text(input.lostReason,160),
   consentStatus:status(input.consentStatus??"unknown",["unknown","granted","revoked"]),notes:text(input.notes,1000)};
 };
 return {
  create(session,input){
   assertScope(session);const lead=canonical(input,session),leadId=input.id?id(input.id):randomUUID(),time=now();
   db.exec("BEGIN IMMEDIATE");
   try{
    stmt(db,"INSERT INTO cvx_pilot_leads(tenant_id,id,seller_id,name,phone,email,stage,temperature,source,uf,ddd,next_followup,lost_reason,consent_status,notes,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)")
     .run(session.tenantId,leadId,lead.sellerId,lead.name,lead.phone,lead.email,lead.stage,lead.temperature,lead.source,lead.uf,lead.ddd,lead.nextFollowup,lead.lostReason,lead.consentStatus,lead.notes,time,time);
    history(session,leadId,"CREATED",lead.stage);
    db.exec("COMMIT");return this.get(session,leadId);
   }catch(error){db.exec("ROLLBACK");if(/UNIQUE/.test(String(error)))throw Error("Duplicate lead");throw error}
  },
  get(session,leadId){return row(scoped(session,leadId))},
  update(session,leadId,input){
   const old=scoped(session,leadId);
   if(!input||typeof input!=="object")throw Error("Invalid lead");
   if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion!==old.version)throw Error("Version conflict");
   if(input.sellerId!==undefined&&input.sellerId!==old.seller_id&&!["manager","admin","master"].includes(session.role))throw Error("Forbidden");
   const values=canonical({sellerId:input.sellerId??old.seller_id,
    name:input.name??old.name,phone:input.phone??old.phone,email:input.email??old.email,
    stage:input.stage??old.stage,temperature:input.temperature??old.temperature,source:input.source??old.source,uf:input.uf??old.uf,
    nextFollowup:input.nextFollowup===undefined?old.next_followup:input.nextFollowup,
    lostReason:input.lostReason??old.lost_reason,consentStatus:input.consentStatus??old.consent_status,notes:input.notes??old.notes},session);
   db.exec("BEGIN IMMEDIATE");
   try{
    const changed=stmt(db,"UPDATE cvx_pilot_leads SET seller_id=?,name=?,phone=?,email=?,stage=?,temperature=?,source=?,uf=?,ddd=?,next_followup=?,lost_reason=?,consent_status=?,notes=?,version=version+1,updated_at=? WHERE tenant_id=? AND id=? AND version=?")
    .run(values.sellerId,values.name,values.phone,values.email,values.stage,values.temperature,values.source,values.uf,values.ddd,values.nextFollowup,values.lostReason,values.consentStatus,values.notes,now(),session.tenantId,old.id,old.version);
    if(changed.changes!==1)throw Error("Version conflict");
    history(session,old.id,"UPDATED",old.stage+" → "+values.stage);
    db.exec("COMMIT");return this.get(session,old.id);
   }catch(error){db.exec("ROLLBACK");throw error}
  },
  list(session,{stage,ddd,uf,limit=200}={}){
   assertScope(session);if(!Number.isInteger(limit)||limit<1||limit>500)throw Error("Invalid limit");
   if(stage!==undefined)status(stage,stages);
   if(ddd!==undefined&&!/^[0-9]{2}$/.test(ddd))throw Error("Invalid DDD");
   if(uf!==undefined&&!/^[A-Z]{2}$/.test(uf))throw Error("Invalid state");
   let sql="SELECT * FROM cvx_pilot_leads WHERE tenant_id=?",args=[session.tenantId];
   if(session.role==="operator"){sql+=" AND seller_id=?";args.push(session.userId)}
   if(stage){sql+=" AND stage=?";args.push(stage)}
   if(ddd){sql+=" AND ddd=?";args.push(ddd)}
   if(uf){sql+=" AND uf=?";args.push(uf)}
   sql+=" ORDER BY updated_at DESC,id DESC LIMIT ?";args.push(limit);
   return stmt(db,sql).all(...args).map(row);
  },
  summary(session,{today=new Date().toISOString().slice(0,10)}={}){
   assertScope(session);date(today);
   const rows=this.list(session,{limit:500});
   const byStage=Object.fromEntries(stages.map(s=>[s,0]));
   const byTemperature=Object.fromEntries(heat.map(s=>[s,0]));
   const byDdd={};let due=0,overdue=0;
   for(const r of rows){byStage[r.stage]++;byTemperature[r.temperature]++;if(r.ddd)byDdd[r.ddd]=(byDdd[r.ddd]||0)+1;
    if(r.nextFollowup&&r.stage!=="won"&&r.stage!=="lost"&&r.nextFollowup<=today){due++;if(r.nextFollowup<today)overdue++}
   }
   const won=byStage.won,lost=byStage.lost;
   return {total:rows.length,byStage,byTemperature,byDdd,followupsDue:due,followupsOverdue:overdue,
    conversionPct:(won+lost)?Math.round(won*1000/(won+lost))/10:0,limitedTo:500};
  },
  recordActivity(session,leadId,input){
   const lead=scoped(session,leadId);
   const type=status(input?.type,activityTypes),note=text(input?.note,1000,true);
   history(session,lead.id,"ACTIVITY_"+type.toUpperCase(),note);
   return {leadId:lead.id,type,recorded:true};
  },
  history(session,leadId,{limit=100}={}){
   scoped(session,leadId);if(!Number.isInteger(limit)||limit<1||limit>200)throw Error("Invalid limit");
   return stmt(db,"SELECT actor_id,event_type,detail,created_at FROM cvx_pilot_lead_history WHERE tenant_id=? AND lead_id=? ORDER BY event_id DESC LIMIT ?").all(session.tenantId,leadId,limit);
  }
 };
}
