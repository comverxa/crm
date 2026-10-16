/**
 * COMVERXA: exportação consistente de SQLite para o ADM Master.
 * Aplicar como wrapper Bun.serve SOMENTE após testes; não altera o banco original.
 * Este módulo é intencionalmente independente do código privado CVX_SOURCE_*.
 */
import { Database as BackupDb } from "bun:sqlite";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, existsSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const backupDirectory = Bun.env.CVX_BACKUP_DB_DIR || "/data";
const backupOrigin = new URL(Bun.env.APP_PUBLIC_URL || "https://app.comverxa.com.br").origin;
const backupFiles = Object.freeze({
  crm:"conecta_saas.db",
  finance:"comverxa-finance.sqlite",
  billing:"comverxa-billing-lab.sqlite"
});
const backupsCookie = "__Host-cvx-backup";
const backupNoCache={"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY"};
let backupRunning=false;
const originalBackupServe=Bun.serve;
function ownerBackupResponse(message,status){
  return new Response(message,{status,headers:{...backupNoCache,"Content-Type":"text/plain; charset=utf-8"}});
}
function matchToken(request){
  const raw=(request.headers.get("cookie")||"").match(/(?:^|;\\s*)__Host-cvx-backup=([a-f0-9]{48})(?:;|$)/)?.[1];
  const sent=request.headers.get("x-cvx-backup-token")||"";
  return !!raw && /^[a-f0-9]{48}$/.test(sent) &&
    timingSafeEqual(Buffer.from(raw,"hex"),Buffer.from(sent,"hex"));
}
function backupPage(token){
 const nonce=randomBytes(16).toString("base64");
 const responseHtml=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Exportar bancos — COMVERXA</title><style>body{margin:0;background:#f1f5f8;font:16px system-ui,sans-serif;color:#173246}main{max-width:770px;margin:45px auto;padding:28px;background:#fff;border:1px solid #dce7ea;border-radius:20px}h1{font-size:26px}p{line-height:1.55;color:#425e6d}button{margin:7px 8px 7px 0;background:#097c6b;border:0;border-radius:9px;color:#fff;padding:14px;font:inherit;font-weight:700;cursor:pointer}button:disabled{opacity:.6;cursor:wait}a{color:#097c6b}small{display:block;margin-top:16px;color:#637789}</style></head><body><main><p><a href="/admin">← Voltar ao ADM Master</a></p><h1>Backup manual dos bancos COMVERXA</h1><p>Exporte uma cópia consistente de cada banco SQLite. Os arquivos contêm dados confidenciais: armazene-os criptografados e fora do Railway. Não compartilhe por WhatsApp ou e-mail comum.</p><p>O download <strong>não altera nem restaura</strong> a base atual. As demais bases (Prospect IA, Evolution/Postgres e Redis) requerem procedimentos próprios.</p><div><button type="button" data-kind="crm">Baixar banco CRM</button><button type="button" data-kind="finance">Baixar financeiro</button><button type="button" data-kind="billing">Baixar laboratório</button></div><p id="notice" role="status">Escolha um banco para exportar.</p><small>Para uma recuperação completa é necessário testar os arquivos em ambiente isolado e manter backups regulares dos volumes.</small></main><script nonce="${nonce}">const backupToken="${token}";const box=document.querySelector("#notice");document.querySelectorAll("button[data-kind]").forEach(btn=>btn.addEventListener("click",async()=>{const scope=btn.dataset.kind;if(!confirm("Exportar uma cópia com dados confidenciais para este dispositivo?"))return;btn.disabled=true;box.textContent="Preparando backup consistente...";try{const r=await fetch("/api/master/backup?scope="+encodeURIComponent(scope),{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"X-CVX-Backup-Token":backupToken,"X-CVX-Backup-Confirm":"EXPORTAR COMVERXA"}});if(!r.ok)throw Error((await r.text()).slice(0,180));const blob=await r.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="COMVERXA-"+scope+"-"+new Date().toISOString().slice(0,10)+".sqlite";document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);box.textContent="Arquivo exportado. Guarde-o criptografado e teste a restauração.";}catch(e){box.textContent="Não foi possível exportar: "+e.message;}finally{btn.disabled=false}}));</script></body></html>`;
 return {responseHtml,nonce};
}
Bun.serve=function cvxBackupServe(cfg) {
 const previousFetch=cfg.fetch;
 return originalBackupServe({...cfg,fetch:async function(req,server){
  const url=new URL(req.url),route=url.pathname;
  const page=route==="/admin/backup",api=route==="/api/master/backup";
  if(!page&&!api)return previousFetch(req,server);
  if((page&&req.method!=="GET")||(api&&req.method!=="POST"))return ownerBackupResponse("Método não permitido.",405);
  let auth;
  try{
    const check=new Request(new URL("/api/master/me",req.url),{method:"GET",headers:req.headers});
    auth=await previousFetch(check,server);
  }catch{return ownerBackupResponse("Falha ao verificar autenticação.",503)}
  if(auth.status!==200)return ownerBackupResponse("Acesso restrito ao ADM Master.",401);
  if(page){
    const token=randomBytes(24).toString("hex"),{responseHtml,nonce}=backupPage(token);
    return new Response(responseHtml,{status:200,headers:{...backupNoCache,
      "Content-Type":"text/html; charset=utf-8",
      "Content-Security-Policy":"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      "Referrer-Policy":"no-referrer",
      "Set-Cookie":backupsCookie+"="+token+"; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=600"}});
  }
  const origin=req.headers.get("origin")||"";
  if(origin!==backupOrigin||req.headers.get("x-cvx-backup-confirm")!=="EXPORTAR COMVERXA"||!matchToken(req))
    return ownerBackupResponse("Confirmação inválida. Reabra a tela de backup.",403);
  const kind=url.searchParams.get("scope");
  if(!Object.hasOwn(backupFiles,kind))return ownerBackupResponse("Banco desconhecido.",400);
  if(backupRunning)return ownerBackupResponse("Outra exportação está em andamento.",429);
  const source=join(backupDirectory,backupFiles[kind]);
  if(!existsSync(source))return ownerBackupResponse("Este banco não está disponível.",404);
  // Proteção contra esgotamento de memória/disco: não exportar banco acima de 100 MiB.
  if(statSync(source).size>100*1024*1024)return ownerBackupResponse("Banco muito grande para exportação em memória. Use backup do volume Railway.",413);
  backupRunning=true;
  const snapshot=join(tmpdir(),"cvx-backup-"+randomBytes(16).toString("hex")+".sqlite");
  let input,output;
  try{
    input=new BackupDb(source,{readonly:true});
    input.prepare("VACUUM INTO ?").run(snapshot);
    input.close();input=undefined;
    output=new BackupDb(snapshot,{readonly:true});
    const integrity=output.query("PRAGMA integrity_check").get();
    if(!integrity||Object.values(integrity)[0]!=="ok")throw Error("integrity check");
    output.close();output=undefined;
    const data=readFileSync(snapshot);
    if(data.subarray(0,16).toString("latin1")!=="SQLite format 3\\0")throw Error("invalid sqlite header");
    const name="COMVERXA-"+kind+"-"+new Date().toISOString().slice(0,10)+".sqlite";
    return new Response(data,{status:200,headers:{...backupNoCache,
      "Content-Type":"application/vnd.sqlite3","Content-Disposition":'attachment; filename="'+name+'"',
      "Referrer-Policy":"no-referrer"}});
  }catch(e){
    console.error("COMVERXA_BACKUP_FAIL",String(e?.message||e).slice(0,140));
    return ownerBackupResponse("Não foi possível criar backup consistente. Banco original preservado.",503);
  }finally{
    try{input?.close()}catch{}
    try{output?.close()}catch{}
    try{if(existsSync(snapshot))unlinkSync(snapshot)}catch{}
    backupRunning=false;
  }
 }});
};
