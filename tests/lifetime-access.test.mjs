import {Database} from "bun:sqlite";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import os from "node:os";import path from "node:path";
import assert from "node:assert/strict";
const dir=mkdtempSync(path.join(os.tmpdir(),"cvx-lifetime-"));
const dbPath=path.join(dir,"crm.sqlite");
const db=new Database(dbPath,{create:true});
db.exec("CREATE TABLE companies(id TEXT PRIMARY KEY,name TEXT NOT NULL,plan TEXT NOT NULL DEFAULT 'trial',status TEXT NOT NULL DEFAULT 'trial',trial_until INTEGER NOT NULL,paid_until INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL)");
db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL,created_at INTEGER NOT NULL)");
db.query("INSERT INTO companies VALUES(?,?,?,?,?,?,?)").run("c1","Empresa de Teste","trial","trial",1700000,0,1700000);
db.query("INSERT INTO users VALUES(?,?,?,?,?,?,?)").run("u1","c1","joaopaulo.loovi@gmail.com","Titular","fakehash","owner",1700000);
db.query("INSERT INTO companies VALUES(?,?,?,?,?,?,?)").run("c2","Segunda empresa","trial","trial",1700000,0,1700000);
db.close();
const file="backend/lifetime-access-middleware.js",ui=readFileSync("backend/lifetime-access-ui.html","utf8");let code=readFileSync(file,"utf8");
assert.equal(code.split('__COMVERXA_LIFETIME_UI__').length,2);
code=code.replace('/data/conecta_saas.db',dbPath).replace('__COMVERXA_LIFETIME_UI__',JSON.stringify(ui));
const source=path.join(dir,"middleware.mjs");writeFileSync(source,code);
const prior=Bun.serve;let intercepted;Bun.serve=cfg=>{intercepted=cfg.fetch;return {}};
await import(source);
Bun.serve({fetch:async req=>{
 if(new URL(req.url).pathname==="/api/master/me"){
  return (req.headers.get("cookie")||"").includes("ownerok")?Response.json({email:"master@example.invalid"}):new Response("",{status:401});
 }
 return new Response("",{status:404});
}});
const base="https://app.comverxa.com.br",request=(url,init={})=>intercepted(new Request(base+url,init));
const guest=await request("/api/master/lifetime/overview");assert.equal(guest.status,401);
const unauthPage=await request("/admin/lifetime");assert.equal(unauthPage.status,302);
const page=await request("/admin/lifetime",{headers:{"Cookie":"ownerok"}});
assert.equal(page.status,200);
const html=await page.text(),token=html.match(/const LIFETIME_CSRF="([a-f0-9]{48})"/)?.[1];
assert.ok(token,"csrf token in authenticated page");
assert.ok(page.headers.get("set-cookie").includes("SameSite=Strict"));
assert.ok(page.headers.get("set-cookie").includes("HttpOnly"));
const cookie="ownerok; "+page.headers.get("set-cookie").split(";")[0];
const secureHeaders={"Cookie":cookie,"Content-Type":"application/json","X-COMVERXA-Lifetime-CSRF":token,"Origin":base};
async function post(action,payload,headers=secureHeaders){return request("/api/master/lifetime/"+action,{method:"POST",headers,body:JSON.stringify(payload)})}
let result=await request("/api/master/lifetime/overview",{headers:{"Cookie":cookie}});
assert.equal(result.status,200);
let overview=await result.json();
assert.equal(overview.capacity,2);assert.equal(overview.active,1);
assert.equal(overview.seats[0].email,"joaopaulo.loovi@gmail.com");
assert.equal(overview.seats[0].status,"active");
assert.equal(overview.seats[1].status,"reserved");assert.equal(overview.seats[1].email,null);
assert.equal(overview.chargeEnabled,false);
const chk=new Database(dbPath,{create:false});
let c1=chk.query("SELECT plan,status,paid_until FROM companies WHERE id='c1'").get();
assert.equal(c1.plan,"professional");assert.equal(c1.status,"active");assert.equal(c1.paid_until,253402300799);
assert.equal(chk.query("SELECT COUNT(*) as n FROM cxv_lifetime_seats").get().n,2);
// Even an accidental subscription update must not expire the free license.
chk.query("UPDATE companies SET plan='starter',status='expired',paid_until=0 WHERE id='c1'").run();
c1=chk.query("SELECT plan,status,paid_until FROM companies WHERE id='c1'").get();
assert.equal(c1.status,"active");assert.equal(c1.plan,"professional");assert.equal(c1.paid_until,253402300799);
// A free license is individual: avoid silently unlocking extra user seats.
assert.throws(()=>chk.query("INSERT INTO users VALUES(?,?,?,?,?,?,?)").run("u3","c1","third@example.invalid","Third","test","member",1700000));
// Block CSRF or untrusted origins, even with owner session.
assert.equal((await post("reserve",{slot:2,email:"two@example.test"},{...secureHeaders,"X-COMVERXA-Lifetime-CSRF":"0".repeat(48)})).status,403);
assert.equal((await post("reserve",{slot:2,email:"two@example.test"},{...secureHeaders,Origin:"https://attacker.example"})).status,403);
assert.equal((await post("reserve",{slot:1,email:"two@example.test"})).status,403);
const good=await post("reserve",{slot:2,email:"two@example.test"});
assert.equal(good.status,200,await good.clone().text());
assert.equal((await post("activate",{slot:2})).status,400);
assert.equal((await post("reserve",{slot:2,email:"different@example.test"})).status,409);
chk.query("INSERT INTO users VALUES(?,?,?,?,?,?,?)").run("u2","c2","two@example.test","Second","fakehash","owner",1700000);
const activation=await post("activate",{slot:2});
assert.equal(activation.status,200,await activation.clone().text());
const granted=await activation.json();assert.equal(granted.paymentReceived,false);assert.equal(granted.until,"vitalicio");
overview=await(await request("/api/master/lifetime/overview",{headers:{"Cookie":cookie}})).json();
assert.equal(overview.active,2);
assert.equal(overview.seats.filter(x=>x.status==="active").length,2);
assert.equal(chk.query("SELECT status,paid_until FROM companies WHERE id='c2'").get().paid_until,253402300799);
assert.equal((await post("reserve",{slot:2,email:"third@example.test"})).status,409);
const audit=chk.query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cvx%'").all().map(x=>x.name);
assert.deepEqual(audit,["cxv_lifetime_seats"]);
const seats=chk.query("SELECT slot,email,status FROM cxv_lifetime_seats ORDER BY slot").all();
assert.deepEqual(seats.map(x=>x.slot),[1,2]);
console.log("PASS | exactly two individual lifetime seats, zero billing, master-only access, CSRF, untrusted origin rejection, no unintended team seats, permanent plan guard");
chk.close();Bun.serve=prior;rmSync(dir,{recursive:true,force:true});
