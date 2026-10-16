import {strict as assert} from "node:assert";
import {mkdtempSync,readFileSync,writeFileSync,statSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Database} from "bun:sqlite";
const root=mkdtempSync(join(tmpdir(),"cvx-backup-test-")),origin="http://127.0.0.1:52872";
try{
  Bun.env.CVX_BACKUP_DB_DIR=root;
  Bun.env.APP_PUBLIC_URL=origin;
  const dbPath=join(root,"conecta_saas.db");
  const db=new Database(dbPath,{create:true});
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE leads(id INTEGER PRIMARY KEY, name TEXT NOT NULL);");
  db.query("INSERT INTO leads(name) VALUES(?)").run("PROVA TESTE BACKUP");
  db.close();
  const mtime=statSync(dbPath).mtimeMs;
  await import("../backend/owner-backup-addon.js");
  const server=Bun.serve({hostname:"127.0.0.1",port:52872,fetch(req){
    const path=new URL(req.url).pathname;
    if(path==="/api/master/me")return (req.headers.get("cookie")||"").includes("session=master")
      ?Response.json({role:"master"}):new Response("unauthorized",{status:401});
    return new Response("app",{status:200});
  }});
  try{
    const unauthed=await fetch(origin+"/admin/backup");
    assert.equal(unauthed.status,401);
    const unauthorizedPost=await fetch(origin+"/api/master/backup?scope=crm",{method:"POST"});
    assert.equal(unauthorizedPost.status,401);
    const page=await fetch(origin+"/admin/backup",{headers:{Cookie:"session=master"}});
    assert.equal(page.status,200);
    assert.match(page.headers.get("content-security-policy"),/script-src 'nonce-/);
    assert.match(page.headers.get("set-cookie"),/SameSite=Strict/);
    const html=await page.text(),token=html.match(/const backupToken="([a-f0-9]{48})"/)?.[1];
    assert.ok(token,"CSRF not in page");
    const headers={Cookie:"session=master; __Host-cvx-backup="+token,
      Origin:origin,"X-CVX-Backup-Token":token,"X-CVX-Backup-Confirm":"EXPORTAR COMVERXA"};
    assert.equal((await fetch(origin+"/api/master/backup?scope=crm",{method:"POST",
      headers:{...headers,Origin:"https://attacker.test"}})).status,403);
    assert.equal((await fetch(origin+"/api/master/backup?scope=crm",{method:"POST",
      headers:{...headers,"X-CVX-Backup-Token":"0".repeat(48)}})).status,403);
    assert.equal((await fetch(origin+"/api/master/backup?scope=unknown",{method:"POST",headers})).status,400);
    const r=await fetch(origin+"/api/master/backup?scope=crm",{method:"POST",headers});
    assert.equal(r.status,200,await r.clone().text().catch(()=>"<binary>"));
    assert.equal(r.headers.get("content-type"),"application/vnd.sqlite3");
    const bytes=new Uint8Array(await r.arrayBuffer());
    assert.equal(Buffer.from(bytes.subarray(0,16)).toString("latin1"),"SQLite format 3\0");
    const dest=join(root,"restored.sqlite");writeFileSync(dest,bytes);
    const restored=new Database(dest,{readonly:true});
    assert.equal(restored.query("SELECT name FROM leads WHERE id=1").get().name,"PROVA TESTE BACKUP");
    assert.equal(Object.values(restored.query("PRAGMA integrity_check").get())[0],"ok");
    restored.close();
    const source=new Database(dbPath,{readonly:true});
    assert.equal(source.query("SELECT COUNT(*) AS n FROM leads").get().n,1);
    source.close();
    assert.equal(statSync(dbPath).mtimeMs,mtime,"original database changed");
    console.log("PASS | owner-only, CSRF, same-origin, download, SQLite integrity, independent restore, original DB unchanged");
  }finally{server.stop(true)}
}finally{rmSync(root,{recursive:true,force:true})}
