import test from "node:test";
import assert from "node:assert/strict";
import {makeMediaViewHandler} from "../backend/whatsapp-media-view.mjs";

const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const wav=Buffer.from([0x4f,0x67,0x67,0x53,0,0,0,0]);
function setup(overrides={}){
 const calls=[];
 const deps={
 authorizeMessage:async(req,conversationId,messageId)=>{
   if(conversationId==="chat2"&&messageId==="msg1")
     return {tenantId:"company_a",instance:"wa_2",providerMessageId:"ABCD01234",type:"image"};
   if(conversationId==="chat2"&&messageId==="msg2")
     return {tenantId:"company_a",instance:"wa_2",providerMessageId:"EFGH5678",type:"audio"};
   return null;
 },
 rateLimit:async()=>true,
 evolutionUrl:"https://example.test",
 evolutionApiKey:"server-secret",
 fetchImpl:async(url,opts)=>{
   calls.push({url,opts});
   return new Response(JSON.stringify({mimetype:"image/png",base64:png.toString("base64")}),{status:200});
 },
 ...overrides};
 return {handler:makeMediaViewHandler(deps),calls};
}
const request=(conv="chat2",msg="msg1")=>new Request("https://app.comverxa.com.br/api/comverxa/whatsapp/media/view?conversationId="+encodeURIComponent(conv)+"&messageId="+encodeURIComponent(msg));
test("serve a media binary after tenant/record authorization",async()=>{
 const h=setup();
 const r=await h.handler(request());
 assert.equal(r.status,200);
 assert.equal(r.headers.get("Content-Type"),"image/png");
 assert.equal(r.headers.get("Cache-Control"),"no-store, private");
 assert.deepEqual(Buffer.from(await r.arrayBuffer()),png);
 assert.match(h.calls[0].url,/getBase64FromMediaMessage\/wa_2$/);
 const body=JSON.parse(h.calls[0].opts.body);
 assert.equal(body.message.key.id,"ABCD01234");
});
test("never calls Evolution for unrelated tenant/contact",async()=>{
 const h=setup();const r=await h.handler(request("foreign","msg1"));
 assert.equal(r.status,403);assert.equal(h.calls.length,0);
});
test("audio type mismatch blocked",async()=>{
 const h=setup();const r=await h.handler(request("chat2","msg2"));
 assert.equal(r.status,415);
});
test("limit is checked before provider call",async()=>{
 const h=setup({rateLimit:async()=>false});
 const r=await h.handler(request());
 assert.equal(r.status,429);assert.equal(h.calls.length,0);
});
test("rejects oversized provider payload",async()=>{
 const payload="A".repeat(24*1024*1024);
 const h=setup({fetchImpl:async()=>new Response(JSON.stringify({mimetype:"image/png",base64:payload}),{status:200})});
 const r=await h.handler(request());
 assert.equal(r.status,413);
});
test("rejects invalid provider response MIME",async()=>{
 const h=setup({fetchImpl:async()=>new Response(JSON.stringify({mimetype:"text/html",base64:"PGgxPkhlbGxvPC9oMT4="}),{status:200})});
 const r=await h.handler(request());
 assert.equal(r.status,415);
});
test("accepts matching image data URI only",async()=>{
 const h=setup({fetchImpl:async()=>new Response(JSON.stringify({mimetype:"image/png",base64:"data:image/png;base64,"+png.toString("base64")}),{status:200})});
 const r=await h.handler(request());
 assert.equal(r.status,200);
});
test("rejects mismatching MIME data URI",async()=>{
 const h=setup({fetchImpl:async()=>new Response(JSON.stringify({mimetype:"image/png",base64:"data:image/jpeg;base64,"+png.toString("base64")}),{status:200})});
 const r=await h.handler(request());
 assert.equal(r.status,415);
});
test("must configure tenant auth and rate limit",()=>{
 assert.throws(()=>makeMediaViewHandler({evolutionUrl:"https://example.test",evolutionApiKey:"x"}),/autenticação/);
});

test("rejeita HTML disfarçado de PNG no provedor",async()=>{
 const fake=Buffer.from("<html>nunca exibir</html>");
 const h=setup({fetchImpl:async()=>new Response(JSON.stringify({mimetype:"image/png",base64:fake.toString("base64")}),{status:200})});
 const r=await h.handler(request());
 assert.equal(r.status,415);
 assert.equal(r.headers.get("X-Content-Type-Options"),"nosniff");
});
test("aceita áudio OGG quando MIME e conteúdo conferem",async()=>{
 const h=setup({fetchImpl:async()=>new Response(JSON.stringify({mimetype:"audio/ogg",base64:wav.toString("base64")}),{status:200})});
 const r=await h.handler(request("chat2","msg2"));
 assert.equal(r.status,200);
 assert.equal(r.headers.get("Content-Type"),"audio/ogg");
 assert.deepEqual(Buffer.from(await r.arrayBuffer()),wav);
});
