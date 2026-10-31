import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../site/comverxa-premium-comercial.html",import.meta.url),"utf-8");

test("premium HTML uses a responsive viewport, mobile navigation and visible demo disclaimer",()=>{
 assert.match(html,/<meta name="viewport"/);
 assert.match(html,/@media\(max-width:760px\)/);
 assert.match(html,/Dados inteiramente fictícios/);
 assert.match(html,/Ainda não integrada ao CRM/);
});
test("navigation includes Vendly-plus features and responsible payment placeholder",()=>{
 for(const id of ["painel","vendas","leads","metas","comissoes","renovacoes","perfil","assinatura"])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/Cobrança real desativada/);
 assert.match(html,/window\.print\(\)/);
});
test("browser script syntax is valid without external dependencies",()=>{
 const match=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(match?.[1],"Browser script not found");
 assert.doesNotThrow(()=>new vm.Script(match[1],{filename:"comverxa-premium-comercial.html"}));
 assert.doesNotMatch(html,/<script[^>]+src=/i);
});
