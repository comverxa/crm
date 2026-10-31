/**
 * COMVERXA Control Center — isolated owner-only bootstrap.
 * Does not connect to customer databases or change existing accounts.
 * Requires CVX_OWNER_EMAIL and CVX_OWNER_PASSWORD_HASH (scrypt salt:hexhash).
 * Future management integrations require server-to-server authorization.
 */
import http from "node:http";
import {scryptSync,timingSafeEqual,randomBytes,createHash} from "node:crypto";
const email=(process.env.CVX_OWNER_EMAIL||"").trim().toLowerCase();
const verifier=process.env.CVX_OWNER_PASSWORD_HASH||"";
const origin=process.env.CVX_OWNER_ORIGIN||"";
const port=Number(process.env.PORT||3000);
if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)||!/^([a-f0-9]{32}):([a-f0-9]{128})$/.test(verifier)||!/^https:\\/\\/[^/]+$/.test(origin))throw Error("Owner credentials and HTTPS origin required");
const [salt,expected]=verifier.split(":");
const sessions=new Map();
const ttl=8*3600*1000;
const digest=x=>createHash("sha256").update(x).digest("hex");
const same=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
const template=(body)=>`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>COMVERXA Control Center</title><style>body{margin:0;background:#071324;color:#edf9ff;font:16px system-ui}main{max-width:1000px;margin:8vh auto;padding:24px}h1{font-size:clamp(28px,4vw,44px)}.card{border:1px solid #28455b;background:#10263d;border-radius:18px;padding:22px;margin:16px 0}input,button{font:inherit;padding:12px;border-radius:8px}input{background:#091a2a;color:white;border:1px solid #49677d;display:block;margin:8px 0 14px;width:min(90%,380px)}button{background:#53cfe1;color:#061322;border:0;font-weight:700}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.muted{color:#a9c0d1}</style><main>${body}</main></html>`;
const login=template('<h1>COMVERXA Control Center</h1><p class="muted">Área exclusiva do proprietário</p><section class="card"><form method="post" action="/owner/login"><label>E-mail<input name="email" type="email" autocomplete="username" required></label><label>Senha<input name="password" type="password" autocomplete="current-password" required></label><button>Entrar</button></form></section>');
const dashboard=template('<h1>COMVERXA Control Center</h1><p class="muted">Administração comercial privativa — integração com dados reais ainda não habilitada</p><div class="grid"><section class="card"><h2>Clientes e empresas</h2><p>Integração pendente; nenhuma informação fictícia.</p></section><section class="card"><h2>Planos e assinaturas</h2><p>Somente consulta após integração autorizada.</p></section><section class="card"><h2>Licenças vitalícias</h2><p>Preservar os registros atuais.</p></section><section class="card"><h2>Auditoria e homologação</h2><p>Testes e evidências de implantação.</p></section></div><form method="post" action="/owner/logout"><button>Sair</button></form>');
const parseCookies=s=>Object.fromEntries((s||"").split(";").map(x=>x.trim().split("=")).filter(x=>x.length===2));
const body=async req=>{let s="";for await(const chunk of req){s+=chunk;if(s.length>4096)throw Error("Too large")}return new URLSearchParams(s)};
const send=(res,status,content,extra={})=>{res.writeHead(status,{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-frame-options":"DENY","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'","referrer-policy":"no-referrer",...extra});res.end(content)};
const server=http.createServer(async(req,res)=>{
 const path=new URL(req.url,"http://localhost").pathname;
 const cookie=parseCookies(req.headers.cookie).cvx_owner_session;
 const active=cookie&&sessions.get(digest(cookie))>Date.now();
 if(path==="/healthz")return send(res,200,"ok");
 if(req.method==="GET"&&path==="/owner")return send(res,200,active?dashboard:login);
 if(req.method==="POST"&&path==="/owner/login"){
  if(req.headers.origin&&req.headers.origin!==origin)return send(res,403,"Forbidden");
  let data;try{data=await body(req)}catch{return send(res,413,"Too large")}
  const supplied=scryptSync(String(data.get("password")||""),Buffer.from(salt,"hex"),64).toString("hex");
  if(String(data.get("email")||"").toLowerCase()!==email||!same(supplied,expected))return send(res,401,"Credenciais inválidas");
  const token=randomBytes(32).toString("hex");sessions.set(digest(token),Date.now()+ttl);
  return send(res,303,"",{"location":"/owner","set-cookie":`cvx_owner_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/owner; Max-Age=28800`});
 }
 if(req.method==="POST"&&path==="/owner/logout"){
  if(req.headers.origin&&req.headers.origin!==origin)return send(res,403,"Forbidden");
  if(cookie)sessions.delete(digest(cookie));
  return send(res,303,"",{"location":"/owner","set-cookie":"cvx_owner_session=; HttpOnly; Secure; SameSite=Strict; Path=/owner; Max-Age=0"});
 }
 return send(res,404,"Not Found");
});
server.listen(port,"0.0.0.0");
