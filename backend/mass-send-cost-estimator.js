/* COMVERXA — Simulador de orçamento de disparos; 100% local e sem envio. */
(function(){
"use strict";
if(window.__cvxEstimateInstalled)return;
window.__cvxEstimateInstalled=true;
const ID="cvx-disparo-orcamento", E=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n);
const num=s=>{let t=String(s??"").trim();t=t.includes(",")?t.replace(/\./g,"").replace(",","."):t;let n=Number(t);return Number.isFinite(n)&&n>=0?n:0};
const get=id=>num(E(id).value),round=n=>Math.round((n+Number.EPSILON)*100)/100;
const rows=[
'<div class="cvx-bgt-back" hidden><div class="cvx-bgt-box" role="dialog" aria-modal="true" aria-labelledby="cvx-bgt-title">',
'<header><div><small>COMVERXA · PLANEJAMENTO</small><h2 id="cvx-bgt-title">Orçamento de disparos</h2></div><button type="button" data-close aria-label="Fechar">×</button></header>',
'<p>Simule o custo <strong>antes</strong> de usar sua campanha. Esta tela não envia mensagens, não altera leads e não movimenta dinheiro.</p>',
'<div class="cvx-bgt-inputs">',
'<label>Tipo de conexão<select id="cvx-bgt-channel"><option value="qr">WhatsApp por QR / Evolution — sem API oficial</option><option value="meta">API oficial da Meta</option></select></label>',
'<label id="cvx-bgt-kind-label" hidden>Categoria oficial<select id="cvx-bgt-kind"><option value="marketing">Marketing</option><option value="utility">Utilidade</option><option value="authentication">Autenticação</option><option value="service">Serviço</option></select></label>',
'<label>Destinatários<input id="cvx-bgt-people" type="number" min="0" max="1000000" step="1" value="50"></label>',
'<label>Mensagens por destinatário<input id="cvx-bgt-per" type="number" min="1" max="100" step="1" value="1"></label>',
'<label>Estimativa de mensagens entregues (%)<input id="cvx-bgt-percent" type="number" min="0" max="100" step="1" value="100"></label>',
'<label id="cvx-bgt-rate-label">Custo operacional por mensagem entregue (R$)<input id="cvx-bgt-rate" type="text" inputmode="decimal" value="0" autocomplete="off"></label>',
'<label>Despesa fixa (R$)<input id="cvx-bgt-fixed" type="text" inputmode="decimal" value="0" autocomplete="off"></label>',
'<label>Encargos adicionais (%)<input id="cvx-bgt-tax" type="number" min="0" max="100" step="0.1" value="0"></label>',
'<label>Saldo disponível informado (R$)<input id="cvx-bgt-balance" type="text" inputmode="decimal" value="0" autocomplete="off"></label>',
'</div>',
'<p id="cvx-bgt-help" class="cvx-bgt-help"></p>',
'<div class="cvx-bgt-sum">',
'<div><span>Destinatários</span><b id="cvx-bgt-rpeople"></b></div>',
'<div><span>Mensagens planejadas</span><b id="cvx-bgt-rplanned"></b></div>',
'<div><span>Entregas estimadas</span><b id="cvx-bgt-rdelivered"></b></div>',
'<div><span>Custo variável estimado</span><b id="cvx-bgt-rvariable"></b></div>',
'<div><span>Despesa fixa e encargos</span><b id="cvx-bgt-rextra"></b></div>',
'<div class="cvx-bgt-total"><span>Total previsto</span><b id="cvx-bgt-rtotal"></b></div>',
'<div><span>Saldo informado</span><b id="cvx-bgt-rbalance"></b></div>',
'<div class="cvx-bgt-need"><span>Valor adicional necessário</span><b id="cvx-bgt-rneed"></b></div>',
'</div>',
'<p class="cvx-bgt-note">O custo unitário por QR começa em R$ 0,00 porque a tarifa por mensagem da API oficial não se aplica. Custos de infraestrutura, fornecedores ou ferramentas devem ser preenchidos pelo usuário. Tarifas oficiais são editáveis e devem ser confirmadas com a Meta. Saldo informado não é saldo consultado.</p>',
'<p class="cvx-bgt-note">Estimativas não garantem envio ou entrega. Envie comunicações comerciais apenas a destinatários com autorização válida, respeitando descadastros e regras do WhatsApp. A conexão por QR não é autorização da Meta para campanhas automatizadas e pode sofrer bloqueios.</p>',
'<footer><button type="button" id="cvx-bgt-copy">Copiar orçamento</button><button type="button" class="cvx-bgt-primary" data-close>Fechar</button></footer>',
'<p id="cvx-bgt-msg" role="status" aria-live="polite"></p>',
'</div></div>'
].join("");
const css=[
'#'+ID+' .cvx-bgt-back[hidden]{display:none!important}',
'#'+ID+' .cvx-bgt-back{position:fixed;inset:0;z-index:2147483000;background:#061b29c9;display:grid;place-items:center;overflow:auto;padding:12px}',
'#'+ID+' .cvx-bgt-box{font:14px/1.5 system-ui,-apple-system,Arial,sans-serif;box-sizing:border-box;width:min(820px,100%);max-height:97vh;overflow:auto;background:#fff;color:#193747;padding:clamp(16px,3vw,29px);border-radius:20px;box-shadow:0 22px 70px #001f3477}',
'#'+ID+' header{display:flex;justify-content:space-between;gap:15px;align-items:start;background:none!important;padding:0!important;color:#173749}',
'#'+ID+' header small{font-size:11px;letter-spacing:.1em;color:#087f70;font-weight:800}',
'#'+ID+' h2{font-size:clamp(22px,3vw,31px);line-height:1.2;margin:6px 0 0;color:#173749}',
'#'+ID+' p{color:#4d6778;margin:12px 0}',
'#'+ID+' .cvx-bgt-inputs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px;margin:20px 0}',
'#'+ID+' label{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:700;color:#305569;min-width:0}',
'#'+ID+' label[hidden]{display:none!important}',
'#'+ID+' input,#'+ID+' select{font:inherit;font-weight:600;box-sizing:border-box;width:100%;min-width:0;min-height:43px;padding:9px;background:white;border:1px solid #b8cdd7;border-radius:10px;color:#193747}',
'#'+ID+' button{font:inherit;font-weight:750;min-height:40px;padding:9px 15px;border:1px solid #c1d1d8;background:#edf5f7;color:#1a475e;border-radius:10px;cursor:pointer}',
'#'+ID+' button:focus-visible,#'+ID+' input:focus-visible,#'+ID+' select:focus-visible{outline:3px solid #10ae94;outline-offset:2px}',
'#'+ID+' .cvx-bgt-help{background:#eef8f5;border-left:4px solid #0b9982;border-radius:7px;padding:12px 14px;color:#315b58}',
'#'+ID+' .cvx-bgt-sum{border:1px solid #dbe7ed;border-radius:14px;overflow:hidden;margin:17px 0}',
'#'+ID+' .cvx-bgt-sum>div{display:flex;justify-content:space-between;gap:13px;align-items:center;padding:10px 15px;border-bottom:1px solid #e0eaed}',
'#'+ID+' .cvx-bgt-sum>div:last-child{border:0}',
'#'+ID+' .cvx-bgt-sum>div b{font-variant-numeric:tabular-nums;text-align:right}',
'#'+ID+' .cvx-bgt-total{background:#153c50;color:#fff;font-size:20px}',
'#'+ID+' .cvx-bgt-need{background:#dcf5eb;color:#0b705a;font-size:16px}',
'#'+ID+' .cvx-bgt-note{font-size:12px!important}',
'#'+ID+' footer{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:9px;margin-top:17px}',
'#'+ID+' .cvx-bgt-primary{background:#0a8974;color:white;border-color:#0a8974}',
'#'+ID+' #cvx-bgt-msg{color:#047661;text-align:right}',
'#app .cvx-bgt-launch{border:1px solid #087f70!important;background:#087f70!important;color:white!important;border-radius:10px;min-height:42px;padding:10px 13px;font-weight:750;cursor:pointer}',
'@media(max-width:650px){#'+ID+' .cvx-bgt-back{padding:6px;align-items:start}#'+ID+' .cvx-bgt-box{max-height:99vh;border-radius:14px}#'+ID+' .cvx-bgt-inputs{grid-template-columns:minmax(0,1fr)}}'
].join("\n");
const rates={marketing:"0,3217",utility:"0,0350",authentication:"0,0350",service:"0,0350"};
let previousFocus,summary;
function calc(){
 if(!E("cvx-bgt-people"))return;
 const people=Math.min(1000000,Math.floor(get("cvx-bgt-people")));
 const per=Math.min(100,Math.max(1,Math.floor(get("cvx-bgt-per"))));
 const planned=people*per,delivered=Math.round(planned*Math.min(100,get("cvx-bgt-percent"))/100);
 const rate=get("cvx-bgt-rate"),fixed=get("cvx-bgt-fixed"),tax=Math.min(100,get("cvx-bgt-tax"))/100,balance=get("cvx-bgt-balance");
 const variable=round(delivered*rate),extra=round(fixed+(variable+fixed)*tax),total=round(variable+extra),need=round(Math.max(0,total-balance));
 summary={channel:E("cvx-bgt-channel").value,category:E("cvx-bgt-kind").value,people,planned,delivered,rate,variable,extra,total,balance,need};
 [["rpeople",people.toLocaleString("pt-BR")],["rplanned",planned.toLocaleString("pt-BR")],["rdelivered",delivered.toLocaleString("pt-BR")],["rvariable",money(variable)],["rextra",money(extra)],["rtotal",money(total)],["rbalance",money(balance)],["rneed",money(need)]].forEach(([id,v])=>E("cvx-bgt-"+id).textContent=v);
}
function channelChange(){
 const meta=E("cvx-bgt-channel").value==="meta";
 E("cvx-bgt-kind-label").hidden=!meta;
 E("cvx-bgt-rate-label").firstChild.textContent=meta?"Tarifa estimada por mensagem entregue (R$)":"Custo operacional por mensagem entregue (R$)";
 E("cvx-bgt-rate").value=meta?rates[E("cvx-bgt-kind").value]:"0";
 E("cvx-bgt-help").textContent=meta?"API oficial: referência de marketing Brasil (out/2026) R$ 0,3217, editável. Outras categorias usam valores ilustrativos; confirme preços, país, tributos e condições na Meta.":"WhatsApp via QR: custo da API oficial da Meta não se aplica. Digite somente seus custos reais de operação/fornecedor, se houver. Não realiza envios.";
 calc();
}
function close(){E(ID).querySelector(".cvx-bgt-back").hidden=true;previousFocus?.focus?.();}
function open(){previousFocus=document.activeElement;E(ID).querySelector(".cvx-bgt-back").hidden=false;E("cvx-bgt-people").focus();calc();}
function init(){
 if(E(ID))return;
 const el=document.createElement("div");el.id=ID;el.innerHTML=rows;
 const style=document.createElement("style");style.id=ID+"-style";style.textContent=css;
 document.head.appendChild(style);document.body.appendChild(el);
 el.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",close));
 el.querySelector(".cvx-bgt-back").addEventListener("click",e=>{if(e.target===e.currentTarget)close()});
 el.querySelectorAll("input,select").forEach(e=>e.addEventListener("input",calc));
 E("cvx-bgt-channel").addEventListener("change",channelChange);
 E("cvx-bgt-kind").addEventListener("change",()=>{E("cvx-bgt-rate").value=rates[E("cvx-bgt-kind").value];calc()});
 E("cvx-bgt-copy").addEventListener("click",async()=>{
  if(!summary)return;
  const s=summary;
  const text=["COMVERXA • Orçamento estimado",s.channel==="qr"?"Canal: QR/Evolution sem API oficial":"Canal: API oficial "+s.category,"Destinatários: "+s.people,"Mensagens planejadas: "+s.planned,"Entregas estimadas: "+s.delivered,"Custo unitário informado: "+money(s.rate),"Custo variável: "+money(s.variable),"Despesa fixa e encargos: "+money(s.extra),"Total previsto: "+money(s.total),"Saldo informado: "+money(s.balance),"Diferença estimada: "+money(s.need),"Sem envio, consulta de saldo ou cobrança."].join("\n");
  try{await navigator.clipboard.writeText(text);E("cvx-bgt-msg").textContent="Orçamento copiado."}catch{E("cvx-bgt-msg").textContent="Não foi possível copiar. Verifique a permissão do navegador."}
 });
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!el.querySelector(".cvx-bgt-back").hidden)close()});
 channelChange();
}
function mount(){
 const app=E("app");if(!app||!app.querySelector)return;
 const nav=app.querySelector("nav.tabs");
 const campaign=app.querySelector("#campaigns")||[...app.querySelectorAll("section.screen")].find(s=>/campanhas|disparos/i.test(s.querySelector("h2")?.textContent||""));
 if(!nav&&!campaign)return;
 init();
 for(const target of [nav,campaign?.querySelector(".actions")||campaign?.querySelector("h2")?.parentElement]){
  if(!target||target.querySelector(".cvx-bgt-launch"))continue;
  const btn=document.createElement("button");btn.type="button";btn.className="cvx-bgt-launch";btn.textContent="Simular custo de disparos";
  btn.addEventListener("click",open);target.appendChild(btn);
 }
}
let pending=false;
function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;mount()})}
function start(){mount();new MutationObserver(schedule).observe(E("app")||document.body,{childList:true,subtree:true})}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();

