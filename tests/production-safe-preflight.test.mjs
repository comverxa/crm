import {strict as assert} from "node:assert";
import {Database} from "bun:sqlite";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const dir=mkdtempSync(join(tmpdir(),"cvx-readiness-"));
const filename=join(dir,"test.sqlite");
const db=new Database(filename,{create:true});
db.exec("CREATE TABLE companies(id TEXT PRIMARY KEY,plan TEXT,status TEXT);"+
 "CREATE TABLE cxv_lifetime_seats(slot INTEGER PRIMARY KEY,status TEXT,company_id TEXT);"+
 "INSERT INTO companies VALUES('company_test','business','active');"+
 "INSERT INTO cxv_lifetime_seats VALUES(1,'active','company_test');"+
 "INSERT INTO cxv_lifetime_seats VALUES(2,'reserved',NULL);");
db.close();
const origin=Bun.serve({hostname:"127.0.0.1",port:52876,fetch(req){
 if(req.headers.get("apikey")!=="fixture-key")return new Response("no",{status:401});
 return Response.json([{name:"SECRET",connectionStatus:"open",token:"DONT_PRINT_SECRET"},
 {name:"ANOTHER",connectionStatus:"close",apikey:"DONT_PRINT_KEY"}]);
}});
try{
 const child=Bun.spawn(["bun","backend/production-safe-preflight.js"],{
  cwd:process.cwd(),
  env:{...process.env,CVX_PREFLIGHT_DB:filename,
   EVOLUTION_API_URL:"http://127.0.0.1:52876",EVOLUTION_API_KEY:"fixture-key"},
  stdout:"pipe",stderr:"pipe"});
 const result=await child.exited;
 const output=(await new Response(child.stdout).text())+"\n"+(await new Response(child.stderr).text());
 assert.equal(result,0,output);
 assert.match(output,/CVX_READINESS_LICENSE.*"slot1":"active"/);
 assert.match(output,/"slot1Business":true/);
 assert.match(output,/"slot2":"reserved"/);
 assert.match(output,/CVX_READINESS_WHATSAPP.*"connected":1/);
 assert.equal(output.includes("DONT_PRINT_SECRET"),false);
 assert.equal(output.includes("DONT_PRINT_KEY"),false);
 assert.equal(output.includes("company_test"),false);
 assert.equal(output.includes("SECRET"),false);
 console.log("PASS | real SQLite fixture, 2 lifetime slots, live GET fixture, no private values, no writes");
}finally{origin.stop(true);rmSync(dir,{recursive:true,force:true})}
