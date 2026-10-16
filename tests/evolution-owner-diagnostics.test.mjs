import {strict as assert} from "node:assert";
Bun.env.EVOLUTION_API_URL="https://evolution.local/";
Bun.env.EVOLUTION_API_KEY="fixture-secret";
const liveFetch=globalThis.fetch;
globalThis.fetch=async function(url,opts){
 if(String(url).includes("/instance/fetchInstances")){
  assert.equal(opts.headers.apikey,"fixture-secret");
  return Response.json([
   {name:"WhatsApp 1",connectionStatus:"open",token:"never-return-this",apikey:"also-secret"},
   {instance:{instanceName:"WhatsApp 2"},connectionStatus:"close",token:"other-secret"},
  ]);
 }
 return liveFetch(url,opts);
};
await import("../backend/evolution-owner-diagnostics.js");
const server=Bun.serve({hostname:"127.0.0.1",port:52873,fetch(req){
 if(new URL(req.url).pathname==="/api/master/me")
  return (req.headers.get("cookie")||"").includes("owner=yes")?Response.json({role:"master"}):new Response("unauthorized",{status:401});
 return new Response("app");
}});
try{
 const base="http://127.0.0.1:52873";
 assert.equal((await liveFetch(base+"/api/master/whatsapp-health")).status,401);
 assert.equal((await liveFetch(base+"/admin/whatsapp-health")).status,401);
 assert.equal((await liveFetch(base+"/api/master/whatsapp-health",{method:"POST",headers:{Cookie:"owner=yes"}})).status,405);
 const res=await liveFetch(base+"/api/master/whatsapp-health",{headers:{Cookie:"owner=yes"}});
 assert.equal(res.status,200);
 const raw=await res.text();
 assert.equal(raw.includes("never-return-this"),false);
 assert.equal(raw.includes("also-secret"),false);
 assert.equal(raw.includes("fixture-secret"),false);
 const out=JSON.parse(raw);
 assert.equal(out.count,2);assert.equal(out.connected,1);
 assert.deepEqual(out.instances.map(x=>x.state),["open","close"]);
 assert.deepEqual(out.instances.map(x=>x.name),["WhatsApp 1","WhatsApp 2"]);
 const page=await liveFetch(base+"/admin/whatsapp-health",{headers:{Cookie:"owner=yes"}});
 assert.equal(page.status,200);
 assert.match(await page.text(),/Verificar conexões/);
 console.log("PASS | ADM auth, two instances, read only, 1 connected, tokens filtered, no provider secret exposure");
}finally{server.stop(true);globalThis.fetch=liveFetch}
