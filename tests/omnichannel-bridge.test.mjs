import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const schema=readFileSync(new URL("../backend/migrations/omnichannel-sqlite-p0.sql",import.meta.url),"utf8");
const py=`
import sqlite3,sys,importlib.util
db=sqlite3.connect(':memory:')
db.executescript(sys.stdin.read())
spec=importlib.util.spec_from_file_location('bridge','backend/omnichannel-sqlite-bridge.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
bridge=module.OmnichannelBridge(db)
db.execute("INSERT INTO omnichannel_channels(tenant_id,id,slot,provider,external_id) VALUES ('a','wa',1,'evolution','inst-a')")
db.execute("INSERT INTO omnichannel_channels(tenant_id,id,slot,provider,external_id) VALUES ('b','wa',1,'evolution','inst-b')")
p=('a','wa','provider-01','5531999999999','in','text','Cotação','2026-10-29T12:00:00Z')
first=bridge.ingest_verified(*p)
assert first['inserted']
assert not bridge.ingest_verified(*p)['inserted']
cid=first['conversation_id']
assert db.execute("SELECT COUNT(*) FROM omnichannel_messages WHERE tenant_id='a'").fetchone()[0]==1
try:
 bridge.queue_text('b',cid,'request-1234','Olá')
 raise AssertionError('tenant boundary bypassed')
except ValueError: pass
assert bridge.queue_text('a',cid,'request-1234','Olá')['queued']
assert not bridge.queue_text('a',cid,'request-1234','Olá')['queued']
try:
 bridge.queue_text('a',cid,'request-1234','mensagem alterada')
 raise AssertionError('idempotency conflict missing')
except ValueError: pass
assert db.execute("SELECT COUNT(*) FROM omnichannel_outbox").fetchone()[0]==1
print('bridge transaction checks passed')
`;
test("verified staging ingestion and transactionally idempotent queue",()=>{
 const r=spawnSync("python3",["-c",py],{input:schema,encoding:"utf8",cwd:process.cwd()});
 assert.equal(r.status,0,r.stderr||r.stdout);
 assert.match(r.stdout,/transaction checks passed/);
});
