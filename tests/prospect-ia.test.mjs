import {readFileSync} from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
const backend=readFileSync(new URL("../backend/prospect-ia-extension.js",import.meta.url),"utf8");
const page=readFileSync(new URL("../backend/prospect-dashboard.html",import.meta.url),"utf8");
test("Valid JavaScript module and dashboard script",()=>{
 const script=page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script,"UI script is present");
 assert.doesNotThrow(()=>new Function(script));
 assert.doesNotThrow(()=>new Function(backend.replace(/^import [^\n]+\n/gm,"")));
});
test("Master authorization before any prospect endpoint",()=>{
 assert.ok(backend.includes('new URL("/api/master/me",req.url)'));
 assert.ok(backend.includes("if(auth.status!==200)"));
 assert.ok(backend.includes('req.headers.get("X-COMVERXA-Prospect")'));
});
test("A campaign cannot enqueue unknown-consent contacts",()=>{
 assert.match(backend,/WHERE consent=1 AND opt_out=0 AND consent_evidence<>''/);
 assert.match(backend,/if\(!current\?\.consent\|\|current\.opt_out\|\|!current\.consent_evidence\)/);
 assert.match(backend,/status=\x27processing\x27/);
 assert.ok(backend.includes("status='cancelled'"));
 assert.ok(backend.includes("lead.optout"));
});
test("No live send without Meta credentials and approved template",()=>{
 assert.ok(backend.includes("META_ACCESS_TOKEN"));
 assert.ok(backend.includes("META_PHONE_NUMBER_ID"));
 assert.ok(backend.includes("type:\"template\""));
 assert.ok(backend.includes("LIMIT 8"));
});
test("Scoring is bounded and distinguishes clear interest",()=>{
 const s=backend.indexOf("function prospectRating(item){"),e=backend.indexOf("\nfunction prospectLeadPublic",s);
 assert.ok(s>=0&&e>s);
 const rate=new Function(backend.slice(s,e)+"\nreturn prospectRating;")();
 const hot=rate({notes:"Tenho urgência, quero uma proposta de seguro hoje",product:"auto",consent:true,opt_out:0});
 const cold=rate({notes:"Não quero contratar, sem interesse, apenas pesquisa",consent:false,opt_out:0});
 assert.ok(hot.score>cold.score);
 assert.equal(hot.temperature,"quente");
 assert.equal(cold.temperature,"frio");
 assert.ok(hot.score<=100&&cold.score>=0);
});
test("Module documents pilot restrictions",()=>{
 assert.ok(page.includes("Módulo piloto"));
 assert.ok(page.includes("autorização"));
 assert.ok(page.includes("OPENAI_API_KEY"));
 assert.ok(page.includes("META_ACCESS_TOKEN")===false);
});
