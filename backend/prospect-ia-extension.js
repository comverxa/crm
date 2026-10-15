// COMVERXA Prospect IA (pilot master-only). No credentials in source.
// Installed before original Bun.serve startup; wraps routes without replacing the CRM.
import { Database as ProspectDatabase } from "bun:sqlite";
import { mkdirSync as prospectMkdirSync } from "node:fs";

const prospectStorageDir=Bun.env.PROSPECT_DATA_DIR||"/data";
prospectMkdirSync(prospectStorageDir, {recursive:true});
const prospectDb = new ProspectDatabase(prospectStorageDir+"/comverxa-prospect-ia.sqlite", {create:true});
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
     // Atomic claim prevents parallel operators from dispatching the same queue item twice.
     const claim=prospectDb.query("UPDATE prospect_outbox SET status='processing' WHERE id=? AND status='pending'").run(q.id);
     if(claim.changes!==1){skipped++;continue}
     // Re-check immediately before a network send, after claiming the queue item.
     const current=prospectDb.query("SELECT consent,opt_out,consent_evidence FROM prospect_leads WHERE id=(SELECT lead_id FROM prospect_outbox WHERE id=?)").get(q.id);
     if(!current?.consent||current.opt_out||!current.consent_evidence){prospectDb.query("UPDATE prospect_outbox SET status='cancelled',error='Sem autorização' WHERE id=?").run(q.id);skipped++;continue}
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