/* COMVERXA · Selecao local de contatos e linha QR para orcamento; sem envio. */
(function(){
"use strict";
if(window.__cvxBudgetContactsInstalled)return;window.__cvxBudgetContactsInstalled=true;
const ID="cvx-budget-contacts",el=id=>document.getElementById(id);
const css="#cvx-budget-contacts{margin:16px 0;padding:16px;background:#f5fafb;border:1px solid #d4e4ea;border-radius:14px;color:#24475c;font:14px/1.5 system-ui,sans-serif}\n#cvx-budget-contacts summary{font-weight:850;cursor:pointer;font-size:16px}\n#cvx-budget-contacts label.cvx-contact-row{display:flex;flex-direction:row;align-items:center;gap:8px;padding:9px;border-bottom:1px solid #e2ecf0;cursor:pointer}\n#cvx-budget-contacts .cvx-contact-row input{width:18px;min-height:18px;height:18px;flex:0 0 18px}\n#cvx-budget-contacts input:not([type=checkbox]),#cvx-budget-contacts select,#cvx-budget-contacts textarea{width:100%;box-sizing:border-box;min-height:41px;border:1px solid #b7cfda;border-radius:9px;background:white;padding:9px;font:inherit;color:#19394c}\n#cvx-budget-contacts textarea{min-height:72px;resize:vertical}\n#cvx-budget-contacts button{padding:9px 12px;border:1px solid #a9c6cc;background:#fff;color:#19655c;border-radius:9px;cursor:pointer;font-weight:700}\n#cvx-budget-contacts button:focus-visible,#cvx-budget-contacts input:focus-visible,#cvx-budget-contacts select:focus-visible{outline:3px solid #17ad92}\n#cvx-budget-contacts .cvx-contact-list{background:white;max-height:210px;overflow:auto;border:1px solid #d2e4eb;border-radius:9px;margin:8px 0}\n#cvx-budget-contacts .cvx-contacts-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}\n#cvx-budget-contacts .cvx-contact-stat{font-weight:800;color:#0e7869}\n#cvx-budget-contacts .cvx-contact-note{background:#fff7e3;border-left:3px solid #d6a64b;padding:9px;font-size:12px;margin-top:9px;color:#61512d}\n#cvx-budget-contacts .cvx-contact-preview{white-space:pre-wrap;overflow-wrap:anywhere;padding:10px;border-radius:9px;background:#e2f6f0;color:#155949}\n#cvx-budget-contacts .cvx-contact-muted{color:#6b8190;font-size:12px;margin:7px 0}",layout="<summary>Escolher contatos do CRM e linha QR (orçamento)</summary><p class='cvx-contact-muted'>Somente planejamento local. Nenhum contato será modificado e nenhuma mensagem será enviada.</p><label>Linha WhatsApp por QR<select id='cvx-bc-line'><option value=''>Todas as linhas (planejamento)</option></select></label><label>Pesquisar contatos<input id='cvx-bc-search' type='search' placeholder='Nome ou classificação' autocomplete='off'></label><div class='cvx-contacts-actions'><button type='button' id='cvx-bc-refresh'>Atualizar</button><button type='button' id='cvx-bc-select-all'>Selecionar exibidos</button><button type='button' id='cvx-bc-clear'>Limpar</button></div><p class='cvx-contact-muted' id='cvx-bc-status' role='status'></p><div class='cvx-contact-list' id='cvx-bc-list'></div><p id='cvx-bc-count' class='cvx-contact-stat'>0 selecionados</p><p class='cvx-contact-note'>O cadastro no CRM não comprova consentimento para marketing. Confirme a autorização individual e respeite descadastros antes de qualquer envio. Nenhum disparo acontece aqui.</p><label>Mensagem (prévia, não enviada)<textarea id='cvx-bc-msg' maxlength='5000' placeholder='Olá, {nome}! Posso enviar uma proposta?'></textarea></label><p id='cvx-bc-preview' class='cvx-contact-preview'>Digite a mensagem para visualizar.</p>";
let shown=[],pool=[],selected=new Set();
const lid=l=>l&&l.id!==undefined&&l.id!==null?String(l.id):"";
const name=l=>String(l?.name||l?.nome||l?.full_name||"Sem nome").slice(0,85);
const stage=l=>String(l?.stage||l?.status||l?.temperature||"").slice(0,35);
const slot=l=>Number(l?.line||l?.slot||0);
const crmLeads=()=>{try{return typeof leads!=="undefined"&&Array.isArray(leads)?leads:[]}catch{return []}};
const crmLines=()=>{try{return typeof lines!=="undefined"&&Array.isArray(lines)?lines:[]}catch{return []}};
function preview(){
const msg=el("cvx-bc-msg").value,first=pool.find(l=>selected.has(lid(l)));
el("cvx-bc-preview").textContent=msg?msg.replaceAll("{nome}",first?name(first):"Cliente"):"Digite a mensagem para visualizar.";
}
function syncCount(){
const current=new Set(pool.map(lid));for(const id of selected)if(!current.has(id))selected.delete(id);
el("cvx-bc-count").textContent=selected.size.toLocaleString("pt-BR")+" destinatários selecionados";
if(selected.size){const n=el("cvx-bgt-people");n.value=String(selected.size);n.dispatchEvent(new Event("input",{bubbles:true}))}
preview();
}
function render(){
const list=el("cvx-bc-list");if(!list)return;list.replaceChildren();
pool=crmLeads().filter(l=>lid(l));const currentSlot=el("cvx-bc-line").value;
const lineSelect=el("cvx-bc-line");lineSelect.replaceChildren();
function option(value,caption){const o=document.createElement("option");o.value=value;o.textContent=caption;lineSelect.append(o)}
option("","Todas as linhas (planejamento)");
const qr=crmLines().filter(l=>l?.mode==="qr");
qr.forEach(l=>option(String(l.slot),"WhatsApp "+l.slot+" · "+String(l.name||"QR").slice(0,60)));
if([...lineSelect.options].some(o=>o.value===currentSlot))lineSelect.value=currentSlot;
const q=el("cvx-bc-search").value.trim().toLowerCase(),s=Number(lineSelect.value);
const found=pool.filter(l=>(!s||!slot(l)||slot(l)===s)&&(!q||(name(l)+" "+stage(l)).toLowerCase().includes(q)));
shown=found.slice(0,150);
for(const lead of shown){
const row=document.createElement("label");row.className="cvx-contact-row";
const input=document.createElement("input");input.type="checkbox";input.checked=selected.has(lid(lead));input.setAttribute("aria-label","Selecionar "+name(lead));
const title=document.createElement("span");title.textContent=name(lead);
const info=document.createElement("small");info.textContent=" · "+(stage(lead)||"sem classificação");info.style.color="#68808e";title.append(info);
row.append(input,title);input.addEventListener("change",()=>{if(input.checked)selected.add(lid(lead));else selected.delete(lid(lead));syncCount()});
list.append(row);
}
if(!shown.length){const p=document.createElement("p");p.style.padding="12px";p.textContent="Nenhum contato disponível nesta sessão; utilize a quantidade manual acima.";list.append(p)}
el("cvx-bc-status").textContent=found.length+" encontrados · "+shown.length+" exibidos por vez. "+qr.length+" linhas QR cadastradas. Somente prévia.";
syncCount();
}
function install(){
if(el(ID))return true;
const help=el("cvx-bgt-help");if(!help)return false;
const style=document.createElement("style");style.textContent=css;style.id=ID+"-css";document.head.append(style);
const details=document.createElement("details");details.id=ID;details.innerHTML=layout;help.before(details);
el("cvx-bc-refresh").addEventListener("click",render);
el("cvx-bc-line").addEventListener("change",render);
el("cvx-bc-search").addEventListener("input",render);
el("cvx-bc-select-all").addEventListener("click",()=>{shown.forEach(l=>selected.add(lid(l)));render()});
el("cvx-bc-clear").addEventListener("click",()=>{selected.clear();render();const n=el("cvx-bgt-people");n.value="0";n.dispatchEvent(new Event("input",{bubbles:true}))});
el("cvx-bc-msg").addEventListener("input",preview);
details.addEventListener("toggle",()=>{if(details.open)render()});
return true;
}
function start(){if(install())return;const mo=new MutationObserver(()=>{if(install())mo.disconnect()});mo.observe(document.body,{childList:true,subtree:true})}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();