/* COMVERXA — Disparador QR com envio assistido de lotes pequenos e simulador de orçamento. A API real só é chamada após consentimento e confirmação expressa. */
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
'<header><div><small>COMVERXA · PLANEJAMENTO</small><h2 id="cvx-bgt-title">Disparador em massa · WhatsApp</h2></div><button type="button" data-close aria-label="Fechar">×</button></header>',
'<p>Monte a campanha com público, prévia e orçamento inspirado nas transmissões comerciais do WhatsApp Business. QR/Evolution e pagamentos da Meta são recursos diferentes; nenhuma cobrança acontece aqui.</p>',
"<section class=\"cvx-cmp-grid\" id=\"cvx-broadcast-composer\" aria-label=\"Preparar campanha\">\n<div class=\"cvx-cmp-left\">\n<div class=\"cvx-cmp-label\">Público <span id=\"cvx-cmp-count\">0 selecionados</span></div>\n<p class=\"cvx-cmp-muted\">Escolha os contatos no seletor abaixo. Não é necessário consentimento para simular ou preparar atendimento.</p>\n<label>Mensagem<textarea id=\"cvx-cmp-message\" maxlength=\"4000\" rows=\"4\" placeholder=\"Olá, {nome}! Temos uma novidade para você.\"></textarea></label>\n<p class=\"cvx-cmp-muted\">Use {nome} para personalizar. O envio QR em lote só ocorre após confirmação e validação do destinatário.</p>\n<div class=\"cvx-cmp-unavailable\"><b>Anexo opcional</b><span>Não disponível neste fluxo QR de texto. Fotos e documentos exigem integração de mídia homologada.</span></div>\n<div class=\"cvx-cmp-linkbox\"><b>Botão opcional / link de ação</b><small>No QR o link será acrescentado como texto, não será um botão interativo.</small><div class=\"cvx-cmp-linkrow\"><input id=\"cvx-cmp-link-label\" maxlength=\"65\" placeholder=\"Ex.: Ver proposta\" aria-label=\"Texto do link\"><input id=\"cvx-cmp-link-url\" placeholder=\"https://exemplo.com.br\" aria-label=\"URL https do link de ação\"></div></div>\n</div>\n<aside class=\"cvx-cmp-right\">\n<div class=\"cvx-cmp-label\">Prévia do WhatsApp</div><div class=\"cvx-cmp-bubble\" id=\"cvx-cmp-preview\">Sua mensagem aparecerá aqui.</div>\n<div class=\"cvx-cmp-label cvx-cmp-summary-head\">Resumo da campanha</div>\n<div class=\"cvx-cmp-line\"><span>Público selecionado</span><b id=\"cvx-cmp-recipients\">0</b></div>\n<div class=\"cvx-cmp-line\"><span>Mensagens planejadas</span><b id=\"cvx-cmp-planned\">0</b></div>\n<div class=\"cvx-cmp-line\"><span>Custo variável estimado</span><b id=\"cvx-cmp-cost\">R$ 0,00</b></div>\n<div class=\"cvx-cmp-line\"><span>Despesa fixa + encargos</span><b id=\"cvx-cmp-charges\">R$ 0,00</b></div>\n<div class=\"cvx-cmp-line cvx-cmp-grand\"><span>Total estimado</span><b id=\"cvx-cmp-total\">R$ 0,00</b></div>\n<div class=\"cvx-cmp-line\"><span>Saldo informado</span><b id=\"cvx-cmp-balance\">R$ 0,00</b></div>\n<div class=\"cvx-cmp-line cvx-cmp-need\"><span>Saldo adicional estimado</span><b id=\"cvx-cmp-need\">R$ 0,00</b></div>\n<button id=\"cvx-cmp-plan-topup\" type=\"button\" class=\"cvx-cmp-topup\">Planejar recarga</button>\n<div id=\"cvx-cmp-topup-panel\" hidden><strong>Planejamento, sem pagamento</strong><p class=\"cvx-cmp-muted\">Não acessamos o saldo do WhatsApp Business ou processamos cartão/Pix. Para adicionar fundos reais às transmissões comerciais da Meta, use os pagamentos do próprio WhatsApp Business.</p><label>Valor a simular (R$)<input id=\"cvx-cmp-topup-amount\" type=\"text\" inputmode=\"decimal\" placeholder=\"18,31\"></label><button type=\"button\" id=\"cvx-cmp-topup-simulate\">Simular saldo informado</button><small>Cartão · Pix · Boleto · Mercado Pago: não integrados ao COMVERXA.</small><p id=\"cvx-cmp-topup-status\" role=\"status\"></p><a href=\"https://faq.whatsapp.com/1800502557189664/?locale=pt_BR\" target=\"_blank\" rel=\"noopener noreferrer\">Como adicionar fundos no WhatsApp Business</a></div>\n<small class=\"cvx-cmp-footnote\">Custos editáveis; não são cotação, faturamento ou saldo real da Meta. No QR, a tarifa oficial por mensagem não se aplica.</small>\n</aside>\n</section>",
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
"#cvx-disparo-orcamento .cvx-bgt-box{width:min(1120px,100%)}\n#cvx-disparo-orcamento .cvx-cmp-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(280px,.9fr);gap:16px;margin:18px 0}\n#cvx-disparo-orcamento .cvx-cmp-left,#cvx-disparo-orcamento .cvx-cmp-right{background:#161c22;color:#eef4f4;border:1px solid #30424b;border-radius:16px;padding:18px;min-width:0}\n#cvx-disparo-orcamento .cvx-cmp-label{font-size:15px;font-weight:800;color:#fff;display:flex;justify-content:space-between;gap:12px;margin-bottom:13px}\n#cvx-disparo-orcamento .cvx-cmp-muted,#cvx-disparo-orcamento .cvx-cmp-footnote{color:#bac9cd;font-size:12px;line-height:1.6}\n#cvx-disparo-orcamento .cvx-cmp-left label,#cvx-disparo-orcamento .cvx-cmp-right label{color:#e4ecef}\n#cvx-disparo-orcamento .cvx-cmp-left textarea,#cvx-disparo-orcamento .cvx-cmp-left input,#cvx-disparo-orcamento .cvx-cmp-right input{background:#272f35;border-color:#49575f;color:#fff}\n#cvx-disparo-orcamento #cvx-cmp-message{width:100%;min-height:105px;resize:vertical;font:14px/1.5 system-ui,sans-serif}\n#cvx-disparo-orcamento .cvx-cmp-unavailable,#cvx-disparo-orcamento .cvx-cmp-linkbox{border:1px dashed #465961;border-radius:10px;padding:12px;margin:12px 0;display:flex;flex-direction:column;gap:7px}\n#cvx-disparo-orcamento .cvx-cmp-unavailable span,#cvx-disparo-orcamento .cvx-cmp-linkbox small{font-size:12px;color:#b3c0c7}\n#cvx-disparo-orcamento .cvx-cmp-linkrow{display:grid;grid-template-columns:1fr 1.4fr;gap:8px}\n#cvx-disparo-orcamento .cvx-cmp-bubble{white-space:pre-wrap;overflow-wrap:anywhere;min-height:88px;padding:13px;border-radius:12px 12px 3px 12px;background:#087b65;color:white;font-size:13px}\n#cvx-disparo-orcamento .cvx-cmp-summary-head{margin-top:20px}\n#cvx-disparo-orcamento .cvx-cmp-line{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #35434b;padding:9px 0;font-size:12px}\n#cvx-disparo-orcamento .cvx-cmp-line b{font-variant-numeric:tabular-nums;font-weight:800;white-space:nowrap}\n#cvx-disparo-orcamento .cvx-cmp-grand{font-size:16px;color:#fff}\n#cvx-disparo-orcamento .cvx-cmp-need{color:#87e6b9}\n#cvx-disparo-orcamento .cvx-cmp-topup{margin:12px 0;width:100%;background:#117b69;color:white;border-color:#117b69}\n#cvx-disparo-orcamento #cvx-cmp-topup-panel[hidden]{display:none}\n#cvx-disparo-orcamento #cvx-cmp-topup-panel{padding:13px;border:1px solid #425a5a;border-radius:12px;display:grid;gap:8px}\n#cvx-disparo-orcamento #cvx-cmp-topup-panel a{color:#81dbbf;text-decoration:underline}\n#cvx-disparo-orcamento #cvx-cmp-topup-panel small{color:#bac9cd}\n@media(max-width:760px){#cvx-disparo-orcamento .cvx-cmp-grid{grid-template-columns:minmax(0,1fr)}#cvx-disparo-orcamento .cvx-cmp-linkrow{grid-template-columns:minmax(0,1fr)}}",
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
 window.__cvxBroadcastRefresh?.();
}
function channelChange(){
 const meta=E("cvx-bgt-channel").value==="meta";
 E("cvx-bgt-kind-label").hidden=!meta;
 E("cvx-bgt-rate-label").firstChild.textContent=meta?"Tarifa estimada por mensagem entregue (R$)":"Custo operacional por mensagem entregue (R$)";
 E("cvx-bgt-rate").value=meta?rates[E("cvx-bgt-kind").value]:"0";
 E("cvx-bgt-help").textContent=meta?"API oficial: referência de marketing Brasil (out/2026) R$ 0,3217, editável. Outras categorias usam valores ilustrativos; confirme preços, país, tributos e condições na Meta.":"WhatsApp via QR: sem tarifa de mensagem da API oficial da Meta. Informe os custos operacionais reais. O orçamento é uma simulação; somente o botão Enviar próximos 10 (QR), após validação e confirmação, solicita envios.";
 calc();
}
const safeLink=v=>{try{const u=new URL(String(v||"").trim());return u.protocol==="https:"&&Boolean(u.hostname)&&!u.username&&!u.password;}catch{return false}};
function messageFor(name){
 const base=String(E("cvx-bc-msg")?.value||E("cvx-cmp-message")?.value||"").trim().replaceAll("{nome}",name||"Cliente");
 const url=String(E("cvx-cmp-link-url")?.value||"").trim();
 if(!url)return base;
 if(!safeLink(url))throw Error("Informe um link HTTPS válido para o botão opcional.");
 const label=String(E("cvx-cmp-link-label")?.value||"Saiba mais").trim().slice(0,65);
 return base+"\n"+label+": "+url;
}
window.__cvxBroadcastMessage=messageFor;
window.__cvxBroadcastLinkValid=()=>!E("cvx-cmp-link-url")?.value.trim()||safeLink(E("cvx-cmp-link-url").value);
function updateComposer(){
 if(!E("cvx-broadcast-composer"))return;
 const selected=window.__cvxBudgetSelectionIds?.()?.length||0;
 const count=String(selected)+" selecionados";
 E("cvx-cmp-count").textContent=count;
 E("cvx-cmp-recipients").textContent=count;
 const msg=E("cvx-bc-msg")?.value||E("cvx-cmp-message")?.value||"";
 if(document.activeElement!==E("cvx-cmp-message")&&E("cvx-cmp-message").value!==msg)E("cvx-cmp-message").value=msg;
 const link=String(E("cvx-cmp-link-url").value||"").trim();
 const valid=!link||safeLink(link);
 E("cvx-cmp-link-url").setAttribute("aria-invalid",String(!valid));
 let draft="";
 try{draft=messageFor("Cliente")||"Sua mensagem aparecerá aqui."}catch{draft=(msg||"Sua mensagem aparecerá aqui.")+"\n⚠ Link inválido: use HTTPS";}
 E("cvx-cmp-preview").textContent=draft;
 if(summary){
  for(const [id,value] of Object.entries({planned:summary.planned,cost:money(summary.variable),charges:money(summary.extra),total:money(summary.total),balance:money(summary.balance),need:money(summary.need)})){
   E("cvx-cmp-"+id).textContent=id==="planned"?value.toLocaleString("pt-BR"):value;
  }
 }
}
window.__cvxBroadcastRefresh=updateComposer;
function close(){E(ID).querySelector(".cvx-bgt-back").hidden=true;previousFocus?.focus?.();}
window.__cvxCloseMassSender=close;
function open(){previousFocus=document.activeElement;E(ID).querySelector(".cvx-bgt-back").hidden=false;const selected=E("cvx-budget-contacts");if(selected){selected.open=true;selected.dispatchEvent(new Event("toggle"));}E("cvx-bgt-people").focus();calc();}
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
 E("cvx-cmp-message").addEventListener("input",()=>{const target=E("cvx-bc-msg");if(target){target.value=E("cvx-cmp-message").value;target.dispatchEvent(new Event("input",{bubbles:true}))}updateComposer()});
 for(const id of ["cvx-cmp-link-label","cvx-cmp-link-url"])E(id).addEventListener("input",updateComposer);
 E("cvx-cmp-plan-topup").addEventListener("click",()=>{const panel=E("cvx-cmp-topup-panel");panel.hidden=!panel.hidden;if(!panel.hidden){E("cvx-cmp-topup-amount").value=String(summary?.need?.toFixed(2)||"0.00").replace(".",",");E("cvx-cmp-topup-amount").focus()}});
 E("cvx-cmp-topup-simulate").addEventListener("click",()=>{const amount=num(E("cvx-cmp-topup-amount").value);if(!(amount>0)||amount>1000000){E("cvx-cmp-topup-status").textContent="Digite um valor positivo de até R$ 1.000.000,00.";return}const actual=num(E("cvx-bgt-balance").value);E("cvx-bgt-balance").value=String(round(actual+amount)).replace(".",",");calc();E("cvx-cmp-topup-status").textContent="Saldo simulado atualizado. Não houve pagamento nem crédito real.";});
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
 for(const [target,label] of [
  [nav,"Disparador em massa (WhatsApp QR)"],
  [campaign?.querySelector(".actions")||campaign?.querySelector("h2")?.parentElement,"Abrir disparador em massa"]
 ]){
  if(!target||target.querySelector(".cvx-bgt-launch"))continue;
  const btn=document.createElement("button");btn.type="button";btn.className="cvx-bgt-launch";
  btn.textContent=label;btn.setAttribute("aria-haspopup","dialog");
  btn.title="Selecione contatos, calcule o custo e valide uma campanha WhatsApp QR";
  btn.addEventListener("click",open);
  target.prepend(btn);
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
const css="#cvx-budget-contacts{margin:16px 0;padding:16px;background:#f5fafb;border:1px solid #d4e4ea;border-radius:14px;color:#24475c;font:14px/1.5 system-ui,sans-serif}\n#cvx-budget-contacts summary{font-weight:850;cursor:pointer;font-size:16px}\n#cvx-budget-contacts label.cvx-contact-row{display:flex;flex-direction:row;align-items:center;gap:8px;padding:9px;border-bottom:1px solid #e2ecf0;cursor:pointer}\n#cvx-budget-contacts .cvx-contact-row input{width:18px;min-height:18px;height:18px;flex:0 0 18px}\n#cvx-budget-contacts input:not([type=checkbox]),#cvx-budget-contacts select,#cvx-budget-contacts textarea{width:100%;box-sizing:border-box;min-height:41px;border:1px solid #b7cfda;border-radius:9px;background:white;padding:9px;font:inherit;color:#19394c}\n#cvx-budget-contacts textarea{min-height:72px;resize:vertical}\n#cvx-budget-contacts button{padding:9px 12px;border:1px solid #a9c6cc;background:#fff;color:#19655c;border-radius:9px;cursor:pointer;font-weight:700}\n#cvx-budget-contacts button:focus-visible,#cvx-budget-contacts input:focus-visible,#cvx-budget-contacts select:focus-visible{outline:3px solid #17ad92}\n#cvx-budget-contacts .cvx-contact-list{background:white;max-height:210px;overflow:auto;border:1px solid #d2e4eb;border-radius:9px;margin:8px 0}\n#cvx-budget-contacts .cvx-contacts-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}\n#cvx-budget-contacts .cvx-contact-stat{font-weight:800;color:#0e7869}\n#cvx-budget-contacts .cvx-contact-note{background:#fff7e3;border-left:3px solid #d6a64b;padding:9px;font-size:12px;margin-top:9px;color:#61512d}\n#cvx-budget-contacts .cvx-contact-preview{white-space:pre-wrap;overflow-wrap:anywhere;padding:10px;border-radius:9px;background:#e2f6f0;color:#155949}\n#cvx-budget-contacts .cvx-contact-muted{color:#6b8190;font-size:12px;margin:7px 0}\n#cvx-budget-contacts .cvx-contact-entry{display:flex;align-items:center;gap:8px;border-bottom:1px solid #e2ecf0;flex-wrap:wrap}\n#cvx-budget-contacts .cvx-contact-entry .cvx-contact-row{flex:1 1 210px;border-bottom:0}\n#cvx-budget-contacts .cvx-review-optin{font-size:12px;min-height:34px;margin:4px 6px 4px 0}",layout="<summary>Escolher contatos do CRM e linha QR</summary><p class='cvx-contact-muted'>Selecione qualquer contato para orçamento ou preparação de atendimento individual. Campanhas automáticas exigem autorização para mensagens pelo WhatsApp; não é necessário marcar consentimento para preparar uma conversa.</p><label>Linha WhatsApp por QR<select id='cvx-bc-line'><option value=''>Todas as linhas (planejamento)</option></select></label><label>Pesquisar contatos<input id='cvx-bc-search' type='search' placeholder='Nome ou classificação' autocomplete='off'></label><div class='cvx-contacts-actions'><button type='button' id='cvx-bc-refresh'>Atualizar</button><button type='button' id='cvx-bc-select-all'>Selecionar exibidos</button><button type='button' id='cvx-bc-clear'>Limpar</button></div><p class='cvx-contact-muted' id='cvx-bc-status' role='status'></p><div class='cvx-contact-list' id='cvx-bc-list'></div><p id='cvx-bc-count' class='cvx-contact-stat'>0 selecionados</p><p class='cvx-contact-note'>Seleção, simulação e preparação manual não exigem a caixa de consentimento. Para envios comerciais em lote, só entram contatos com autorização registrada. Pedidos de descadastro sempre são respeitados.</p><label>Mensagem da campanha (prévia)<textarea id='cvx-bc-msg' maxlength='5000' placeholder='Olá, {nome}! Posso enviar uma proposta?'></textarea></label><p id='cvx-bc-preview' class='cvx-contact-preview'>Digite a mensagem para visualizar.</p>";
let shown=[],pool=[],selected=new Set();
window.__cvxBudgetSelectionIds=()=>Array.from(selected);
const lid=l=>l&&l.id!==undefined&&l.id!==null?String(l.id):"";
const name=l=>String(l?.name||l?.nome||l?.full_name||"Sem nome").slice(0,85);
const stage=l=>String(l?.stage||l?.status||l?.temperature||"").slice(0,35);
const slot=l=>Number(l?.line||l?.slot||0);
const crmLeads=()=>{try{return typeof leads!=="undefined"&&Array.isArray(leads)?leads:[]}catch{return []}};
const crmLines=()=>{try{return typeof lines!=="undefined"&&Array.isArray(lines)?lines:[]}catch{return []}};
function preview(){
const msg=el("cvx-bc-msg").value,first=pool.find(l=>selected.has(lid(l)));
el("cvx-bc-preview").textContent=msg?msg.replaceAll("{nome}",first?name(first):"Cliente"):"Digite a mensagem para visualizar.";
window.__cvxBroadcastRefresh?.();
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
const input=document.createElement("input");input.type="checkbox";input.value=lid(lead);input.dataset.leadId=lid(lead);input.checked=selected.has(lid(lead));input.setAttribute("aria-label","Selecionar "+name(lead));
const title=document.createElement("span");title.textContent=name(lead);
const approved=typeof window.__cvxQrConsentEligible==="function"&&window.__cvxQrConsentEligible(lead);
const info=document.createElement("small");info.textContent=" · "+(stage(lead)||"sem classificação")+(approved?" · autorizado":" · sem autorização");info.style.color=approved?"#147452":"#8b5f25";title.append(info);
row.append(input,title);input.addEventListener("change",()=>{if(input.checked)selected.add(lid(lead));else selected.delete(lid(lead));syncCount()});
const entry=document.createElement("div");entry.className="cvx-contact-entry";entry.append(row);
if(!approved){
 const review=document.createElement("button");review.type="button";review.className="cvx-review-optin";review.textContent="Revisar autorização";review.dataset.reviewLeadId=lid(lead);
 review.addEventListener("click",()=>{
  if(typeof window.editLead!=="function"){el("cvx-bc-status").textContent="Abra Leads > Editar para revisar a autorização deste contato.";return}
  if(typeof window.__cvxCloseMassSender==="function")window.__cvxCloseMassSender();
  if(typeof window.switchTab==="function")window.switchTab("leads");
  window.editLead(Number(lid(lead)));
  const chk=document.querySelector('#leadForm [name="optin"]');
  if(chk&&Object.prototype.hasOwnProperty.call(lead,"optin")&&typeof window.__cvxQrOptinTrue==="function")
   chk.checked=window.__cvxQrOptinTrue(lead.optin);
 });
 entry.append(review);
}
list.append(entry);
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

/* COMVERXA — fila assistida QR e mini-lotes com validação da API autenticada; sem envios espontâneos. */
(function(){
"use strict";
if(window.__cvxQrAssistedQueueInstalled)return;window.__cvxQrAssistedQueueInstalled=true;
const ID="cvx-qr-assist",get=id=>document.getElementById(id);
const html=[
'<h3>Atendimento individual e campanhas QR</h3>',
'<p>Você pode preparar atendimentos individuais sem o campo de consentimento. O botão Enviar próximos 10 (QR) continua restrito a destinatários autorizados, com confirmação e revalidação.</p>',
'<label>WhatsApp QR usado na preparação<select id="cvx-qa-line"></select></label>',
'<div class="cvx-qa-btns"><button id="cvx-qa-build" type="button">Validar contatos selecionados</button><button id="cvx-qa-next" type="button" disabled>Preparar próximo atendimento</button><button id="cvx-qa-send" type="button" disabled>Enviar próximos 10 (QR)</button><button id="cvx-qa-stop" type="button" disabled>Parar próximos envios</button><button id="cvx-qa-reset" type="button">Limpar fila</button></div>',
'<div id="cvx-qa-summary" role="status" aria-live="polite">Selecione contatos para preparar atendimentos. O sistema separa aqueles aptos para campanhas.</div><button id="cvx-qa-review" type="button" hidden>Revisar autorizações</button>',
'<div class="cvx-qa-list" id="cvx-qa-list"></div>',
'<p class="cvx-qa-warning">Preparar o atendimento apenas abre a conversa e preenche a mensagem, sem enviar. Para iniciar campanhas de marketing em lote, é necessária permissão válida para contato no WhatsApp. Pedidos de descadastro, linhas incorretas e números inválidos continuam bloqueados.</p>'
].join("");
const css=[
"#cvx-qr-assist{border:1px solid #d5e6e9;border-radius:13px;background:#fff;margin-top:15px;padding:15px;color:#1c4657;line-height:1.5}",
"#cvx-qr-assist h3{font:800 18px/1.3 system-ui,sans-serif;margin:0 0 8px;color:#0b7064}",
"#cvx-qr-assist p{font-size:13px}",
"#cvx-qr-assist label{display:block;font-size:13px;font-weight:750;margin:12px 0}",
"#cvx-qr-assist select{width:100%;min-height:42px;padding:8px;border:1px solid #b5d0d9;border-radius:10px;background:white;color:#23485b}",
"#cvx-qr-assist .cvx-qa-btns{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}",
"#cvx-qr-assist button{font:750 13px system-ui,sans-serif;min-height:40px;padding:9px 11px;border:1px solid #99c4c3;border-radius:9px;background:#edf8f6;color:#116659;cursor:pointer}",
"#cvx-qr-assist button:disabled{opacity:.45;cursor:default}",
"#cvx-qr-assist button:focus-visible{outline:3px solid #15a992;outline-offset:2px}",
"#cvx-qr-assist .cvx-qa-list{max-height:170px;overflow:auto;border:1px solid #e3edf0;border-radius:9px;margin:10px 0}",
"#cvx-qr-assist .cvx-qa-row{padding:8px 11px;border-bottom:1px solid #e8edef;font-size:13px;display:flex;justify-content:space-between;gap:9px}",
"#cvx-qr-assist .cvx-qa-warning{border-left:3px solid #cba043;background:#fffaec;padding:10px;font-size:12px;color:#6a562b}"
].join("\n");
const explicitOptin=x=>x===true||x===1||(typeof x==="string"&&["true","1","sim","yes"].includes(x.trim().toLowerCase()));
const optedOut=l=>explicitOptin(l?.opt_out)||explicitOptin(l?.unsubscribed)||explicitOptin(l?.do_not_contact);
const eligible=l=>{
 const x=l?.optin??l?.consent??l?.opt_in??l?.marketing_consent;
 return explicitOptin(x)&&!optedOut(l);
};
window.__cvxQrConsentEligible=eligible;
window.__cvxQrOptinTrue=explicitOptin;
const phone=l=>String(l?.phone||l?.telefone||l?.whatsapp||"").replace(/\D/g,"");
const leadId=l=>l?.id===undefined||l?.id===null?"":String(l.id);
const leadName=l=>String(l?.name||l?.nome||"Contato").slice(0,90);
const leadLine=l=>Number(l?.line||l?.slot||0);
const crmLines=()=>{try{return typeof lines!=="undefined"&&Array.isArray(lines)?lines:[]}catch{return []}};
const crmLeads=()=>{try{return typeof leads!=="undefined"&&Array.isArray(leads)?leads:[]}catch{return []}};
let queue=[],position=0,sending=false,stopRequested=false;
const attemptedIds=new Set(),attemptedPhones=new Set();
function linePicker(){
 const sel=get("cvx-qa-line"),old=sel.value;
 sel.replaceChildren();const o=document.createElement("option");o.value="";o.textContent="Selecione uma linha QR";sel.append(o);
 for(const l of crmLines().filter(x=>x?.mode==="qr")){
  const item=document.createElement("option");item.value=String(l.slot);item.textContent="WhatsApp "+l.slot+" · "+String(l.name||"QR").slice(0,55);sel.append(item);
 }
 if([...sel.options].some(x=>x.value===old))sel.value=old;
}
function render(){
 const holder=get("cvx-qa-list");holder.replaceChildren();
 for(let i=0;i<Math.min(queue.length,150);i++){
  const q=queue[i],row=document.createElement("div");row.className="cvx-qa-row";
  const label=document.createElement("span");label.textContent=(i+1)+". "+q.name;
  const right=document.createElement("span");right.textContent=q.deliveryStatus==="accepted"?"Aceita para envio":q.deliveryStatus==="uncertain"?"Resultado incerto":i<position?"Preparado":!q.canBatch?"Atendimento manual":i===position?"Próximo":"Apto para lote";row.append(label,right);holder.append(row);
 }
 get("cvx-qa-next").disabled=sending||position>=queue.length||queue.length===0;
 get("cvx-qa-build").disabled=sending;
 get("cvx-qa-line").disabled=sending;
 get("cvx-qa-send").disabled=sending||!queue.some(q=>q.canBatch&&q.deliveryStatus==="pending"&&!attemptedIds.has(q.id));
 get("cvx-qa-stop").disabled=!sending;
}
function msg(s){get("cvx-qa-summary").textContent=s}
function reset(){if(sending){msg("Envio em andamento. Use Parar próximos envios antes de limpar.");return}queue=[];position=0;render();get("cvx-qa-review").hidden=true;msg("Fila limpa. Registros existentes preservados; mensagens já aceitas pelo servidor não podem ser desfeitas.")}
function build(){
 if(sending){msg("Campanha em andamento. Aguarde a confirmação ou solicite Parar próximos envios.");return}
 queue=[];position=0;get("cvx-qa-review").hidden=true;
 const sid=Number(get("cvx-qa-line").value);
 const qr=crmLines().find(l=>Number(l.slot)===sid&&l.mode==="qr");
 if(!qr){render();msg("Selecione uma linha configurada em modo QR antes de preparar.");return}
 const fields=Array.from(document.querySelectorAll("#cvx-bc-list input[type=checkbox]:checked"));
 const ids=new Set(typeof window.__cvxBudgetSelectionIds==="function"?window.__cvxBudgetSelectionIds():fields.map(i=>i.value).filter(Boolean));
 // Browser leads are scoped to the signed-in CRM. Never infer consent from a selected checkbox.
 const used=new Set(),raw=crmLeads();let noConsent=0,optouts=0,badPhone=0,wrongLine=0,duplicates=0;
 for(const l of raw){
  if(!ids.has(leadId(l)))continue;
  if(optedOut(l)){optouts++;continue}
  if(leadLine(l)!==sid){wrongLine++;continue}
  const p=phone(l);if(!/^\d{10,15}$/.test(p)){badPhone++;continue}
  if(used.has(p)){duplicates++;continue}
  if(attemptedIds.has(leadId(l))||attemptedPhones.has(p)){duplicates++;continue}
  const canBatch=eligible(l);
  if(!canBatch)noConsent++;
  used.add(p);queue.push({id:leadId(l),name:leadName(l),phone:p,canBatch,deliveryStatus:"pending"});
  if(queue.length>=150)break;
 }
 render();
 const review=get("cvx-qa-review");review.hidden=noConsent===0;review.textContent="Revisar autorização de "+noConsent+" contato(s)";
 const budget=get("cvx-bgt-people");if(budget){budget.value=String(queue.length);budget.dispatchEvent(new Event("input",{bubbles:true}))}
 msg(queue.length+" contatos para atendimento manual, "+queue.filter(q=>q.canBatch).length+" aptos para lote QR. "+noConsent+" sem autorização para campanha podem ser preparados individualmente, sem envio automático. Excluídos: "+optouts+" descadastrados, "+badPhone+" telefone(s) inválido(s), "+wrongLine+" fora da linha e "+duplicates+" duplicados. Nenhum envio ocorreu nesta validação.");
}
async function next(){
 if(position>=queue.length)return;
 const q=queue[position],raw=crmLeads().find(l=>leadId(l)===q.id),sid=Number(get("cvx-qa-line").value);
 if(!raw||optedOut(raw)||leadLine(raw)!==sid||phone(raw)!==q.phone){msg("Cadastro ou descadastro mudou. Revalide a fila antes de continuar.");reset();return}
 const body=get("cvx-bc-msg")?.value?.trim()||"";
 if(!body){msg("Digite a mensagem na prévia antes de abrir o atendimento.");return}
 let formatted;
 try{formatted=typeof window.__cvxBroadcastMessage==="function"?window.__cvxBroadcastMessage(q.name):body.replaceAll("{nome}",q.name)}catch(err){msg(err.message||"Link inválido");return}
 try{
  if(typeof window.openThread!=="function"){msg("Não foi possível abrir a conversa automaticamente nesta tela. Use a Caixa de entrada do CRM para continuar.");return}
  const tab=Array.from(document.querySelectorAll("#tabs button,nav.tabs button")).find(x=>(x.getAttribute("onclick")||"").includes("inbox")||x.getAttribute("data-tab")==="inbox");
  if(tab)tab.click();
  await window.openThread(Number(q.id));
  const input=get("replyText");
  if(!input){msg("Conversa aberta, mas o campo de mensagem não foi encontrado. Não houve envio.");return}
  input.value=formatted;input.dispatchEvent(new Event("input",{bubbles:true}));
  position++;render();
  msg("Mensagem de "+q.name+" preparada no atendimento, sem envio. "+(!eligible(raw)?"Sem autorização de WhatsApp registrada: use apenas para responder a uma solicitação existente; não envie publicidade não solicitada. ":"")+"Confira a conversa antes de decidir se deve responder. "+(queue.length-position)+" restantes.");
 }catch(e){msg("Não foi possível preparar esta conversa. Nada foi enviado pela fila.");}
}

async function sendBatch(){
 if(sending)return;
 if(get("cvx-bgt-channel")?.value!=="qr"){msg("Para envio pela Evolution, selecione WhatsApp por QR / Evolution no tipo de conexão antes de confirmar.");return}
 const tasks=queue.filter(q=>q.canBatch&&q.deliveryStatus==="pending"&&!attemptedIds.has(q.id)).slice(0,10);
 if(tasks.length===0){msg("Não há destinatários pendentes. Mensagens com resultado incerto não serão reenviadas automaticamente.");return}
 const slot=Number(get("cvx-qa-line").value);
 const line=crmLines().find(l=>Number(l.slot)===slot&&l.mode==="qr");
 const template=get("cvx-bc-msg")?.value?.trim()||"";
 if(typeof window.__cvxBroadcastLinkValid==="function"&&!window.__cvxBroadcastLinkValid()){msg("Informe um link HTTPS válido antes de enviar.");return}
 if(!line||!template||template.length>4000){msg("Selecione a linha QR e informe uma mensagem com até 4.000 caracteres.");return}
 if(typeof window.api!=="function"){msg("É necessário entrar na sua conta para usar a API autenticada do CRM.");return}
 let current;
 try{
  const [session,remoteLines,remoteLeads]=await Promise.all([
   window.api("/api/me"),window.api("/api/lines"),window.api("/api/leads")
  ]);
  if(!session?.user||!["trial","active"].includes(String(session?.company?.status||""))){msg("A sessão ou assinatura da empresa precisa estar ativa.");return}
  const serverLine=(remoteLines?.items||[]).find(l=>Number(l.slot)===slot&&l.mode==="qr");
  if(!serverLine){msg("A linha QR não está disponível nesta conta. Atualize as conexões.");return}
  if(!Array.isArray(remoteLeads?.items)){msg("Não foi possível verificar os destinatários no servidor. Nenhuma mensagem enviada.");return}
  current=new Map(remoteLeads.items.map(l=>[leadId(l),l]));
  for(const q of tasks){
   const l=current.get(q.id);
   if(!l||!eligible(l)||leadLine(l)!==slot||phone(l)!==q.phone){
    msg("A lista foi alterada ou algum contato perdeu autorização. Revalide a campanha; nada foi enviado.");return;
   }
  }
 }catch(error){msg("Não foi possível validar a sessão e os destinatários. Nenhuma mensagem foi enviada.");return}
 const estimated=get("cvx-bgt-rtotal")?.textContent||"Não calculado";
 const confirmText="ENVIAR "+tasks.length;
 const confirmation=window.prompt("COMVERXA — ENVIO REAL POR QR\n\n"+tasks.length+" mensagens para contatos com consentimento registrado, pela linha "+slot+".\nOrçamento exibido: "+estimated+".\n\nVocê confirma que tem autorização para contato e aceita os riscos operacionais do WhatsApp por QR? Digite "+confirmText+" para iniciar. Sem confirmação nada será enviado.");
 if(confirmation!==confirmText){msg("Envio cancelado. Nenhuma mensagem foi disparada.");return}
 sending=true;stopRequested=false;render();
 let accepted=0,failed=0;
 try{
  for(const q of tasks){
   if(stopRequested)break;
   if(Number(get("cvx-qa-line").value)!==slot){stopRequested=true;msg("Linha de envio alterada; campanha interrompida.");break}
   const currentLead=crmLeads().find(l=>leadId(l)===q.id);
   if(!currentLead||!eligible(currentLead)||leadLine(currentLead)!==slot||phone(currentLead)!==q.phone){stopRequested=true;msg("Pausa de segurança: os dados ou a autorização do destinatário foram alterados.");break}
   // Revalidate server opt-in/tenant-scoped lead before every attempted message.
   let snapshot;
   try{snapshot=await window.api("/api/leads")}catch{stopRequested=true;msg("Consulta de autorização falhou; envios futuros interrompidos.");break}
   const remote=(snapshot?.items||[]).find(l=>leadId(l)===q.id);
   if(!remote||!eligible(remote)||leadLine(remote)!==slot||phone(remote)!==q.phone){stopRequested=true;msg("Autorização ou linha do contato mudou. Envio interrompido.");break}
   let message;
   try{message=typeof window.__cvxBroadcastMessage==="function"?window.__cvxBroadcastMessage(q.name):template.replaceAll("{nome}",q.name)}catch{stopRequested=true;msg("Link opcional inválido; campanha interrompida.");break}
   if(message.length>4000){stopRequested=true;msg("Mensagem mais link ultrapassam 4.000 caracteres; campanha interrompida.");break}
   attemptedIds.add(q.id);attemptedPhones.add(q.phone);
   q.deliveryStatus="uncertain";render();
   try{
    await window.api("/api/inbox/"+encodeURIComponent(q.id)+"/send","POST",{type:"text",message,template:""});
    q.deliveryStatus="accepted";accepted++;render();
    msg("Servidor confirmou "+accepted+" solicitações; não significa entrega no WhatsApp. "+(tasks.length-accepted)+" solicitações ainda não confirmadas neste lote.");
   }catch{
    failed++;stopRequested=true;render();
    msg("O servidor não confirmou o envio. Resultado incerto: por segurança, a campanha foi interrompida. Verifique a conversa antes de tentar novamente.");
    break;
   }
   if(!stopRequested&&tasks.indexOf(q)<tasks.length-1){
    await new Promise(resolve=>setTimeout(resolve,2200));
   }
  }
 }finally{
  sending=false;render();
  if(!failed&&!stopRequested)msg("Lote concluído: "+accepted+" mensagens aceitas pelo servidor para processamento; entrega e leitura precisam ser conferidas nas conversas. Não houve débito de saldo pelo simulador.");
  if(stopRequested&&!failed)msg("Envio interrompido pelo operador ou por validação de segurança. "+accepted+" solicitações foram aceitas pelo servidor. Confira as conversas antes de continuar.");
 }
}

function start(){
 if(get(ID))return;
 const parent=get("cvx-budget-contacts"),after=get("cvx-bc-preview");
 if(!parent||!after)return false;
 const styles=document.createElement("style");styles.id=ID+"-css";styles.textContent=css;document.head.append(styles);
 const box=document.createElement("section");box.id=ID;box.innerHTML=html;after.after(box);
 get("cvx-qa-line").addEventListener("focus",linePicker);
 get("cvx-budget-contacts").addEventListener("toggle",linePicker);
 get("cvx-qa-build").addEventListener("click",build);
 get("cvx-qa-review").addEventListener("click",()=>{const details=get("cvx-budget-contacts");if(details){details.open=true;details.scrollIntoView({block:"start",behavior:"smooth"});} });
 get("cvx-qa-next").addEventListener("click",next);
 get("cvx-qa-reset").addEventListener("click",reset);
 get("cvx-qa-send").addEventListener("click",sendBatch);
 get("cvx-qa-stop").addEventListener("click",()=>{stopRequested=true;msg("Pausa solicitada. A mensagem atualmente em trânsito pode ser concluída; não serão iniciados novos destinatários.")});
 linePicker();render();return true;
}
function boot(){if(start())return;const observer=new MutationObserver(()=>{if(start())observer.disconnect()});observer.observe(document.body,{childList:true,subtree:true})}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();