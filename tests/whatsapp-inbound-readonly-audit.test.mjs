import assert from "node:assert/strict";
import {Database} from "bun:sqlite";
import {unlinkSync} from "node:fs";
const dbFile="/tmp/cvx-inbox-audit-fixture-"+process.pid+".sqlite";
Bun.env.CVX_INBOX_AUDIT_DB=dbFile;
const db=new Database(dbFile,{create:true});
db.exec("CREATE TABLE messages(id INTEGER PRIMARY KEY,company_id INTEGER,lead_id INTEGER,direction TEXT,body TEXT)");
db.exec("CREATE TABLE leads(id INTEGER,company_id INTEGER,line INTEGER)");
db.exec("CREATE TABLE companies(id INTEGER)");
db.query("INSERT INTO leads(id,company_id,line) VALUES(1,1,2)").run();
const original=console.info, lines=[];
console.info=(...args)=>{lines.push(args.map(String).join(" "))};
await import("../backend/whatsapp-inbound-readonly-audit.js");
const server=Bun.serve({hostname:"127.0.0.1",port:0,fetch:async(req)=>{
 const path=new URL(req.url).pathname;
 if(path==="/webhooks/evolution/fixture"&&req.method==="POST"){
  const data=await req.json();
  if(data.event==="messages.upsert")
   db.query("INSERT INTO messages(company_id,lead_id,direction,body) VALUES(1,1,'in',?)").run("PRIVATE-CUSTOMER-MESSAGE");
  return Response.json({success:true},{status:200});
 }
 return Response.json({ok:true});
}});
try{
 const base="http://127.0.0.1:"+server.port;
 const response=await fetch(base+"/webhooks/evolution/fixture",{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({event:"messages.upsert",sender:"PRIVATE-PHONE",apikey:"PRIVATE-KEY",data:{message:{conversation:"PRIVATE-CUSTOMER-MESSAGE"}}})});
 assert.equal(response.status,200);
 await fetch(base+"/webhooks/evolution/fixture",{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({event:"connection.update",sender:"PRIVATE-PHONE"})});
 await fetch(base+"/api/lines");
 const audits=lines.filter(x=>x.includes("CVX_INBOX_WEBHOOK")).map(x=>JSON.parse(x.split("CVX_INBOX_WEBHOOK ")[1]));
 assert.equal(audits.length,2);
 assert.deepEqual(audits.map(x=>x.event),["messages_upsert","connection_update"]);
 assert.deepEqual(audits.map(x=>x.persistedDelta),[1,0]);
 assert.ok(audits.every(x=>x.databaseStatus==="ok"&&x.observedTableTypes===1));
 assert.equal(db.query("SELECT COUNT(*) AS n FROM messages").get().n,1);
 const {cvxInboxPreflight}=await import("../backend/whatsapp-inbound-readonly-audit.js");
 const snap=cvxInboxPreflight();
 assert.deepEqual(snap.db.byLine,[{slot:2,direction:"in",count:1}]);
 assert.deepEqual(snap.db.leadCounts,[{slot:2,n:1}]);
 assert.equal(snap.db.unlinked,0);

 const all=lines.join("\n");
 for(const privateValue of ["PRIVATE-CUSTOMER-MESSAGE","PRIVATE-PHONE","PRIVATE-KEY","fixture-secret"]){
  assert.equal(all.includes(privateValue),false,"Audit must never log contact or payload");
 }
 assert.ok(all.includes("CVX_INBOX_WEBHOOK"),"Auditor emits redacted counters");
 console.info=original;
 console.log("PASS | read-only QR webhook audit; persisted deltas and no personal data, no real messages");
}finally{
 server.stop(true);db.close();console.info=original;
 try{unlinkSync(dbFile)}catch{}
}
