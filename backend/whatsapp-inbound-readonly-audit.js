/**
 * COMVERXA — auditoria de ingresso Evolution QR.
 * SOMENTE LEITURA: não cria contatos, não escreve mensagens, não muda sessões,
 * não lê ou divulga conteúdo, número, token ou identificador de mensagem.
 * Os contadores são relativos ao banco principal e não identificam tenants.
 */
import {Database as CVXInboxDatabase} from "bun:sqlite";
import {readFileSync as cvxInboxReadFile} from "node:fs";

const cvxInboxAuditPath=()=>Bun.env.CVX_INBOX_AUDIT_DB||"/data/conecta_saas.db";
const cvxInboxTables=["messages","inbox_messages","whatsapp_messages","wa_messages","leads","companies"];
function cvxInboxAuditCounts(){
 let db;
 try{
  db=new CVXInboxDatabase(cvxInboxAuditPath(),{readonly:true});
  db.exec("PRAGMA query_only=ON");
  const existing=new Set(db.query("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>String(r.name)));
  const counts={};
  const columns={};
  for(const name of cvxInboxTables){
   if(!existing.has(name))continue;
   counts[name]=Number(db.query("SELECT COUNT(*) AS n FROM \""+name+"\"").get()?.n||0);
   if(/messages/.test(name)){
    const cols=db.query("PRAGMA table_info(\""+name+"\")").all().map(c=>String(c.name||"").toLowerCase());
    columns[name]={
     hasTenant:cols.some(n=>["company_id","tenant_id","organization_id"].includes(n)),
     hasLead:cols.some(n=>["lead_id","contact_id"].includes(n)),
     hasOrigin:cols.some(n=>["direction","from_me","sender"].includes(n)),
     hasProviderId:cols.some(n=>["provider_id","external_id","message_id","evolution_id"].includes(n))
    };
   }
  }

  // Only counts by channel and direction. No phone, contact, message or tenant IDs leave SQLite.
  const byLine=[];
  const leadCounts=[];
  let unlinked=null;
  if(existing.has("leads")){
   const leadCols=db.query('PRAGMA table_info("leads")').all().map(r=>String(r.name||""));
   if(leadCols.includes("line")){
    for(const row of db.query('SELECT line AS slot,COUNT(*) AS n FROM leads GROUP BY line').all()){
     const slot=Number(row.slot);leadCounts.push({slot:Number.isInteger(slot)&&slot>=1&&slot<=3?slot:"other",n:Number(row.n)});
    }
    if(existing.has("messages")&&columns.messages?.hasLead&&columns.messages?.hasTenant){
     try{
      const rows=db.query('SELECT l.line AS slot,m.direction AS kind,COUNT(*) AS n FROM messages m LEFT JOIN leads l ON l.id=m.lead_id AND l.company_id=m.company_id GROUP BY l.line,m.direction').all();
      for(const row of rows){
       const slot=Number(row.slot),kind=String(row.kind||"").toLowerCase();
       byLine.push({slot:Number.isInteger(slot)&&slot>=1&&slot<=3?slot:"unlinked",
        direction:kind==="in"||kind==="out"?kind:"other",count:Number(row.n)});
      }
      unlinked=byLine.filter(x=>x.slot==="unlinked").reduce((a,x)=>a+x.count,0);
     }catch{unlinked=null}
    }
   }
  }
  return {status:"ok",counts,columns,byLine,leadCounts,unlinked,
    messageTotal:["messages","inbox_messages","whatsapp_messages","wa_messages"].reduce((sum,n)=>sum+(counts[n]||0),0)};

 }catch(e){
  return {status:"unavailable",reason:["SQLiteError","Error"].includes(String(e?.name))?"database": "database"};
 }finally{try{db?.close()}catch{}}
}
function cvxInboxSourceShape(){
 try{
  const source=cvxInboxReadFile("/tmp/comverxa-production.ts","utf8");
  return {available:true,hasEvolutionWebhook:/webhooks\/evolution/i.test(source),
    checksUpsertEvent:/messages[.\-_]upsert|messages_upsert/i.test(source),
    hasMessageInsert:/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+["'\x60]?(?:inbox_messages|whatsapp_messages|wa_messages|messages)\b/i.test(source),
    usesRemoteJid:/remoteJid|remote_jid/i.test(source)};
 }catch{return {available:false}}
}
export function cvxInboxPreflight(){
 const db=cvxInboxAuditCounts(),source=cvxInboxSourceShape();
 console.info("CVX_INBOX_PREFLIGHT",JSON.stringify({db,source}));
 return {db,source};
}
function cvxInboxEventType(obj){
 const s=String(obj?.event||obj?.type||obj?.data?.event||"unknown").toLowerCase();
 if(s.includes("messages.upsert")||s.includes("messages_upsert")||s.includes("messages-upsert"))return "messages_upsert";
 if(s.includes("messages.update")||s.includes("messages_update"))return "messages_update";
 if(s.includes("connection.update")||s.includes("connection_update"))return "connection_update";
 if(s.includes("qrcode"))return "qrcode";
 return "other";
}
const cvxInboxPreviousServe=Bun.serve;
Bun.serve=function cvxInboxInstrumentedServe(config){
 if(typeof config?.fetch!=="function")return cvxInboxPreviousServe(config);
 const routeFetch=config.fetch;
 return cvxInboxPreviousServe({...config,fetch:async function(req,server){
  const path=new URL(req.url).pathname;
  if(req.method!=="POST"||!/^\/webhooks\/evolution(?:\/|$)/.test(path))return routeFetch(req,server);
  const before=cvxInboxAuditCounts();
  let event="unparsed";
  try{
   const rawLen=Number(req.headers.get("content-length")||0);
   if(!rawLen||rawLen<65536){
    const body=await req.clone().json();
    event=cvxInboxEventType(body);
   }else event="skipped_large_payload";
  }catch{event="unparsed"}
  let response;
  try{response=await routeFetch(req,server)}
  catch(error){
   console.warn("CVX_INBOX_WEBHOOK",JSON.stringify({event,appResult:"exception",persistedDelta:null}));
   throw error;
  }
  const after=cvxInboxAuditCounts();
  const delta=before.status==="ok"&&after.status==="ok"?after.messageTotal-before.messageTotal:null;
  console.info("CVX_INBOX_WEBHOOK",JSON.stringify({
   event,httpStatus:response.status,persistedDelta:delta,
   observedTableTypes:Object.keys(after.counts||{}).filter(x=>x.includes("messages")).length,
   databaseStatus:after.status
  }));
  return response;
 }});
};
