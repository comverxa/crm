// COMVERXA Prospect IA Standalone (isolated pilot, single owner, no customer tenancy).
// Published from the same source as backend/prospect-ia-extension.js and prospect-dashboard.html.
// IMPORTANT: production login requires PROSPECT_ADMIN_PASSWORD_SCRYPT, PROSPECT_ADMIN_EMAIL,
// PROSPECT_SESSION_SECRET. Absence fails closed.
import {scryptSync,createHmac,timingSafeEqual} from "node:crypto";
const CVX_OWNER_SESSION_COOKIE="__Host-cvxprospect";
const cvxState={fails:0,window:0};
function cvxSafeEqual(a,b){
 const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));
 return aa.length===bb.length && timingSafeEqual(aa,bb);
}
function cvxAuthConfigured(){return !!(Bun.env.PROSPECT_ADMIN_PASSWORD_SCRYPT&&Bun.env.PROSPECT_SESSION_SECRET&&Bun.env.PROSPECT_ADMIN_EMAIL)}
function cvxValidPassword(value){
 try{if(!cvxAuthConfigured())return false;
 const [salt,digest]=String(Bun.env.PROSPECT_ADMIN_PASSWORD_SCRYPT).split(":");
 if(!/^[a-f0-9]{32}$/i.test(salt)||!/^[a-f0-9]{64}$/i.test(digest))return false;
 const produced=scryptSync(value,Buffer.from(salt,"hex"),32,{N:16384,r:8,p:1});
 return timingSafeEqual(produced,Buffer.from(digest,"hex"));
 }catch{return false}
}
function cvxSignature(expires){return createHmac("sha256",Bun.env.PROSPECT_SESSION_SECRET||"").update("cvx-prospect-v1:"+expires).digest("hex")}
function cvxAuthenticated(req){
 if(!cvxAuthConfigured())return false;
 const cookies=req.headers.get("cookie")||"";
 const value=new RegExp("(?:^|;\\s*)"+CVX_OWNER_SESSION_COOKIE+"=([^;]+)").exec(cookies)?.[1]||"";
 const parts=value.split(".");
 if(parts.length!==2||!/^[0-9]{13}$/.test(parts[0])||!/^[a-f0-9]{64}$/.test(parts[1]))return false;
 const exp=Number(parts[0]);
 return Number.isSafeInteger(exp)&&exp>Date.now()&&cvxSafeEqual(parts[1],cvxSignature(parts[0]));
}
const cvxLoginPage=String.raw`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>COMVERXA Prospect IA | Acesso</title><style>*{box-sizing:border-box}body{margin:0;display:grid;place-items:center;min-height:100vh;padding:20px;color:#23324c;font-family:Inter,system-ui,sans-serif;background:linear-gradient(140deg,#0c1934,#064a57)}main{width:min(100%,425px);background:#fff;border-radius:20px;padding:34px;box-shadow:0 18px 75px #0005}small{color:#0b8d86;font-weight:800;letter-spacing:.14em}h1{font-size:29px;letter-spacing:-.03em}p{color:#5c6d82;font-size:14px;line-height:1.6}label{display:block;font-size:13px;margin:17px 0 7px;font-weight:750}input{width:100%;padding:14px;border:1px solid #d6e1ee;border-radius:10px;font:inherit}button{margin-top:20px;background:#075d67;color:#fff;padding:15px;width:100%;border:0;border-radius:10px;font-weight:750;cursor:pointer}a{color:#075d67;text-decoration:none;font-size:13px}.error{color:#a12626}</style></head><body><main><small>COMVERXA / PROSPECT IA</small><h1>Entrar no painel</h1><p>Painel piloto com acesso independente, reservado ao responsável da plataforma.</p><form method="post" action="/login"><label>E-mail administrador</label><input name="email" type="email" required autocomplete="username"><label>Senha</label><input name="password" type="password" required autocomplete="current-password"><button type="submit">Acessar painel</button></form><p>Solicitações inválidas não fornecem acesso. Contate o administrador para redefinir as credenciais.</p><a href="https://app.comverxa.com.br/">Voltar ao COMVERXA CRM</a></main></body></html>`;
async function cvxFallback(req){
 const u=new URL(req.url),p=u.pathname;
 if(p==="/healthz")return new Response("healthy",{status:200,headers:{"Content-Type":"text/plain","Cache-Control":"no-store"}});
 if(p==="/api/master/me")return cvxAuthenticated(req)?new Response(JSON.stringify({role:"owner",authenticated:true}),{headers:{"Content-Type":"application/json","Cache-Control":"no-store"}}):new Response(JSON.stringify({error:"Não autorizado"}),{status:401,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
 if(p==="/"||p==="/login"&&req.method==="GET"){
  if(cvxAuthenticated(req))return Response.redirect(new URL("/prospect-ia",req.url),302);
  return new Response(cvxLoginPage,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Frame-Options":"DENY","Content-Security-Policy":"default-src 'none'; form-action 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
 }
 if(p==="/login"&&req.method==="POST"){
  const origin=req.headers.get("origin");if(origin&&origin!==u.origin)return new Response("Origem inválida",{status:403});
  if(!cvxAuthConfigured())return new Response("Credenciais administrativas não configuradas",{status:503});
  if(Date.now()>cvxState.window){cvxState.fails=0;cvxState.window=Date.now()+15*60*1000;}
  if(cvxState.fails>=10)return new Response("Acesso temporariamente suspenso",{status:429});
  const fd=await req.formData().catch(()=>null);
  const email=String(fd?.get("email")||"").trim().toLowerCase().slice(0,160);
  const password=String(fd?.get("password")||"").slice(0,200);
  if(!cvxSafeEqual(email,String(Bun.env.PROSPECT_ADMIN_EMAIL).toLowerCase())||!cvxValidPassword(password)){
   cvxState.fails++;return new Response("Credenciais inválidas",{status:401,headers:{"Cache-Control":"no-store"}});
  }
  cvxState.fails=0;
  const exp=String(Date.now()+8*60*60*1000);
  const cookie=CVX_OWNER_SESSION_COOKIE+"="+exp+"."+cvxSignature(exp)+"; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800";
  return new Response(null,{status:303,headers:{"Location":"/prospect-ia","Set-Cookie":cookie,"Cache-Control":"no-store"}});
 }
 if(p==="/logout"&&req.method==="POST"){
  const origin=req.headers.get("origin");if(origin&&origin!==u.origin)return new Response("Origem inválida",{status:403});
  return new Response(null,{status:303,headers:{"Location":"/login","Set-Cookie":CVX_OWNER_SESSION_COOKIE+"=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0","Cache-Control":"no-store"}});
 }
 return new Response("Rota não encontrada",{status:404});
}

const COMVERXA_PROSPECT_PAGE = "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>COMVERXA | Prospect IA</title><style>\n:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;color:#1d2940;background:#f5f7fc}\n*{box-sizing:border-box}body{margin:0}header{background:linear-gradient(110deg,#101a35,#172f55 65%,#095c65);color:#fff;padding:24px clamp(18px,4vw,56px)}nav{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}nav a{color:#d4e7fd;text-decoration:none;font-size:14px}header small{letter-spacing:.16em;color:#6de0d8;font-weight:800}h1{font-size:clamp(29px,4vw,43px);letter-spacing:-.045em;margin:14px 0 8px}header p{color:#d6e2f1;line-height:1.55;margin:0;max-width:850px}main{max-width:1350px;padding:26px 18px 70px;margin:auto}.stats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}.stat,.panel{background:white;border:1px solid #e3e9f2;box-shadow:0 12px 35px #101d3710;border-radius:18px}.stat{padding:19px 16px}.stat small{font-size:12px;color:#617088;font-weight:650}.stat b{display:block;font-size:29px;letter-spacing:-.035em;margin-top:6px}.panels{display:grid;grid-template-columns:1.15fr .85fr;gap:18px;margin-top:22px}.panel{padding:23px;min-width:0}.wide{grid-column:1/-1}h2{font-size:19px;margin:0 0 9px}p.note{font-size:13px;line-height:1.5;color:#65738b;margin:4px 0 18px}.line{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.field{display:flex;flex-direction:column;gap:5px;min-width:120px;flex:1}.field label{font-size:12px;font-weight:750;color:#46556f}input,select,textarea{width:100%;border:1px solid #d9e1ed;border-radius:10px;padding:11px;font:inherit;font-size:14px;min-width:0;background:#fff;color:#21324c}input:focus,textarea:focus{outline:2px solid #82d9d5;outline-offset:1px}textarea{resize:vertical;min-height:75px}.control{display:flex;align-items:center;gap:9px;padding:10px 0;color:#52627a;font-size:13px}.control input{width:16px}.btn{border:0;background:#075c66;color:#fff;cursor:pointer;font-weight:750;font-size:13px;border-radius:10px;padding:11px 16px}.btn:hover{background:#064d57}.btn.secondary{background:#e9eff9;color:#1c3b58}.btn.secondary:hover{background:#dbe5f2}.btn.danger{background:#fff0ee;color:#a02c29}.btn:disabled{opacity:.5;cursor:not-allowed}.pill{display:inline-block;border-radius:99px;padding:4px 9px;font-size:11px;font-weight:800;background:#e8eef7;color:#365472}.pill.hot{background:#ffecdf;color:#ad5400}.pill.warm{background:#fff6ce;color:#866300}.pill.cold{background:#e1f0ff;color:#18578a}.pill.yes{background:#dff6e7;color:#176d48}.scroll{overflow:auto;max-height:420px}table{border-collapse:collapse;width:100%;min-width:780px}th,td{text-align:left;border-bottom:1px solid #edf1f6;padding:13px 12px;font-size:13px}th{font-size:11px;color:#61718a;text-transform:uppercase;letter-spacing:.055em;position:sticky;top:0;background:white}td{vertical-align:middle}td small{display:block;color:#687891}.muted{font-size:12px;color:#61718a}.status{font-size:13px;padding:13px 16px;background:#eaf0f7;border:1px solid #dbe7f4;border-radius:12px;margin:18px 0;white-space:pre-line}.status.error{background:#fff0ef;color:#982d36;border-color:#ffd9d9}.status.success{background:#e8f9ef;color:#136b47;border-color:#c7f0d7}footer{color:#718198;font-size:12px;line-height:1.6;margin-top:28px}@media(max-width:900px){.stats{grid-template-columns:repeat(3,1fr)}.panels{grid-template-columns:1fr}}@media(max-width:560px){.stats{grid-template-columns:repeat(2,1fr)}.panel{padding:18px}header{padding:20px}}\n</style></head><body>\n<header><nav><small>COMVERXA / PROSPECT IA</small><div class=\"line\"><a href=\"https://app.comverxa.com.br/\">CRM</a><a href=\"https://app.comverxa.com.br/admin\">ADM Master</a><a href=\"https://app.comverxa.com.br/admin/finance\">Financeiro</a></div></nav><h1>Inteligência para gerar oportunidades.</h1><p>Organize prospecção, qualifique leads, registre autorizações e prepare campanhas com templates aprovados da API Oficial da Meta. Módulo piloto com acesso administrativo independente.</p></header>\n<main>\n<section class=\"stats\"><div class=\"stat\"><small>Leads</small><b id=\"total\">—</b></div><div class=\"stat\"><small>Quentes</small><b id=\"hot\">—</b></div><div class=\"stat\"><small>Mornos</small><b id=\"warm\">—</b></div><div class=\"stat\"><small>Frios</small><b id=\"cold\">—</b></div><div class=\"stat\"><small>Com autorização</small><b id=\"opted\">—</b></div><div class=\"stat\"><small>Mensagens enviadas</small><b id=\"sent\">—</b></div></section>\n<div class=\"status\" id=\"status\" role=\"status\" aria-live=\"polite\">Consultando o módulo e os indicadores…</div>\n<section class=\"panels\">\n<div class=\"panel\"><h2>Adicionar oportunidade</h2><p class=\"note\">A captação aceita contatos inseridos pelo operador. Nenhum envio é permitido sem evidência de autorização específica.</p>\n<form id=\"leadForm\"><div class=\"line\"><div class=\"field\"><label>Nome / empresa *</label><input name=\"name\" required maxlength=\"120\" placeholder=\"Cliente ou empresa\"></div><div class=\"field\"><label>WhatsApp com DDD *</label><input name=\"phone\" required maxlength=\"18\" placeholder=\"5531999999999\"></div></div>\n<div class=\"line\"><div class=\"field\"><label>Cidade</label><input name=\"city\" placeholder=\"Belo Horizonte\"></div><div class=\"field\"><label>UF</label><input name=\"uf\" maxlength=\"2\" placeholder=\"MG\"></div><div class=\"field\"><label>Produto</label><select name=\"product\"><option value=\"auto\">Seguro auto</option><option value=\"proteção veicular\">Proteção veicular</option><option value=\"vida\">Seguro de vida</option><option value=\"residencial\">Residencial</option><option value=\"frota\">Frota empresarial</option></select></div></div>\n<div class=\"field\"><label>Interesse e observações</label><textarea name=\"notes\" placeholder=\"Cliente pediu cotação para hoje e deseja assistência 24h…\"></textarea></div>\n<label class=\"control\"><input id=\"consent\" type=\"checkbox\"> Tenho autorização verificável para contato comercial pelo WhatsApp</label>\n<div class=\"field\"><label>Registro da autorização (obrigatório se marcado)</label><input name=\"consent_evidence\" placeholder=\"Formulário site, data, campanha de opt-in, prova…\"></div>\n<button class=\"btn\" type=\"submit\">Cadastrar lead</button></form></div>\n<div class=\"panel\"><h2>Qualificação automatizada</h2><p class=\"note\">A pontuação por regras funciona sem chave. A IA generativa usa um provedor externo apenas quando OPENAI_API_KEY é configurada no servidor.</p>\n<div class=\"line\"><button class=\"btn secondary\" id=\"scoreButton\">Reclassificar meus leads</button><span class=\"pill\" id=\"aiStatus\">IA: verificando</span></div><div class=\"field\" style=\"margin-top:17px\"><label>Contexto para análise comercial por IA</label><textarea id=\"aiContext\" style=\"min-height:115px\" placeholder=\"O cliente deseja cotação para seguro auto, possui um veículo 2023 e solicita assistência 24 horas. Quais perguntas devo fazer?\"></textarea></div><button class=\"btn\" id=\"aiButton\">Gerar orientação com IA</button><div id=\"aiResult\" class=\"status\" style=\"display:none\"></div><p class=\"note\" style=\"margin-top:16px\">Não insira dados sensíveis ou documentos pessoais na IA. As respostas não substituem análise técnica nem cotação de seguradora.</p></div>\n<div class=\"panel\"><h2>Importação em lote</h2><p class=\"note\">Cole um CSV com separador ponto e vírgula e cabeçalho <code>name;phone;city;uf;notes;consent;consent_evidence</code>. Até 300 linhas por envio, com deduplicação por telefone.</p><textarea id=\"csv\" style=\"min-height:150px\" placeholder=\"name;phone;city;uf;notes;consent;consent_evidence&#10;Ana;5531999999999;Contagem;MG;Solicitou proposta;false;\"></textarea><div class=\"line\" style=\"margin-top:11px\"><button class=\"btn secondary\" id=\"importButton\">Importar CSV</button><span class=\"muted\">Contato não autorizado permanece fora das campanhas.</span></div></div>\n<div class=\"panel\"><h2>Campanhas com API Oficial</h2><p class=\"note\">Crie uma fila apenas de leads com autorização. O envio é feito em lotes limitados mediante confirmação, via template aprovado da Meta. Nenhum número é enviado enquanto a integração não estiver configurada.</p><div class=\"field\"><label>Nome da campanha</label><input id=\"campaignName\" placeholder=\"Renovação segura – outubro\"></div><div class=\"field\"><label>Nome exato do template aprovado</label><input id=\"templateName\" placeholder=\"renovacao_seguro_auto\"></div><div class=\"line\" style=\"margin-top:12px\"><button id=\"campaignButton\" class=\"btn\">Criar campanha</button><span class=\"pill\" id=\"metaStatus\">Meta: verificando</span></div><h2 style=\"margin-top:22px\">Campanhas</h2><div id=\"campaigns\" class=\"muted\">Carregando…</div></div>\n<div class=\"panel wide\"><div class=\"line\" style=\"justify-content:space-between\"><div><h2>Base de oportunidades</h2><p class=\"note\">Classificação, comprovação de permissão, localização e descadastro de cada contato.</p></div><button class=\"btn secondary\" id=\"refreshButton\">Atualizar</button></div><div class=\"scroll\"><table><thead><tr><th>Cliente</th><th>Telefone</th><th>Segmento</th><th>Classificação</th><th>Autorização</th><th>Ações</th></tr></thead><tbody id=\"leadRows\"><tr><td colspan=\"6\">Carregando leads…</td></tr></tbody></table></div></div>\n</section><footer>COMVERXA Prospect IA • Módulo piloto. O envio em massa requer autorização dos destinatários, templates aprovados, configuração da Cloud API e verificação das políticas da Meta. Contatos importados sem autorização não são elegíveis. Integrações de captação automática via provedores licenciados e acesso multiempresa ainda não estão habilitados.</footer>\n</main><script>\nconst $=(id)=>document.getElementById(id);\nfunction el(tag,text){const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);return x}\nfunction notice(s,error=false){const x=$(\"status\");x.textContent=s;x.className=\"status \"+(error?\"error\":\"success\")}\nasync function call(path,data){const r=await fetch(\"/api/master/prospect/\"+path,{method:data===undefined?\"GET\":\"POST\",credentials:\"same-origin\",headers:data===undefined?{}:{\"Content-Type\":\"application/json\",\"X-COMVERXA-Prospect\":\"1\"},body:data===undefined?undefined:JSON.stringify(data)});let j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||\"Não foi possível concluir\");return j}\nfunction button(text,cb,klass){const b=el(\"button\",text);b.type=\"button\";b.className=\"btn \"+(klass||\"secondary\");b.addEventListener(\"click\",cb);return b}\nasync function reload(){try{const [overview,leads,campaigns]=await Promise.all([call(\"overview\"),call(\"leads\"),call(\"campaigns\")]);for(const [k,v] of Object.entries(overview.counts))if($(k))$(k).textContent=Number(v).toLocaleString(\"pt-BR\");$(\"aiStatus\").textContent=\"IA: \"+(overview.integration.openai?\"configurada\":\"requer chave\");$(\"metaStatus\").textContent=\"Meta: \"+(overview.integration.meta?\"configurada\":\"requer credenciais\");const rows=$(\"leadRows\");rows.replaceChildren();for(const l of leads.items){const tr=el(\"tr\");const a=el(\"td\");a.append(el(\"strong\",l.name),el(\"small\",[l.city,l.uf].filter(Boolean).join(\" / \")));const p=el(\"td\",l.phone);const product=el(\"td\",l.product);const t=el(\"td\");const pill=el(\"span\",l.temperature+\" · \"+l.score);pill.className=\"pill \"+(l.temperature===\"quente\"?\"hot\":l.temperature===\"frio\"?\"cold\":\"warm\");t.append(pill);const c=el(\"td\");const cp=el(\"span\",l.opt_out?\"DESCADASTRADO\":l.consent?\"AUTORIZADO\":\"NÃO AUTORIZADO\");cp.className=\"pill \"+(l.consent&&!l.opt_out?\"yes\":\"\");c.append(cp);const act=el(\"td\");if(!l.opt_out)act.append(button(\"Descadastrar\",()=>optout(l.id),\"danger\"));tr.append(a,p,product,t,c,act);rows.append(tr)}if(leads.items.length===0){const tr=el(\"tr\"),td=el(\"td\",\"Nenhum lead cadastrado.\");td.colSpan=6;tr.append(td);rows.append(tr)}const div=$(\"campaigns\");div.replaceChildren();for(const c of campaigns.items){const entry=el(\"div\");entry.style.cssText=\"border-top:1px solid #edf1f6;padding:12px 0\";entry.append(el(\"strong\",c.name),el(\"div\",\"Template: \"+c.template_name+\" | \"+c.sent+\" enviados | \"+c.pending+\" pendentes\"));if(c.pending>0)entry.append(button(\"Enviar até 8 com confirmação\",()=>send(c.id)));div.append(entry)}if(!campaigns.items.length)div.textContent=\"Nenhuma campanha ainda.\";notice(\"Painel atualizado. Ações externas permanecem desabilitadas até suas credenciais serem configuradas.\");}catch(e){notice(e.message,true)}}\nasync function optout(id){if(!confirm(\"Revogar permissão e cancelar futuros envios para este contato?\"))return;try{await call(\"leads/\"+id+\"/optout\",{});notice(\"Descadastro aplicado.\");await reload()}catch(e){notice(e.message,true)}}\nasync function send(id){if(!confirm(\"Confirmar envio real de até 8 mensagens via template Meta APROVADO, somente a contatos com autorização registrada?\"))return;try{const r=await call(\"campaigns/\"+id+\"/send\",{});alert(\"Enviados: \"+r.sent+\" | Falhas: \"+r.failed+\" | Restantes: \"+r.remaining);await reload()}catch(e){notice(e.message,true)}}\n$(\"leadForm\").addEventListener(\"submit\",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const data=Object.fromEntries(f.entries());data.consent=$(\"consent\").checked;try{await call(\"leads\",data);e.currentTarget.reset();await reload();notice(\"Lead cadastrado com sucesso.\")}catch(e){notice(e.message,true)}});\n$(\"scoreButton\").addEventListener(\"click\",async()=>{try{const r=await call(\"score\",{});await reload();notice(r.updated+\" leads reclassificados por regras.\")}catch(e){notice(e.message,true)}});\n$(\"aiButton\").addEventListener(\"click\",async()=>{try{const d=await call(\"ai\",{context:$(\"aiContext\").value});$(\"aiResult\").textContent=d.answer;$(\"aiResult\").style.display=\"block\"}catch(e){notice(e.message,true)}});\n$(\"importButton\").addEventListener(\"click\",async()=>{try{const lines=$(\"csv\").value.trim().split(/\\r?\\n/).filter(Boolean);const h=lines.shift().split(\";\").map(x=>x.trim().toLowerCase());if(!h.includes(\"name\")||!h.includes(\"phone\"))throw Error(\"O CSV precisa ter colunas name e phone\");const rows=lines.map(line=>{const cells=line.split(\";\");const item={};for(let i=0;i<h.length;i++)item[h[i]]=(cells[i]||\"\").trim();return item});const r=await call(\"import\",{rows});await reload();notice(\"Importados: \"+r.imported+\" | Atualizados: \"+r.updated+\" | Rejeitados: \"+r.rejected.length+(r.rejected.length?\"\\n\"+JSON.stringify(r.rejected.slice(0,8)):\"\"))}catch(e){notice(e.message,true)}});\n$(\"campaignButton\").addEventListener(\"click\",async()=>{try{const r=await call(\"campaigns\",{name:$(\"campaignName\").value,template_name:$(\"templateName\").value});await reload();notice(\"Campanha criada com \"+r.queued+\" contatos elegíveis. Nenhuma mensagem foi enviada.\")}catch(e){notice(e.message,true)}});\n$(\"refreshButton\").addEventListener(\"click\",reload);reload();\n</script></body></html>";
// COMVERXA Prospect IA (pilot master-only). No credentials in source.
// Installed before original Bun.serve startup; wraps routes without replacing the CRM.
import { Database as ProspectDatabase } from "bun:sqlite";
import { mkdirSync as prospectMkdirSync } from "node:fs";

prospectMkdirSync("/data", {recursive:true});
const prospectDb = new ProspectDatabase("/data/comverxa-prospect-ia.sqlite", {create:true});
prospectDb.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
prospectDb.exec("CREATE TABLE IF NOT EXISTS prospect_leads (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, email TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', uf TEXT NOT NULL DEFAULT '', product TEXT NOT NULL DEFAULT 'auto', origin TEXT NOT NULL DEFAULT 'manual', notes TEXT NOT NULL DEFAULT '', temperature TEXT NOT NULL DEFAULT 'morno', score INTEGER NOT NULL DEFAULT 50, consent INTEGER NOT NULL DEFAULT 0, consent_evidence TEXT NOT NULL DEFAULT '', consent_at TEXT, opt_out INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
prospectDb.exec("CREATE TABLE IF NOT EXISTS prospect_campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, template_name TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'pt_BR', status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL)");
prospectDb.exec("CREATE TABLE IF NOT EXISTS prospect_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL, lead_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', provider_id TEXT, error TEXT, sent_at TEXT, created_at TEXT NOT NULL, UNIQUE(campaign_id,lead_id))");
prospectDb.exec("CREATE TABLE IF NOT EXISTS prospect_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, entity_id INTEGER, details TEXT, at TEXT NOT NULL)");
const prospectNow=()=>new Date().toISOString();
const prospectJson=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const prospectText=(v,n=220)=>String(v==null?"":v).trim().slice(0,n);
const prospectPhone=(v)=>String(v||"").replace(/\D/g,"").slice(0,15);
const prospectAudit=(event,id,details)=>prospectDb.query("INSERT INTO prospect_audit(event,entity_id,details,at) VALUES (?,?,?,?)").run(event,id||null,prospectText(details||"",300),prospectNow());
function prospectRating(item){
 const t=(String(item.notes||"")+" "+String(item.product||"")+" "+String(item.origin||"")).toLowerCase();
 let score=29;
 for(const term of ["cotação","cotacao","proposta","preço","preco","contratar","hoje","urgente","urgência","seguro","proteção","protecao","renovar"]){if(t.includes(term))score+=8;}
 for(const term of ["sem interesse","não quero","nao quero","apenas pesquisa","depois"]){if(t.includes(term))score-=24;}
 if(item.consent && !item.opt_out)score+=9;
 score=Math.max(0,Math.min(100,score));
 return {score,temperature:score>=67?"quente":score>=38?"morno":"frio"};
}
function prospectLeadPublic(r){return {...r,consent:Boolean(r.consent),opt_out:Boolean(r.opt_out)}}
function prospectImport(row){
 const name=prospectText(row.name||row.nome,120),phone=prospectPhone(row.phone||row.telefone||row.whatsapp);
 if(!name||phone.length<10||phone.length>15)throw Error("Nome e telefone válido são obrigatórios");
 const consent=Boolean(row.consent===true||row.consent===1||row.consent==="true");
 const evidence=prospectText(row.consent_evidence||row.comprovante_consentimento,250);
 if(consent&&!evidence)throw Error("Informe a origem/comprovante da autorização para contato");
 const data={name,phone,email:prospectText(row.email,160),city:prospectText(row.city||row.cidade,90),uf:prospectText(row.uf||row.estado,2).toUpperCase(),product:prospectText(row.product||row.produto||"auto",70),origin:prospectText(row.origin||row.origem||"manual",100),notes:prospectText(row.notes||row.observacoes,1200),consent,consent_evidence:consent?evidence:"",consent_at:consent?prospectNow():null,opt_out:0};
 const r=prospectRating(data);
 const existing=prospectDb.query("SELECT id,consent,opt_out FROM prospect_leads WHERE phone=?").get(phone);
 if(existing){
  // Never resurrect opt-outs or upgrade permission through a duplicated import.
  prospectDb.query("UPDATE prospect_leads SET name=?,email=?,city=?,uf=?,product=?,origin=?,notes=?,score=?,temperature=?,updated_at=? WHERE id=?").run(name,data.email,data.city,data.uf,data.product,data.origin,data.notes,r.score,r.temperature,prospectNow(),existing.id);
  return {id:existing.id,updated:true};
 }
 const q=prospectDb.query("INSERT INTO prospect_leads(name,phone,email,city,uf,product,origin,notes,temperature,score,consent,consent_evidence,consent_at,opt_out,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(name,phone,data.email,data.city,data.uf,data.product,data.origin,data.notes,r.temperature,r.score,consent?1:0,data.consent_evidence,data.consent_at,0,prospectNow(),prospectNow());
 return {id:Number(q.lastInsertRowid),updated:false};
}
const prospectServeOriginal=Bun.serve;
Bun.serve=function(cfg){
 const next=cfg.fetch;
 return prospectServeOriginal({...cfg,fetch:async function(req,server){
  const u=new URL(req.url),path=u.pathname;
  if(path!=="/prospect-ia"&&!path.startsWith("/api/master/prospect/"))return next(req,server);
  try{
   const authReq=new Request(new URL("/api/master/me",req.url),{method:"GET",headers:{"cookie":req.headers.get("cookie")||""}});
   const auth=await next(authReq,server);
   if(auth.status!==200)return prospectJson({error:"Acesso reservado ao ADM Master autenticado",login:"/admin"},401);
   if(req.method!=="GET"){
    const origin=req.headers.get("origin");
    if(origin&&new URL(origin).origin!==u.origin)return prospectJson({error:"Origem não autorizada"},403);
    if(req.headers.get("X-COMVERXA-Prospect")!=="1")return prospectJson({error:"Proteção contra requisição não autorizada"},403);
   }
   if(path==="/prospect-ia"&&req.method==="GET")return new Response(COMVERXA_PROSPECT_PAGE,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Frame-Options":"DENY","X-Content-Type-Options":"nosniff","Referrer-Policy":"same-origin","Content-Security-Policy":"default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
   if(path==="/api/master/prospect/overview"&&req.method==="GET"){
    const counts=prospectDb.query("SELECT COUNT(*) total,SUM(CASE WHEN temperature='quente' THEN 1 ELSE 0 END) hot,SUM(CASE WHEN temperature='morno' THEN 1 ELSE 0 END) warm,SUM(CASE WHEN temperature='frio' THEN 1 ELSE 0 END) cold,SUM(CASE WHEN consent=1 AND opt_out=0 THEN 1 ELSE 0 END) opted FROM prospect_leads").get();
    const sent=prospectDb.query("SELECT COUNT(*) n FROM prospect_outbox WHERE status='sent'").get().n;
    return prospectJson({counts:{total:counts.total,hot:counts.hot||0,warm:counts.warm||0,cold:counts.cold||0,opted:counts.opted||0,sent},integration:{openai:Boolean(Bun.env.OPENAI_API_KEY),meta:Boolean(Bun.env.META_ACCESS_TOKEN&&Bun.env.META_PHONE_NUMBER_ID),maps:Boolean(Bun.env.GOOGLE_MAPS_API_KEY)},mode:"piloto restrito ao administrador"});
   }
   if(path==="/api/master/prospect/leads"&&req.method==="GET"){
    const rows=prospectDb.query("SELECT * FROM prospect_leads ORDER BY id DESC LIMIT 300").all();
    return prospectJson({items:rows.map(prospectLeadPublic)});
   }
   if(path==="/api/master/prospect/leads"&&req.method==="POST"){
    const data=await req.json(),created=prospectImport(data);
    prospectAudit("lead.upsert",created.id,created.updated?"Atualização":"Criação");
    return prospectJson({ok:true,...created},201);
   }
   if(path==="/api/master/prospect/import"&&req.method==="POST"){
    const body=await req.json();
    if(!Array.isArray(body.rows)||body.rows.length>300||body.rows.length<1)return prospectJson({error:"Envie entre 1 e 300 leads por lote"},400);
    let imported=0,updated=0;const rejected=[];
    for(let i=0;i<body.rows.length;i++){try{const x=prospectImport(body.rows[i]);x.updated?updated++:imported++;}catch(ex){rejected.push({line:i+1,reason:prospectText(ex.message,150)})}}
    prospectAudit("leads.import",null,JSON.stringify({imported,updated,rejected:rejected.length}));
    return prospectJson({imported,updated,rejected});
   }
   if(path==="/api/master/prospect/score"&&req.method==="POST"){
    const leads=prospectDb.query("SELECT * FROM prospect_leads").all();
    const put=prospectDb.query("UPDATE prospect_leads SET score=?,temperature=?,updated_at=? WHERE id=?");
    const tx=prospectDb.transaction(()=>{for(const l of leads){const s=prospectRating(l);put.run(s.score,s.temperature,prospectNow(),l.id)}});
    tx(); prospectAudit("leads.score",null,"Pontuação por regras com consentimento, sem modelo generativo");
    return prospectJson({updated:leads.length,mode:"regras"});
   }
   if(path.match(/^\/api\/master\/prospect\/leads\/\d+\/optout$/)&&req.method==="POST"){
    const id=Number(path.split("/")[5]); 
    const changed=prospectDb.query("UPDATE prospect_leads SET opt_out=1,consent=0,consent_at=NULL,updated_at=? WHERE id=?").run(prospectNow(),id);
    if(!changed.changes)return prospectJson({error:"Lead inexistente"},404);
    prospectDb.query("UPDATE prospect_outbox SET status='cancelled' WHERE lead_id=? AND status='pending'").run(id);
    prospectAudit("lead.optout",id,"Contato excluído das próximas campanhas");
    return prospectJson({ok:true});
   }
   if(path==="/api/master/prospect/ai"&&req.method==="POST"){
    if(!Bun.env.OPENAI_API_KEY)return prospectJson({error:"Configure OPENAI_API_KEY no Railway. A pontuação automática por regras continua disponível."},503);
    const body=await req.json(),context=prospectText(body.context,1800);
    if(context.length<10)return prospectJson({error:"Informe contexto de pelo menos 10 caracteres"},400);
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":"Bearer "+Bun.env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:Bun.env.OPENAI_MODEL||"gpt-4.1-mini",instructions:"Você é um assistente comercial para corretagem de seguros e proteção veicular no Brasil. Responda em pt-BR. Não invente cotações, coberturas, preços ou garantias. Faça diagnóstico breve, perguntas de qualificação e uma sugestão de follow-up. Trate dados pessoais de forma mínima e respeite pedidos de não contato.",input:context,max_output_tokens:450})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)return prospectJson({error:"Serviço de IA indisponível ou sem autorização",status:response.status},502);
    const output=(result.output||[]).flatMap(x=>(x.content||[]).filter(y=>y.type==="output_text").map(y=>y.text)).join("\n");
    prospectAudit("ai.assistant",null,"Consulta pontual sem registrar conteúdo do prompt");
    return prospectJson({answer:output||"Sem resposta",model:Bun.env.OPENAI_MODEL||"gpt-4.1-mini"});
   }
   if(path==="/api/master/prospect/campaigns"&&req.method==="GET"){
    return prospectJson({items:prospectDb.query("SELECT c.*, (SELECT COUNT(*) FROM prospect_outbox q WHERE q.campaign_id=c.id) total,(SELECT COUNT(*) FROM prospect_outbox q WHERE q.campaign_id=c.id AND q.status='sent') sent,(SELECT COUNT(*) FROM prospect_outbox q WHERE q.campaign_id=c.id AND q.status='pending') pending FROM prospect_campaigns c ORDER BY id DESC LIMIT 50").all()});
   }
   if(path==="/api/master/prospect/campaigns"&&req.method==="POST"){
    const b=await req.json(),name=prospectText(b.name,100),template=prospectText(b.template_name,90);
    if(!name||!/^[a-z][a-z0-9_]{1,89}$/.test(template))return prospectJson({error:"Nome e template Meta aprovado são obrigatórios (nome minúsculo com sublinhado)."},400);
    const x=prospectDb.query("INSERT INTO prospect_campaigns(name,template_name,language,status,created_at) VALUES (?,?,?,'draft',?)").run(name,template,"pt_BR",prospectNow());
    const id=Number(x.lastInsertRowid);
    prospectDb.query("INSERT OR IGNORE INTO prospect_outbox(campaign_id,lead_id,created_at) SELECT ?,id,? FROM prospect_leads WHERE consent=1 AND opt_out=0 AND consent_evidence<>''").run(id,prospectNow());
    prospectAudit("campaign.create",id,"Template "+template);
    return prospectJson({id,queued:prospectDb.query("SELECT COUNT(*) n FROM prospect_outbox WHERE campaign_id=?").get(id).n},201);
   }
   if(path.match(/^\/api\/master\/prospect\/campaigns\/\d+\/send$/)&&req.method==="POST"){
    const id=Number(path.split("/")[5]),c=prospectDb.query("SELECT * FROM prospect_campaigns WHERE id=?").get(id);
    if(!c)return prospectJson({error:"Campanha não encontrada"},404);
    if(!Bun.env.META_ACCESS_TOKEN||!Bun.env.META_PHONE_NUMBER_ID)return prospectJson({error:"Envio real não habilitado: configure META_ACCESS_TOKEN e META_PHONE_NUMBER_ID; use template aprovado e somente contatos com autorização registrada."},503);
    const queued=prospectDb.query("SELECT q.id, l.phone,l.consent,l.opt_out,l.consent_evidence FROM prospect_outbox q JOIN prospect_leads l ON l.id=q.lead_id WHERE q.campaign_id=? AND q.status='pending' ORDER BY q.id LIMIT 8").all(id);
    let sent=0,failed=0,skipped=0;
    for(const q of queued){
     if(!q.consent||q.opt_out||!q.consent_evidence){prospectDb.query("UPDATE prospect_outbox SET status='cancelled',error='Sem autorização' WHERE id=?").run(q.id);skipped++;continue}
     let result;
     try{const r=await fetch("https://graph.facebook.com/v23.0/"+encodeURIComponent(Bun.env.META_PHONE_NUMBER_ID)+"/messages",{method:"POST",headers:{"Authorization":"Bearer "+Bun.env.META_ACCESS_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to:q.phone,type:"template",template:{name:c.template_name,language:{code:c.language}}}),signal:AbortSignal.timeout(12000)});const data=await r.json().catch(()=>({}));result={ok:r.ok,id:data.messages?.[0]?.id||null,error:r.ok?"":prospectText(data.error?.message||"Falha da Meta",180)}}catch(e){result={ok:false,error:prospectText(e.message,140)}}
     prospectDb.query("UPDATE prospect_outbox SET status=?,provider_id=?,error=?,sent_at=? WHERE id=?").run(result.ok?"sent":"failed",result.id||null,result.error||null,result.ok?prospectNow():null,q.id);
     result.ok?sent++:failed++;
     if(sent+failed<queued.length)await new Promise(resolve=>setTimeout(resolve,900));
    }
    prospectAudit("campaign.dispatch",id,JSON.stringify({sent,failed,skipped}));
    return prospectJson({sent,failed,skipped,batch_limit:8,remaining:prospectDb.query("SELECT COUNT(*) n FROM prospect_outbox WHERE campaign_id=? AND status='pending'").get(id).n});
   }
   return prospectJson({error:"Rota não encontrada"},404);
  }catch(e){console.error("COMVERXA prospect request error:",prospectText(e.message,120));return prospectJson({error:"Não foi possível concluir a operação; verifique os campos e a sessão."},400)}
 }});
};

Bun.serve({port:Number(Bun.env.PORT||3000),fetch:cvxFallback});
