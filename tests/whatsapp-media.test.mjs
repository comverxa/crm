import test from "node:test";
import assert from "node:assert/strict";
import { makeMediaHandler } from "../backend/whatsapp-media-evolution.mjs";

const pngBytes = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0]);
const mp4Bytes = Uint8Array.from([0,0,0,20,102,116,121,112,77,52,65,32,0,0,0,0,0,0,0,0]);

function makeFile(bytes, name, type) {
  return new File([bytes], name, {type});
}
function req(file, extra={}) {
  const form = new FormData();
  form.append("conversationId", extra.conversationId ?? "chat_2");
  form.append("idempotencyKey", extra.idempotencyKey ?? "media-send-uuid-1234567890");
  if(file)form.append("file",file);
  form.append("caption","Teste de anexo");
  // Campos que o cliente poderia falsificar DEVEM SER IGNORADOS.
  form.append("number","5511999999999");
  form.append("instance","other-customer");
  return new Request("https://app.comverxa.com.br/api/comverxa/whatsapp/media",{method:"POST",body:form});
}
function harness(overrides={}) {
  const seen=new Set();
  const calls=[];
  const finished=[];
  const deps={
    authorizeCsrf:async()=>true,
    rateLimit:async()=>true,
    authorizeConversation:async(_request,id)=>id==="chat_2"?
      {tenantId:"tenant-a",line:2,recipient:"5531999999999",instance:"whatsapp-2"}:null,
    reserveSend:async(t,k)=>{const id=t+":"+k;if(seen.has(id))return "duplicate";seen.add(id);return "reserved";},
    finishSend:async(t,k,result)=>{finished.push({tenant:t,key:k,result});},
    evolutionUrl:"https://evolution.example.test/",
    evolutionApiKey:"secret-only-on-server",
    fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({key:{id:"MSG_1"}}),{status:200});},
    ...overrides
  };
  return {handler:makeMediaHandler(deps),calls,finished};
}
test("imagem usa sendMedia e ignora destino/instância falsificados no navegador", async()=>{
  const h=harness();
  const r=await h.handler(req(makeFile(pngBytes,"foto.png","image/png")));
  assert.equal(r.status,202);
  assert.equal((await r.json()).messageId,"MSG_1");
  assert.match(h.calls[0].url,/\/message\/sendMedia\/whatsapp-2$/);
  const body=JSON.parse(h.calls[0].options.body);
  assert.equal(body.number,"5531999999999");
  assert.equal(body.mediatype,"image");
  assert.equal(body.mimetype,"image/png");
  assert.ok(body.media.length>0);
  assert.equal(h.finished.length,1);
});
test("áudio gravado mp4 usa sendWhatsAppAudio",async()=>{
  const h=harness();
  const r=await h.handler(req(makeFile(mp4Bytes,"gravacao.m4a","audio/mp4")));
  assert.equal(r.status,202);
  assert.match(h.calls[0].url,/\/message\/sendWhatsAppAudio\/whatsapp-2$/);
  const body=JSON.parse(h.calls[0].options.body);
  assert.equal(body.number,"5531999999999");
  assert.ok(body.audio.length>0);
  assert.ok(!("mediatype" in body));
});
test("contato não autorizado não pode enviar nem consultar fornecedor",async()=>{
  const h=harness();
  const r=await h.handler(req(makeFile(pngBytes,"foto.png","image/png"),{conversationId:"outro_cliente"}));
  assert.equal(r.status,403);
  assert.equal(h.calls.length,0);
});
test("proteção CSRF é obrigatória",async()=>{
  const h=harness({authorizeCsrf:async()=>false});
  const r=await h.handler(req(makeFile(pngBytes,"foto.png","image/png")));
  assert.equal(r.status,403);
  assert.equal(h.calls.length,0);
});
test("identificador repetido não dispara uma segunda mídia",async()=>{
  const h=harness();
  const first=await h.handler(req(makeFile(pngBytes,"foto.png","image/png")));
  const second=await h.handler(req(makeFile(pngBytes,"foto.png","image/png")));
  assert.equal(first.status,202);
  assert.equal(second.status,409);
  assert.equal(h.calls.length,1);
});
test("arquivo com MIME de imagem mas conteúdo inválido é rejeitado",async()=>{
  const h=harness();
  const r=await h.handler(req(makeFile(new TextEncoder().encode("not-png"),"falso.png","image/png")));
  assert.equal(r.status,415);
  assert.equal(h.calls.length,0);
});
test("sessão/isolamento/controle idempotente são exigidos no bootstrap",()=>{
  assert.throws(()=>makeMediaHandler({evolutionUrl:"https://evolution.example.test",evolutionApiKey:"x"}),/Adaptador não configurado/);
});

test("limita solicitações antes de ler arquivo e chamar Evolution",async()=>{
 const h=harness({rateLimit:async()=>false});
 const r=await h.handler(req(makeFile(pngBytes,"foto.png","image/png")));
 assert.equal(r.status,429); assert.equal(h.calls.length,0);
});
