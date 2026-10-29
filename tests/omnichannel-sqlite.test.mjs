import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const schema = readFileSync(new URL("../backend/migrations/omnichannel-sqlite-p0.sql", import.meta.url), "utf8");
const py = `
import sqlite3,sys
db=sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
db.executescript(sys.stdin.read())
db.execute("INSERT INTO omnichannel_channels(tenant_id,id,slot,provider,external_id) VALUES ('a','wa',1,'evolution','first')")
db.execute("INSERT INTO omnichannel_channels(tenant_id,id,slot,provider,external_id) VALUES ('b','wa',1,'evolution','second')")
db.execute("INSERT INTO omnichannel_conversations(tenant_id,id,channel_id,phone) VALUES ('a','c1','wa','5511999999999')")
db.execute("INSERT INTO omnichannel_conversations(tenant_id,id,channel_id,phone) VALUES ('b','c1','wa','5511999999999')")
db.execute("INSERT INTO omnichannel_messages(tenant_id,id,conversation_id,channel_id,provider_message_id,direction,kind,occurred_at) VALUES ('a','m1','c1','wa','provider1','in','text','2026-10-29')")
for statement in [
 "INSERT INTO omnichannel_channels(tenant_id,id,slot,provider,external_id) VALUES ('a','new',1,'meta','third')",
 "INSERT INTO omnichannel_messages(tenant_id,id,conversation_id,channel_id,provider_message_id,direction,kind,occurred_at) VALUES ('a','m2','c1','wa','provider1','in','text','2026-10-29')",
 "INSERT INTO omnichannel_messages(tenant_id,id,conversation_id,channel_id,provider_message_id,direction,kind,occurred_at) VALUES ('b','m3','c1','not-a-channel',NULL,'in','text','2026-10-29')",
 "INSERT INTO omnichannel_outbox(tenant_id,request_id,conversation_id,channel_id,body,state) VALUES ('b','r1','missing','wa','hello','queued')"
]:
 try:
  db.execute(statement)
  raise AssertionError('constraint not enforced')
 except sqlite3.IntegrityError: pass
db.execute("INSERT INTO omnichannel_outbox(tenant_id,request_id,conversation_id,channel_id,body,state) VALUES ('a','req1','c1','wa','hello','queued')")
try:
 db.execute("INSERT INTO omnichannel_outbox(tenant_id,request_id,conversation_id,channel_id,body,state) VALUES ('a','req1','c1','wa','hello','queued')")
 raise AssertionError('outbox dedup not enforced')
except sqlite3.IntegrityError: pass
assert db.execute("SELECT count(*) FROM omnichannel_conversations WHERE tenant_id='b'").fetchone()[0]==1
assert db.execute("SELECT count(*) FROM omnichannel_messages WHERE tenant_id='b'").fetchone()[0]==0
print('SQLite constraints OK')
`;

test("staging SQLite schema supports tenants, deduplicates and enforces foreign keys", () => {
  const result = spawnSync("python3", ["-c", py], { input: schema, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /SQLite constraints OK/);
});
