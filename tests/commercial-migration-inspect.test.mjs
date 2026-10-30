import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {inspectBackup} from "../backend/commercial-migration-inspect.mjs";
test("read-only migration inventory lists table structure without reading customer values",()=>{
 const folder=mkdtempSync(join(tmpdir(),"cvx-schema-")),file=join(folder,"snapshot.sqlite");
 try{
  const db=new DatabaseSync(file);
  db.exec("CREATE TABLE companies (id TEXT PRIMARY KEY,display_name TEXT);CREATE TABLE leads (id TEXT PRIMARY KEY,company_id TEXT,customer_email TEXT,notes TEXT,FOREIGN KEY(company_id) REFERENCES companies(id));CREATE TABLE whatsapp_messages (id INTEGER PRIMARY KEY,content TEXT)");
  db.prepare("INSERT INTO companies(id,display_name) VALUES(?,?)").run("c1","PRIVATE CLIENT ACME");
  db.prepare("INSERT INTO leads(id,company_id,customer_email,notes) VALUES(?,?,?,?)").run("l1","c1","sensitive@example.test","secret phone +55 31 99999-9999");
  db.close();
  const before=inspectBackup(file);
  assert.equal(before.mode,"read-only-schema");
  assert.equal(before.tableCount,3);
  assert.ok(before.groups.companies.includes("companies"));
  assert.ok(before.groups.leads.includes("leads"));
  assert.ok(before.groups.messages.includes("whatsapp_messages"));
  assert.ok(before.tables.some(t=>t.name==="leads"&&t.columns.some(c=>c.name==="customer_email")));
  assert.ok(before.tables.some(t=>t.name==="leads"&&t.foreignKeys.some(f=>f.referencesTable==="companies")));
  const json=JSON.stringify(before);
  for(const forbidden of ["PRIVATE CLIENT ACME","sensitive@example.test","secret phone","+55 31 99999-9999"])
   assert.ok(!json.includes(forbidden));
  const readBack=new DatabaseSync(file,{readOnly:true});
  try{assert.equal(readBack.prepare("SELECT COUNT(*) AS n FROM leads").get().n,1)}
  finally{readBack.close()}
 }finally{rmSync(folder,{recursive:true,force:true})}
});
test("schema inventory fails closed for non-existent backup",()=>{
 assert.throws(()=>inspectBackup("/not-a-real-cvx-path/nonexistent.sqlite"));
});
