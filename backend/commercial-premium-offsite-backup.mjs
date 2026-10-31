/**
 * COMVERXA Commercial: encrypted, integrity-checked SQLite off-site backups.
 * No HTTP route exposes plaintext bytes, object-store keys or encryption keys.
 * Requires a separate S3-compatible bucket and 32-byte encryption key.
 * Each upload is downloaded and independently decrypted/checked before success.
 * No automatic deletion, recovery in-place, customer messages or billing.
 */
import {DatabaseSync} from "node:sqlite";
import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes} from "node:crypto";
import {readFileSync,writeFileSync,existsSync,unlinkSync,statSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {gzipSync,gunzipSync} from "node:zlib";
const sha=body=>createHash("sha256").update(body).digest("hex");
const hmac=(key,value)=>createHmac("sha256",key).update(value).digest();
const MAX_DB_BYTES=64*1024*1024;
function keyFromBase64(input){
 const key=Buffer.from(input||"","base64");
 if(key.length!==32)throw Error("Invalid backup encryption key");
 return key;
}
export function sealSqlite(bytes,key){
 if(!Buffer.isBuffer(bytes)||bytes.length<16||bytes.subarray(0,16).toString("utf8")!=="SQLite format 3\u0000")
  throw Error("Invalid SQLite backup");
 const iv=randomBytes(12);
 const cipher=createCipheriv("aes-256-gcm",keyFromBase64(key),iv);
 const zipped=gzipSync(bytes,{level:6});
 const header=Buffer.from("CVXBK1");
 cipher.setAAD(header);
 const crypt=Buffer.concat([cipher.update(zipped),cipher.final()]);
 return Buffer.concat([header,iv,cipher.getAuthTag(),crypt]);
}
export function openSealedSqlite(bytes,key){
 if(!Buffer.isBuffer(bytes)||bytes.length<34||bytes.subarray(0,6).toString()!=="CVXBK1")
  throw Error("Invalid encrypted backup");
 const cipher=createDecipheriv("aes-256-gcm",keyFromBase64(key),bytes.subarray(6,18));
 cipher.setAAD(bytes.subarray(0,6));cipher.setAuthTag(bytes.subarray(18,34));
 const plain=gunzipSync(Buffer.concat([cipher.update(bytes.subarray(34)),cipher.final()]),{maxOutputLength:MAX_DB_BYTES});
 if(plain.subarray(0,16).toString()!=="SQLite format 3\u0000")throw Error("Invalid restored database");
 return plain;
}
const uriPart=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>"%"+c.charCodeAt(0).toString(16).toUpperCase());
export function createS3Client({endpoint,bucket,region,accessKeyId,secretAccessKey,urlStyle="path",fetchImpl=fetch,now=()=>new Date()}={}){
 if(!endpoint||!bucket||!region||!accessKeyId||!secretAccessKey)throw Error("S3 configuration incomplete");
 const base=new URL(endpoint);
 if(base.protocol!=="https:"&&!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base.origin))
  throw Error("S3 endpoint requires HTTPS");
 if(base.username||base.password||base.search||base.hash||base.pathname!=="/")throw Error("Invalid S3 endpoint");
 if(!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)||!/^[a-z0-9-]{2,25}$/.test(region))
  throw Error("Invalid S3 bucket/region");
 if(!["path","virtual-host"].includes(urlStyle))throw Error("Invalid S3 style");
 async function send(method,key,body=null){
  if(typeof key!=="string"||!/^commercial\/\d{4}\/\d{2}\/[a-zA-Z0-9._-]+\.cvxbak$/.test(key))throw Error("Invalid object key");
  const canonicalPath="/"+(urlStyle==="path"?uriPart(bucket)+"/":"")+key.split("/").map(uriPart).join("/");
  const host=urlStyle==="path"?base.host:bucket+"."+base.host;
  const target=new URL(base.origin);
  target.host=host;target.pathname=canonicalPath;
  const date=now();
  const amzDate=date.toISOString().replace(/[:-]|\.\d{3}/g,""),dateStamp=amzDate.slice(0,8);
  const bodyHash=sha(body||Buffer.alloc(0));
  const canonicalHeaders="host:"+host+"\n"+"x-amz-content-sha256:"+bodyHash+"\n"+"x-amz-date:"+amzDate+"\n";
  const signed="host;x-amz-content-sha256;x-amz-date";
  const canonical=[method,canonicalPath,"",canonicalHeaders,signed,bodyHash].join("\n");
  const scope=dateStamp+"/"+region+"/s3/aws4_request";
  const stringToSign=["AWS4-HMAC-SHA256",amzDate,scope,sha(Buffer.from(canonical))].join("\n");
  const kDate=hmac("AWS4"+secretAccessKey,dateStamp);
  const kRegion=hmac(kDate,region),kService=hmac(kRegion,"s3"),signing=hmac(kService,"aws4_request");
  const auth="AWS4-HMAC-SHA256 Credential="+accessKeyId+"/"+scope+", SignedHeaders="+signed+
   ", Signature="+hmac(signing,stringToSign).toString("hex");
  const res=await fetchImpl(target,{method,body:body||undefined,headers:{
   host,"x-amz-content-sha256":bodyHash,"x-amz-date":amzDate,Authorization:auth
  },redirect:"error",signal:AbortSignal.timeout(120000)});
  if(!res.ok)throw Error("Object storage request failed: HTTP "+res.status);
  return res;
 }
 return {put:(key,bytes)=>send("PUT",key,bytes),get:async key=>Buffer.from(await(await send("GET",key)).arrayBuffer())};
}
export function createOffsiteBackup({db,dbPath,config,fetchImpl=fetch,now=()=>new Date()}){
 if(!db||typeof db.prepare!=="function"||typeof dbPath!=="string")throw Error("Database required");
 const secret=config?.encryptionKey;
 keyFromBase64(secret);
 const store=createS3Client({...config,fetchImpl,now});
 db.exec("CREATE TABLE IF NOT EXISTS cvx_pilot_offsite_backups (id INTEGER PRIMARY KEY AUTOINCREMENT,object_key TEXT NOT NULL,checksum TEXT NOT NULL,created_at TEXT NOT NULL,verified_at TEXT NOT NULL,size_bytes INTEGER NOT NULL)");
 let running=false;
 const last=()=>db.prepare("SELECT object_key,checksum,created_at,verified_at,size_bytes FROM cvx_pilot_offsite_backups ORDER BY id DESC LIMIT 1").get()||null;
 async function run(){
  if(running)throw Error("Backup already running");
  running=true;const snapshot=join(tmpdir(),"cvx-offsite-"+randomBytes(16).toString("hex")+".sqlite");
  const restoredSnapshot=join(tmpdir(),"cvx-restore-"+randomBytes(16).toString("hex")+".sqlite");
  let checkDb;
  try{
   if(statSync(dbPath).size>MAX_DB_BYTES)throw Error("Database exceeds direct backup size limit");
   db.prepare("VACUUM INTO ?").run(snapshot);
   if(statSync(snapshot).size>MAX_DB_BYTES)throw Error("Snapshot exceeds direct backup size limit");
   checkDb=new DatabaseSync(snapshot,{readOnly:true});
   if(!Object.values(checkDb.prepare("PRAGMA integrity_check").get()||{}).includes("ok"))
    throw Error("Snapshot integrity failed");
   checkDb.close();checkDb=null;
   const bytes=readFileSync(snapshot);
   const checksum=sha(bytes),encrypted=sealSqlite(bytes,secret);
   const date=now(),year=String(date.getUTCFullYear()),month=String(date.getUTCMonth()+1).padStart(2,"0");
   const objectKey="commercial/"+year+"/"+month+"/"+date.toISOString().replace(/[:.]/g,"-")+"-"+randomBytes(8).toString("hex")+".cvxbak";
   await store.put(objectKey,encrypted);
   const downloaded=await store.get(objectKey);
   const restored=openSealedSqlite(downloaded,secret);
   if(sha(restored)!==checksum)throw Error("Offsite restore check failed");
   writeFileSync(restoredSnapshot,restored,{flag:"wx",mode:0o600});
   checkDb=new DatabaseSync(restoredSnapshot,{readOnly:true});
   if(!Object.values(checkDb.prepare("PRAGMA integrity_check").get()||{}).includes("ok"))
    throw Error("Downloaded backup failed SQLite restore integrity");
   checkDb.close();checkDb=null;
   const stamp=now().toISOString();
   db.prepare("INSERT INTO cvx_pilot_offsite_backups(object_key,checksum,created_at,verified_at,size_bytes) VALUES(?,?,?,?,?)")
    .run(objectKey,checksum,date.toISOString(),stamp,encrypted.length);
   return {verified:true,restoredToTemporaryDatabase:true,createdAt:date.toISOString(),sizeBytes:encrypted.length,checksum};
  }finally{
   try{checkDb?.close()}catch{}
   try{if(existsSync(snapshot))unlinkSync(snapshot)}catch{}
   try{if(existsSync(restoredSnapshot))unlinkSync(restoredSnapshot)}catch{}
   running=false;
  }
 }
 return {run,last,get running(){return running}};
}
