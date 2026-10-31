import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,rmSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {randomBytes} from "node:crypto";
import {sealSqlite,openSealedSqlite,createOffsiteBackup,createS3Client} from "../backend/commercial-premium-offsite-backup.mjs";
const secret=randomBytes(32).toString("base64");
const clock=()=>new Date("2026-10-30T01:03:15.000Z");
function withDatabase(fn){
 const folder=mkdtempSync(join(tmpdir(),"cvx-offsite-test-")),path=join(folder,"pilot.sqlite");
 const db=new DatabaseSync(path);db.exec("CREATE TABLE invoices (id INTEGER PRIMARY KEY,name TEXT NOT NULL);INSERT INTO invoices(name) VALUES ('demo'),('customer test')");
 return Promise.resolve().then(()=>fn({folder,path,db})).finally(()=>{db.close();rmSync(folder,{recursive:true,force:true})});
}
test("AES-256-GCM encrypted archive is restorable; tampering and wrong keys are rejected",async()=>{
 await withDatabase(({path})=>{
  const sqlite=readFileSync(path),sealed=sealSqlite(sqlite,secret);
  assert.ok(sealed.length>34);
  assert.equal(sealed.subarray(0,6).toString(),"CVXBK1");
  assert.ok(!sealed.includes(Buffer.from("customer test")));
  assert.deepEqual(openSealedSqlite(sealed,secret),sqlite);
  assert.throws(()=>openSealedSqlite(sealed,randomBytes(32).toString("base64")));
  const changed=Buffer.from(sealed);changed[changed.length-3]^=0x20;
  assert.throws(()=>openSealedSqlite(changed,secret));
  assert.throws(()=>sealSqlite(Buffer.from("not sqlite"),secret),/Invalid SQLite/);
 });
});
test("S3 PUT and GET signed with SigV4; downloaded restore equals source",async()=>{
 await withDatabase(async({path,db})=>{
  const objects=new Map(),calls=[];
  const fakeFetch=async(url,request)=>{
   const u=new URL(url),headers=new Headers(request.headers),signed=headers.get("authorization");
   assert.equal(u.origin,"http://127.0.0.1:10000");
   assert.match(u.pathname,/^\/comverxa-backups\/commercial\/2026\/10\/.+\.cvxbak$/);
   assert.match(signed,/^AWS4-HMAC-SHA256 Credential=examplekey\/20261030\/sjc\/s3\/aws4_request/);
   assert.ok(headers.get("x-amz-content-sha256"));
   calls.push(request.method);
   if(request.method==="PUT"){objects.set(u.pathname,Buffer.from(request.body));return new Response(null,{status:200})}
   if(request.method==="GET"){const body=objects.get(u.pathname);return new Response(body||"missing",{status:body?200:404})}
   throw Error("unexpected method");
  };
  const config={endpoint:"http://127.0.0.1:10000",bucket:"comverxa-backups",region:"sjc",
   accessKeyId:"examplekey",secretAccessKey:"example-secrettoken",encryptionKey:secret,urlStyle:"path"};
  const offsite=createOffsiteBackup({db,dbPath:path,config,fetchImpl:fakeFetch,now:clock});
  assert.equal(offsite.last(),null);
  const result=await offsite.run();
  assert.equal(result.verified,true);
  assert.equal(result.restoredToTemporaryDatabase,true);
  assert.ok(result.sizeBytes>100);
  assert.deepEqual(calls,["PUT","GET"]);
  assert.ok(offsite.last().checksum.length===64);
  const stored=db.prepare("SELECT COUNT(*) AS n FROM cvx_pilot_offsite_backups").get();
  assert.equal(stored.n,1);
  const key=offsite.last().object_key;
  const restored=openSealedSqlite(objects.get("/comverxa-backups/"+key),secret);
  assert.equal(restored.subarray(0,16).toString(),"SQLite format 3\u0000");
 });
});
test("S3 upload accepted but unverifiable object does not produce successful backup record",async()=>{
 await withDatabase(async({path,db})=>{
  const fakeFetch=async(url,request)=>request.method==="PUT"?new Response(null,{status:200}):new Response("broken archive",{status:200});
  const config={endpoint:"http://127.0.0.1:10000",bucket:"comverxa-backups",region:"sjc",
   accessKeyId:"examplekey",secretAccessKey:"example-secrettoken",encryptionKey:secret};
  const offsite=createOffsiteBackup({db,dbPath:path,config,fetchImpl:fakeFetch,now:clock});
  await assert.rejects(offsite.run(),/Invalid encrypted backup/);
  assert.equal(offsite.last(),null);
  assert.equal(offsite.running,false);
 });
});
test("S3 endpoint rejects non-HTTPS external URLs and incomplete credentials",()=>{
 assert.throws(()=>createS3Client({endpoint:"http://example.org",bucket:"comverxa-backups",region:"sjc",
   accessKeyId:"key",secretAccessKey:"secret"}),/requires HTTPS/);
 assert.throws(()=>createS3Client({endpoint:"https://s3.example.org",bucket:"bad!",region:"sjc",
   accessKeyId:"key",secretAccessKey:"secret"}),/bucket/);
});
