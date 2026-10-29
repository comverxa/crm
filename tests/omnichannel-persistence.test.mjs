import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const schema = readFileSync(new URL("../backend/migrations/omnichannel-sqlite-p0.sql", import.meta.url), "utf8");
const source = readFileSync(new URL("../backend/omnichannel-sqlite-repository.py", import.meta.url), "utf8");
const script = `
import sqlite3,tempfile,os,sys,types
schema=sys.stdin.read()
module=types.ModuleType("repository")
exec(compile("backend/omnichannel-sqlite-repository.py", "<path>", "exec"), {}) if False else None
import importlib.util
spec=importlib.util.spec_from_file_location("repo","backend/omnichannel-sqlite-repository.py")
repo=importlib.util.module_from_spec(spec)
spec.loader.exec_module(repo)
fd,path=tempfile.mkstemp(suffix='.sqlite')
os.close(fd)
try:
 db=sqlite3.connect(path)
 db.executescript(schema)
 store=repo.InboxRepository(db)
 store.register_channel("a","line-a",1,"evolution","inst-a")
 store.register_channel("b","line-b",1,"evolution","inst-b")
 assert store.receive("a","line-a","provider-1","5531999999999","in","text","Cotação","2026-10-29T12:00:00Z")
 assert not store.receive("a","line-a","provider-1","5531999999999","in","text","Cotação","2026-10-29T12:00:00Z")
 assert len(store.conversations("a"))==1
 assert store.conversations("b")==[]
 cid=store.conversations("a")[0][0]
 assert store.history("b",cid)==[]
 db.close()
 db=sqlite3.connect(path)
 store=repo.InboxRepository(db)
 assert len(store.history("a",cid))==1
 assert store.history("a",cid)[0][3]=="Cotação"
 try:
  store.receive("a","line-b","p2","5531999999999","in","text","X","2026-10-29T12:00:00Z")
  raise AssertionError("cross tenant channel accepted")
 except ValueError: pass
 print("SQLite file reopen and tenant isolation verified")
finally:
 db.close()
 os.unlink(path)
`;
test("persists events across database reopening and keeps tenants isolated", () => {
 const run=spawnSync("python3",["-c",script],{input:schema,encoding:"utf8",cwd:process.cwd()});
 assert.equal(run.status,0,run.stderr || run.stdout);
 assert.match(run.stdout,/tenant isolation verified/);
});
test("repository uses parameterized SQL and transactions",()=>{
 assert.match(source,/with self.db:/);
 assert.match(source,/WHERE tenant_id=\?/);
 assert.doesNotMatch(source,/f["']/);
});
