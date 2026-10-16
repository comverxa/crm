/* COMVERXA WhatsApp channel-aware inbox, v1. No automatic contact reassignment. */
(function(){
"use strict";
if(window.__cvxInboxChannelInstalled)return;
window.__cvxInboxChannelInstalled=true;
const byId=id=>document.getElementById(id);
const getThread=()=>{try{return typeof selected!=="undefined"?selected:null}catch{return null}};
const getLines=()=>{try{return typeof lines!=="undefined"&&Array.isArray(lines)?lines:[]}catch{return []}};
/* Prefer the saved lead assignment over an openThread snapshot. The selected
   thread may be stale after Save while its row already shows WhatsApp 2. */
const current=()=>{
 const thread=getThread(),available=getLines();
 let registered=null;
 try{registered=typeof leads!=="undefined"&&Array.isArray(leads)?leads.find(x=>Number(x.id)===Number(thread?.id)):null}catch{}
 const raw=Number(registered?.line||thread?.line||0);
 const slot=Number.isSafeInteger(raw)&&raw>0?raw:0;
 if(thread&&slot&&Number(thread.line)!==slot)thread.line=slot; // UI cache only, never writes customer data
 return {thread,line:available.find(x=>Number(x.slot)===slot)||null,qr:available.filter(x=>x.mode==="qr"),slot};
};
function ui(){
 const btn=document.querySelector('#inbox button[onclick="sendReply(\'text\')"]'),tpl=document.querySelector('#inbox button[onclick="sendReply(\'template\')"]');
 if(!btn)return null;
 let n=byId("cvx-inbox-channel");
 if(!n){
  n=document.createElement("div");n.id="cvx-inbox-channel";n.setAttribute("role","status");n.style.cssText="padding:12px 14px;margin:10px 0;border:1px solid #d5e6eb;border-radius:12px;background:#f0f8fa;color:#25475b;font-size:14px;line-height:1.45";
  btn.closest(".actions")?.before(n);
 }
 let edit=byId("cvx-inbox-change-line");
 if(!edit){
  edit=document.createElement("button");edit.id="cvx-inbox-change-line";edit.type="button";edit.className="secondary";
  edit.style.cssText="margin:8px 0 0;min-height:40px;font-weight:700";
  edit.addEventListener("click",()=>{
   const {thread,qr}=current(),available=qr.find(x=>Number(x.slot)===2)||qr[0];
   if(!thread||!available)return;
   try{
    const actual=typeof leads!=="undefined"&&Array.isArray(leads)?leads.find(x=>x.id===thread.id):null;
    if(!actual){toast("Contato ainda não está na lista de leads. Atualize o painel.");return;}
    editLead(actual.id);
    const input=byId("leadForm")?.elements?.line;
    if(input)input.value=String(available.slot);
    toast("Linha "+available.slot+" selecionada. Confira o cadastro e clique em Salvar para confirmar.");
   }catch(e){toast("Não foi possível abrir o cadastro: "+e.message)}
  });
  n.appendChild(edit);
 }
 return {btn,tpl,n,edit};
}
function sync(){
 const parts=ui();if(!parts)return;
 const {btn,tpl,n,edit}=parts,{thread,line,qr,slot}=current();
 if(!thread){
  btn.textContent="Selecione uma conversa";btn.disabled=true;
  n.firstChild?.nodeType===3&&(n.firstChild.textContent="");
  n.textContent="Selecione uma conversa para saber qual integração será utilizada.";n.appendChild(edit);edit.hidden=true;
  if(tpl)tpl.hidden=false;
  return;
 }
 let desc="";
 if(line?.mode==="qr"){
  btn.textContent="Enviar pela Evolution API (QR)";btn.disabled=false;
  desc="Esta conversa pertence à linha "+slot+" · "+(line.name||"WhatsApp")+". O envio utilizará a Evolution API pelo número conectado desta linha.";
  edit.hidden=true;
  if(tpl)tpl.hidden=true;
 }else if(line?.mode==="api"){
  btn.textContent="Enviar pela Meta API";btn.disabled=false;
  desc="Esta conversa está vinculada à linha "+slot+" (Meta API), não à Evolution. Se você pretende responder pelo WhatsApp conectado via QR, altere a linha deste contato no cadastro.";
  edit.hidden=qr.length===0;
  if(tpl)tpl.hidden=false;
 }else{
  btn.textContent="Selecione uma linha conectada";btn.disabled=true;
  desc="A conversa pertence à linha "+slot+", sem canal de envio habilitado. Selecione uma linha Evolution conectada no cadastro do lead para poder responder.";
  edit.hidden=qr.length===0;
  if(tpl)tpl.hidden=true;
 }
 n.textContent=desc;
 n.appendChild(edit);
 if(!edit.hidden){const candidate=qr.find(x=>Number(x.slot)===2)||qr[0];edit.textContent="Alterar lead para "+(candidate?.name||"WhatsApp "+candidate?.slot)+" (Evolution)";}
}

/* Central de conexão das três linhas: GET autenticado apenas.
   QR pareado ou token Meta nunca são lidos pelo navegador e ninguém é desconectado automaticamente. */
const HUB="cvx-wa-connection-hub-v1";
let hubBusy=false;
const hubStyles=[
"#"+HUB+"[hidden]{display:none!important}",
"#"+HUB+"{position:fixed;inset:0;z-index:2147483000;background:#051924c9;display:grid;place-items:center;padding:12px;overflow:auto}",
"#"+HUB+" .cvx-wa-box{width:min(780px,100%);max-height:94vh;overflow:auto;background:#fff;color:#203f50;border-radius:16px;padding:20px;box-shadow:0 12px 55px #002d436e;font:14px/1.45 system-ui,sans-serif}",
"#"+HUB+" .cvx-wa-head{display:flex;justify-content:space-between;align-items:center;gap:15px}",
"#"+HUB+" h2{font-size:23px;margin:0;color:#123d4f}",
"#"+HUB+" h3{font-size:16px;margin:0}",
"#"+HUB+" button{min-height:37px;background:#087f73;border:1px solid #087f73;color:white;border-radius:9px;padding:8px 12px;font-weight:700;cursor:pointer}",
"#"+HUB+" button:disabled{opacity:.45;cursor:wait}",
"#"+HUB+" button.secondary{background:white;color:#1d525c;border-color:#adc8cf}",
"#"+HUB+" button:focus-visible{outline:3px solid #19bba6;outline-offset:2px}",
"#"+HUB+" .cvx-wa-line{background:#f4f9fa;border:1px solid #d6e4e9;border-radius:12px;padding:14px;margin:13px 0}",
"#"+HUB+" .cvx-wa-line-top{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}",
"#"+HUB+" .cvx-wa-state{font-weight:800;color:#176553}",
"#"+HUB+" .cvx-wa-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}",
"#"+HUB+" .cvx-wa-muted{font-size:12px;color:#5d7580;margin:7px 0}",
"#"+HUB+" .cvx-wa-help{background:#e9f6f3;padding:11px 13px;border-radius:11px;margin:12px 0}",
"#app .cvx-wa-launch{display:block;border:1px solid #1a8174!important;border-radius:10px;background:#eaf9f6!important;color:#12655b!important;font-weight:750;padding:10px 12px;min-height:42px}",
"@media(max-width:650px){#"+HUB+" .cvx-wa-box{padding:14px}#"+HUB+" h2{font-size:19px}}"
].join("\n");
function showHub(){
 if(document.getElementById(HUB))return document.getElementById(HUB);
 const style=document.createElement("style");style.id=HUB+"-style";style.textContent=hubStyles;document.head.append(style);
 const overlay=document.createElement("div");overlay.id=HUB;overlay.hidden=true;
 const card=document.createElement("div");card.className="cvx-wa-box";card.setAttribute("role","dialog");card.setAttribute("aria-modal","true");card.setAttribute("aria-label","Conexões de WhatsApp do COMVERXA");
 const head=document.createElement("div");head.className="cvx-wa-head";
 const title=document.createElement("h2");title.textContent="Conectar WhatsApp ao CRM";
 const close=document.createElement("button");close.type="button";close.className="secondary";close.textContent="Fechar";
 close.addEventListener("click",()=>{overlay.hidden=true});head.append(title,close);
 const info=document.createElement("p");info.className="cvx-wa-help";info.textContent="WhatsApp QR (Evolution) e API oficial (Meta) usam configurações diferentes. Consulte o estado de cada linha e faça a conexão pela sua própria conta. Não é necessário trocar o número de uma linha já em uso.";
 const summary=document.createElement("p");summary.id="cvx-wa-hub-summary";summary.setAttribute("role","status");summary.textContent="Clique em Atualizar conexões.";
 const controls=document.createElement("div");controls.className="cvx-wa-actions";
 const refresh=document.createElement("button");refresh.type="button";refresh.textContent="Atualizar conexões";refresh.id="cvx-wa-hub-refresh";refresh.addEventListener("click",refreshHub);
 const inbox=document.createElement("button");inbox.type="button";inbox.className="secondary";inbox.textContent="Abrir Caixa de entrada";inbox.addEventListener("click",()=>navigateHub("inbox"));
 controls.append(refresh,inbox);
 const list=document.createElement("div");list.id="cvx-wa-hub-lines";list.setAttribute("aria-live","polite");
 const foot=document.createElement("p");foot.className="cvx-wa-muted";foot.textContent="A conexão não garante sincronização de histórico nem entrega. QR usa Evolution não oficial; API Meta requer Phone Number ID, token válido e webhook configurado. Não informe tokens fora das telas protegidas do CRM.";
 card.append(head,info,controls,summary,list,foot);overlay.append(card);document.body.append(overlay);
 overlay.addEventListener("click",ev=>{if(ev.target===overlay)overlay.hidden=true});
 overlay.addEventListener("keydown",ev=>{if(ev.key==="Escape")overlay.hidden=true});
 return overlay;
}
function navigateHub(destination){
 const overlay=showHub();overlay.hidden=true;
 if(typeof window.switchTab==="function"){window.switchTab(destination);return}
 const nav=[...document.querySelectorAll("#app nav.tabs button")].find(b=>(b.getAttribute("onclick")||"").includes("'"+destination+"'"));
 if(nav)nav.click();
 else {const summary=byId("cvx-wa-hub-summary");overlay.hidden=false;summary.textContent="Não foi possível abrir a tela automaticamente; use o menu WhatsApp sem API, WhatsApp com API ou Caixa de entrada."}
}
function addHubButton(target){
 if(!target||target.querySelector(".cvx-wa-launch"))return;
 const launch=document.createElement("button");launch.type="button";launch.className="cvx-wa-launch";
 launch.textContent="Conectar WhatsApp · QR e API";launch.title="Consultar linhas do CRM e abrir a conexão desejada";
 launch.setAttribute("aria-haspopup","dialog");
 launch.addEventListener("click",()=>{showHub().hidden=false;refreshHub()});
 target.prepend(launch);
}
function mountHub(){
 const nav=document.querySelector("#app nav.tabs");if(nav)addHubButton(nav);
}
function lineButton(text,kind,dest){
 const b=document.createElement("button");b.type="button";b.textContent=text;b.className=kind==="secondary"?"secondary":"";
 b.addEventListener("click",()=>navigateHub(dest));return b;
}
async function refreshHub(){
 if(hubBusy)return;
 const overlay=showHub(),status=byId("cvx-wa-hub-summary"),holder=byId("cvx-wa-hub-lines"),btn=byId("cvx-wa-hub-refresh");
 hubBusy=true;btn.disabled=true;status.textContent="Consultando as linhas desta empresa...";holder.replaceChildren();
 try{
  if(typeof window.api!=="function")throw Error("Entre na conta do CRM para consultar as conexões.");
  const data=await window.api("/api/lines");
  if(!Array.isArray(data?.items))throw Error("A API do CRM não retornou as linhas cadastradas.");
  const items=data.items.filter(x=>Number.isInteger(Number(x?.slot))&&Number(x.slot)>0).slice(0,10);
  const gateway=Boolean(data.qrGatewayReady),webhook=Boolean(data.webhookConfigured);
  const reports=await Promise.all(items.map(async l=>{
   if(l.mode!=="qr"||!gateway)return {state:null,error:null};
   try{
    const r=await window.api("/api/lines/"+encodeURIComponent(l.slot)+"/qr/status");
    return {state:r?.connected===true?"connected":"disconnected",message:typeof r?.message==="string"?r.message.slice(0,100):"",error:null};
   }catch{return {state:"unknown",message:"Falha ao consultar status da linha",error:true}}
  }));
  let connected=0,metaReady=0;
  items.forEach((line,index)=>{
   const mode=String(line.mode||"app"),rep=reports[index];
   const card=document.createElement("section");card.className="cvx-wa-line";
   const top=document.createElement("div");top.className="cvx-wa-line-top";
   const title=document.createElement("h3");title.textContent="WhatsApp "+String(line.slot)+" · "+String(line.name||"Linha").slice(0,55);
   const state=document.createElement("span");state.className="cvx-wa-state";
   const desc=document.createElement("p");desc.className="cvx-wa-muted";
   const actions=document.createElement("div");actions.className="cvx-wa-actions";
   if(mode==="qr"){
    if(rep.state==="connected")connected++;
    state.textContent=!gateway?"Servidor QR indisponível":rep.state==="connected"?"QR conectado":rep.state==="disconnected"?"QR desconectado":"QR: verificar conexão";
    desc.textContent="Evolution / QR. "+(!gateway?"A integração de servidor não está pronta.":rep.message||"Vincule o celular em Aparelhos conectados para usar este número no CRM.");
    actions.append(lineButton("Abrir conexão QR","primary","waweb"));
   }else if(mode==="api"){
    const configured=Boolean(line.configured)&&Boolean(line.meta_phone_id);
    if(configured&&webhook)metaReady++;
    state.textContent=configured?(webhook?"Meta configurada · webhook ativo":"Meta configurada · webhook pendente"):"Meta: credenciais pendentes";
    desc.textContent="Cloud API oficial: "+(configured?"Phone Number ID e token registrados.":"Informe seu Phone Number ID e token na tela protegida.")+" Enviar e receber ainda exige teste real.";
    actions.append(lineButton("Abrir configuração Meta","primary","lines"));
   }else{
    state.textContent="Linha sem integração";
    desc.textContent="Escolha QR/Evolution ou Meta Cloud API na tela de configuração. Nada será alterado automaticamente.";
    actions.append(lineButton("Configurar WhatsApp","primary","lines"));
   }
   top.append(title,state);card.append(top,desc,actions);holder.append(card);
  });
  status.textContent=items.length+" linhas encontradas · "+connected+" QR conectada(s) · "+metaReady+" Meta configurada(s) com webhook. "+(webhook?"Webhook Meta indicado como configurado.":"Webhook Meta ainda não indicado como configurado.");
  if(!items.length)status.textContent="Nenhuma linha disponível nesta empresa. Verifique seu plano e as configurações.";
 }catch(error){
  status.textContent="Não foi possível consultar conexões: "+String(error?.message||"Erro").slice(0,130)+". Atualize a sessão e tente novamente.";
 }finally{hubBusy=false;btn.disabled=false}
}
let hubScheduled=false;
function scheduleHub(){if(hubScheduled)return;hubScheduled=true;requestAnimationFrame(()=>{hubScheduled=false;mountHub()})}
function bootHub(){
 mountHub();new MutationObserver(scheduleHub).observe(document.getElementById("app")||document.body,{childList:true,subtree:true});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bootHub,{once:true});else bootHub();

const oldOpen=window.openThread;
if(typeof oldOpen==="function")window.openThread=async function(...args){const r=await oldOpen.apply(this,args);sync();return r};
const oldRender=window.renderInbox;
if(typeof oldRender==="function")window.renderInbox=async function(...args){const r=await oldRender.apply(this,args);sync();return r};
const oldSend=window.sendReply;
if(typeof oldSend==="function")window.sendReply=async function(type){
 const {thread,line}=current();
 if(!thread){toast("Selecione uma conversa");return}
 if(type==="template"&&line?.mode==="qr"){toast("Modelos Meta não se aplicam à Evolution QR.");return}
 if(type==="text"&&line?.mode!=="qr"&&line?.mode!=="api"){toast("Esta conversa não está vinculada a uma linha de envio. Corrija no cadastro do lead.");sync();return}
 /* Refresh cached selected line before the original send handler reads it. */
 return oldSend.call(this,type);
};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",sync,{once:true});else sync();
new MutationObserver(()=>sync()).observe(byId("chatHeader")||document.body,{childList:true,subtree:false});
})();