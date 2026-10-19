import test from "node:test";
import assert from "node:assert/strict";
import {mediaMimeFromFile} from "../frontend/whatsapp-media-composer.mjs";

test("iPhone: reconhece áudio m4a com MIME genérico",()=>{
  assert.equal(mediaMimeFromFile({name:"Gravação.M4A",type:"application/octet-stream"}),"audio/mp4");
});
test("reconhece gravação com parâmetros de codec",()=>{
  assert.equal(mediaMimeFromFile({name:"audio.webm",type:"audio/webm;codecs=opus"}),"audio/webm");
});
test("reconhece imagem via extensão quando navegador não informa MIME",()=>{
  assert.equal(mediaMimeFromFile({name:"foto.JPEG",type:""}),"image/jpeg");
});
test("não confunde outros arquivos com áudio e imagem",()=>{
  assert.equal(mediaMimeFromFile({name:"arquivo.pdf",type:"application/pdf"}),null);
  assert.equal(mediaMimeFromFile({name:"icone.svg",type:"image/svg+xml"}),null);
});
