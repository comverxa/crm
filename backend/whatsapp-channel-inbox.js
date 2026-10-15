/* COMVERXA WhatsApp channel-aware inbox, v1. No automatic contact reassignment. */
(function(){
"use strict";
if(window.__cvxInboxChannelInstalled)return;
window.__cvxInboxChannelInstalled=true;
const byId=id=>document.getElementById(id);
const getThread=()=>{try{return typeof selected!=="undefined"?selected:null}catch{return null}};
const getLines=()=>{try{return typeof lines!=="undefined"&&Array.isArray(lines)?lines:[]}catch{return []}};
const current=()=>{const thread=getThread();return {thread,line:getLines().find(x=>Number(x.slot)===Number(thread?.line))||null,qr:getLines().filter(x=>x.mode==="qr")}};
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
 const {btn,tpl,n,edit}=parts,{thread,line,qr}=current();
 if(!thread){
  btn.textContent="Selecione uma conversa";btn.disabled=true;
  n.firstChild?.nodeType===3&&(n.firstChild.textContent="");
  n.textContent="Selecione uma conversa para saber qual integração será utilizada.";n.appendChild(edit);edit.hidden=true;
  if(tpl)tpl.hidden=false;
  return;
 }
 const slot=Number(thread.line);
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
 return oldSend.call(this,type);
};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",sync,{once:true});else sync();
new MutationObserver(()=>sync()).observe(byId("chatHeader")||document.body,{childList:true,subtree:false});
})();