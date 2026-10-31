// COMVERXA Premium — isolated pilot UI; ONLY communicates with same-origin, authenticated endpoints.
let csrf="",currentUser=null,period=new Date().toISOString().slice(0,7),currentView="dashboard";
const $=id=>document.getElementById(id);
const brl=value=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format((Number(value)||0)/100);
const n=v=>new Intl.NumberFormat("pt-BR",{maximumFractionDigits:1}).format(Number(v)||0);
const cents=v=>{
 const x=Number(v);
 if(!Number.isFinite(x)||x<0||x>1e8)throw Error("Informe um valor válido");
 return Math.round(x*100);
};
const basis=v=>{
 const x=Number(v);
 if(!Number.isFinite(x)||x<0||x>100)throw Error("Taxa deve estar entre 0 e 100");
 return Math.round(x*100);
};
function isEnterpriseLeader(){
 return currentUser?.productMode!=="individual"&&["master","admin","director","manager","supervisor"].includes(currentUser?.role);
}
function experienceLabel(){
 if(currentUser?.productMode==="individual"||currentUser?.role==="operator")
  return currentUser?.professionalType==="executive"?"Dashboard do executivo":"Dashboard do corretor";
 return {supervisor:"Dashboard de supervisão",manager:"Dashboard gerencial",director:"Dashboard da diretoria",master:"Dashboard empresarial",admin:"Dashboard empresarial"}[currentUser?.role]||"Dashboard Comercial";
}
function experienceScope(){
 if(currentUser?.productMode==="individual"||currentUser?.role==="operator")return "Minha carteira";
 return currentUser?.role==="supervisor"?"Minha equipe":currentUser?.role==="director"?"Visão da diretoria":"Visão da empresa";
}
const statusMap={lead:"Lead",negotiation:"Negociação",proposal:"Proposta",sold:"Vendido",active:"Ativo",lost:"Perdido",canceled:"Cancelado"};
function notify(msg,error=false){const t=$("toast");t.textContent=msg;t.style.background=error?"#752c42":"#285066";t.hidden=false;setTimeout(()=>{t.hidden=true},5500)}
async function call(path,{method="GET",body}={}){
 const headers={accept:"application/json"};if(body!==undefined){headers["content-type"]="application/json";headers["x-csrf-token"]=csrf}
 const r=await fetch(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:"same-origin",cache:"no-store"});
 if(r.status===401){location.assign("/login");throw Error("Sessão expirada")}
 const contentType=r.headers.get("content-type")||"";
 const v=contentType.includes("json")?await r.json():{error:"Resposta inesperada"};
 if(!r.ok)throw Error(v.error==="Invalid request"?"Verifique os campos e regras informadas":v.error==="Forbidden"?"Ação não permitida para este usuário":v.error==="Not found"?"Registro não encontrado":"Falha: "+(v.error||r.status));
 return v;
}
function textEl(tag,value){const el=document.createElement(tag);el.textContent=value;return el}
function empty(el){el.replaceChildren()}
function row(el,values){const tr=document.createElement("tr");for(const value of values){const td=document.createElement("td");td.textContent=String(value??"");tr.append(td)}el.append(tr)}
function card(el,label,value,description=""){
 const box=document.createElement("div");box.className="card";
 const a=textEl("div",label);a.className="k-label";
 const b=textEl("div",value);b.className="k-value";
 const d=textEl("div",description);d.className="note";
 box.append(a,b,d);el.append(box);
}
function show(view){
 currentView=view;
 document.querySelectorAll(".view").forEach(p=>p.classList.toggle("active",p.id===view));
 document.querySelectorAll("#nav [data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
 $("sidebar").classList.remove("open");$("overlay").classList.remove("open");
 refresh().catch(e=>notify(e.message,true));
}
function contextMonth(){const asOf=new Date().toISOString().slice(0,10);return "?month="+encodeURIComponent(period)+"&asOf="+asOf}

function cvxTile(root,label,value,detail="",tone=""){
 const el=document.createElement("div");el.className="cvx-tile "+tone;
 const l=document.createElement("small");l.textContent=label;
 const v=document.createElement("strong");v.textContent=value;
 const d=document.createElement("span");d.textContent=detail;
 el.append(l,v,d);root.append(el);
}
function cvxBar(root,label,count,max){
 const el=document.createElement("div");el.className="cvx-barrow";
 const name=textEl("span",label),track=document.createElement("div"),fill=document.createElement("div"),val=textEl("b",n(count));
 track.className="cvx-track";fill.className="cvx-fill";
 fill.style.width=Math.max(0,Math.min(100,(Number(count)||0)/Math.max(1,max)*100))+"%";
 track.append(fill);el.append(name,track,val);root.append(el);
}
function cvxMessage(root,message){
 root.replaceChildren(textEl("p",message));root.firstChild.className="cvx-empty";
}

/**
 * Histórico de produção sem depender de regras de comissão.
 * A API /sales já aplica escopo de empresa e de vendedor no servidor.
 * Não representa pagamentos recebidos nem eventos do CRM principal.
 */
async function renderSalesHistory(showUnconfiguredRanking=false){
 const host=$("cvxDailySales");if(!host)return;
 empty(host);
 try{
  const response=await call("/api/commercial/sales?month="+encodeURIComponent(period));
  const sales=Array.isArray(response.sales)?response.sales:[];
  const [year,month]=period.split("-").map(Number);
  const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
  const perDay=Array(daysInMonth).fill(0),bySeller=new Map();
  let sold=0,lost=0,negotiating=0,proposals=0,valueCents=0;
  for(const item of sales){
   if(typeof item.soldAt!=="string"||!item.soldAt.startsWith(period+"-"))continue;
   const day=Number(item.soldAt.slice(8,10));
   if(!Number.isInteger(day)||day<1||day>daysInMonth)continue;
   if(item.status==="lost")lost++;
   if(item.status==="negotiation")negotiating++;
   if(item.status==="proposal")proposals++;
   if(item.status!=="sold"&&item.status!=="active")continue;
   sold++;perDay[day-1]++;
   const amount=(Number(item.premiumCents)||0)+(Number(item.activationCents)||0)+(Number(item.recurringCents)||0);
   valueCents+=amount;
   const id=String(item.sellerId||"Sem responsável");
   const entry=bySeller.get(id)||{id,sales:0,amountCents:0};
   entry.sales++;entry.amountCents+=amount;bySeller.set(id,entry);
  }
  const heading=textEl("p",n(sold)+" vendas confirmadas na competência · "+brl(valueCents)+" em valores registrados (não necessariamente recebidos).");
  heading.className="cvx-chart-foot";host.append(heading);
  const graph=document.createElement("div");graph.className="cvx-daily-chart";
  graph.setAttribute("role","img");
  graph.setAttribute("aria-label","Vendas confirmadas por dia do mês "+period);
  const maximum=Math.max(1,...perDay);
  for(let index=0;index<perDay.length;index++){
   const count=perDay[index],day=document.createElement("div");
   day.className="cvx-day";
   day.title=String(index+1).padStart(2,"0")+"/"+String(month).padStart(2,"0")+": "+n(count)+" vendas";
   const quantity=textEl("strong",count?String(count):"·");
   const track=document.createElement("div");track.className="cvx-day-track";
   const fill=document.createElement("div");fill.className="cvx-day-fill";
   fill.style.height=(count?Math.max(5,count/maximum*100):0)+"%";
   track.append(fill);
   day.append(quantity,track,textEl("small",String(index+1).padStart(2,"0")));
   graph.append(day);
  }
  host.append(graph);
  const note=textEl("p","Datas e valores obtidos dos registros de vendas deste perfil no COMVERXA Comercial.");
  note.className="cvx-chart-foot";host.append(note);
  if(showUnconfiguredRanking){
   const kpis=$("cvxKpis");
   cvxTile(kpis,"Vendas confirmadas",n(sold),"Sem depender da configuração de comissão","cyan");
   cvxTile(kpis,"Valor de vendas registrado",brl(valueCents),"Valor comercial; não representa recebimento");
   cvxTile(kpis,"Em negociação",n(negotiating),"Registros comerciais");
   cvxTile(kpis,"Propostas",n(proposals),"Registros comerciais");
   cvxTile(kpis,"Perdas em vendas",n(lost),"Registros comerciais","gold");
   if(["admin","master","manager"].includes(currentUser.role)){
    const ranking=$("cvxRanking");empty(ranking);
    const ordered=[...bySeller.values()].sort((a,b)=>b.sales-a.sales||b.amountCents-a.amountCents||a.id.localeCompare(b.id));
    ranking.append(textEl("p","Ranking por vendas confirmadas, sem cálculo de comissões."));
    for(const [index,seller] of ordered.slice(0,12).entries()){
     const line=document.createElement("div");line.className="cvx-rank";
     line.append(textEl("span",String(index+1)),textEl("span",seller.id),textEl("strong",n(seller.sales)+" vendas"));
     const track=document.createElement("div");track.className="cvx-track";
     const fill=document.createElement("div");fill.className="cvx-fill";
     fill.style.width=Math.min(100,100*seller.sales/Math.max(1,sold))+"%";
     track.append(fill);line.append(track);ranking.append(line);
    }
    if(!ordered.length)ranking.append(textEl("p","Ainda não há vendas confirmadas para esta equipe no período."));
   }
  }
 }catch(error){
  cvxMessage(host,"Histórico diário indisponível: "+error.message);
 }
}

async function renderPremiumDashboard(data){
 if(!$("cvxKpis"))return;
 const enterprise=isEnterpriseLeader();
 $("cvxEnterprise").hidden=!enterprise;
 $("cvxHeading").textContent=experienceLabel();
 $("cvxSubheading").textContent=enterprise?"Gestão da equipe, metas e resultados por competência.":"Suas vendas, metas, comissões e oportunidades.";
 $("cvxModeLabel").textContent=experienceScope();
 $("cvxFeedback").textContent="Dados do período: "+period+" · Atualizados a partir dos registros do Comercial.";
 const k=$("cvxKpis");empty(k);
 const sold=Number(data.counts?.sold||0),goal=Number(data.target?.nextMinSales??data.target?.achievedMinSales??0),remaining=Number(data.target?.remaining||0);
 cvxTile(k,"Meta do período",n(goal)+" vendas","Faixa progressiva de remuneração");
 cvxTile(k,"Realizado",n(sold)+" vendas","Vendas confirmadas","cyan");
 cvxTile(k,"Faltam",n(remaining)+" vendas","Para atingir a próxima faixa");
 cvxTile(k,"Atingimento",n(data.target?.completionPct||0)+"%","Da meta aplicável","gold");
 cvxTile(k,"Receita comercial",brl(data.revenueCents),"Valores registrados");
 cvxTile(k,"Comissões efetivas",brl(data.commissions?.effectiveCents),"Sujeitas às regras comerciais","cyan");
 const pace=$("cvxPace");empty(pace);
 cvxTile(pace,"Dias úteis restantes",n(data.workdays?.remaining??0),"Conforme calendário do CRM");
 cvxTile(pace,"Média por dia",n(data.pace?.averageDaily??0),"Vendas por dia útil");
 cvxTile(pace,"Projeção",n(data.pace?.projectedSales??0)+" vendas","Estimativa, não garantia");
 cvxTile(pace,"Ritmo necessário",n(data.pace?.requiredDaily??0),"Vendas por dia útil","gold");
 const chart=$("cvxGoalChart");empty(chart);
 const bar=document.createElement("div");bar.className="cvx-goalbar";const fill=document.createElement("div");
 fill.style.width=Math.min(100,Math.max(0,Number(data.target?.completionPct)||0))+"%";bar.append(fill);chart.append(bar);
 chart.append(textEl("p",n(sold)+" vendas confirmadas · Próxima meta: "+n(goal)+" vendas."));
 const line=textEl("p","Projeção no período: "+n(data.pace?.projectedSales??0)+" vendas. Dados sem histórico diário não são apresentados como série temporal.");
 line.className="cvx-chart-foot";chart.append(line);
 const funnel=$("cvxFunnel");empty(funnel);
 try{
  const d=await call("/api/commercial/leads/summary");
  const stages=[["lead","Lead"],["contacted","Contato"],["negotiation","Negociação"],["proposal","Proposta"],["won","Fechamento"],["lost","Perdas"]];
  const maximum=Math.max(1,...Object.values(d.byStage||{}).map(Number).filter(Number.isFinite));
  for(const [key,label] of stages)cvxBar(funnel,label,Number(d.byStage?.[key]||0),maximum);
  funnel.append(textEl("p","Etapas representam a posição atual dos leads, não necessariamente a conversão histórica."));
  funnel.lastChild.className="cvx-chart-foot";
 }catch{cvxMessage(funnel,"Funil indisponível para esta conta.");}
 const channels=$("cvxChannels");empty(channels);
 try{
  const result=await call("/api/wa/channels");
  for(const c of result.channels||[]){
   const line=document.createElement("div");line.className="cvx-rank";
   line.append(textEl("span",String(c.slot||"")),textEl("span",c.slot===1?"QR Code / Evolution":"Meta API"),textEl("strong",String(c.state||"não configurado")));
   channels.append(line);
  }
  if(!channels.children.length)cvxMessage(channels,"Nenhum canal cadastrado.");
 }catch{cvxMessage(channels,"Estado dos canais indisponível.");}
 const insights=$("cvxInsights");empty(insights);insights.className="cvx-list";
 const notices=[];
 if(remaining>0)notices.push("Para a próxima meta faltam "+n(remaining)+" vendas.");
 if(Number(data.pace?.requiredDaily)>Number(data.pace?.averageDaily))notices.push("O ritmo necessário está acima da média atual.");
 if(Number(data.commissions?.retainedCents)>0)notices.push("Existem comissões retidas no total de "+brl(data.commissions.retainedCents)+".");
 if(!notices.length)notices.push("Acompanhe o funil e o fechamento da competência.");
 for(const notice of notices)insights.append(textEl("div",notice));
 if(enterprise){
  const rank=$("cvxRanking"),finance=$("cvxFinance");empty(rank);empty(finance);
  try{
   const team=await call("/api/commercial/team"+contextMonth());
   const total=Number(team.totals?.sales||0),teamGoal=team.teamGoal?.targetSales;
   const summary=document.createElement("p");summary.textContent="Vendas da equipe: "+n(total)+" · Meta coletiva: "+(teamGoal==null?"não definida":n(teamGoal));rank.append(summary);
   for(const [index,seller] of (team.rows||[]).slice(0,12).entries()){
    const line=document.createElement("div");line.className="cvx-rank";
    line.append(textEl("span",String(index+1)),textEl("span",String(seller.sellerId||"Consultor")),textEl("strong",n(seller.sales)+" vendas"));
    const track=document.createElement("div");track.className="cvx-track";const fill=document.createElement("div");fill.className="cvx-fill";
    fill.style.width=Math.max(0,Math.min(100,(Number(seller.sales)||0)/Math.max(1,total)*100))+"%";
    track.append(fill);line.append(track);rank.append(line);
   }
   if(!(team.rows||[]).length)rank.append(textEl("p","Sem produção registrada para a equipe neste período."));
   const tiles=document.createElement("div");tiles.className="cvx-kpis";finance.append(tiles);
   cvxTile(tiles,"Receita da equipe",brl(team.totals?.amountCents),"Valor contabilizado");
   cvxTile(tiles,"Comissões efetivas",brl(team.totals?.effectiveCommissionCents),"Equipe");
   cvxTile(tiles,"Comissões retidas",brl(team.totals?.retainedCommissionCents),"Acompanhar liberação","gold");
  }catch{cvxMessage(rank,"Dados de equipe indisponíveis.");cvxMessage(finance,"Financeiro indisponível.");}
 }
}

async function loadDashboard(){
 const status=await call("/api/commercial/configuration-status");
 $("cvxExport").disabled=!status.configured;
 if(!status.configured){
  const message=status.canConfigure
   ?"Metas e comissões ainda não foram configuradas. Abra Metas e Comissão para definir as regras da empresa."
   :"As regras comerciais da sua empresa ainda não foram configuradas. Solicite a configuração ao gestor.";
  const enterprise=isEnterpriseLeader();
  $("cvxHeading").textContent=experienceLabel();
  $("cvxSubheading").textContent="Configuração comercial pendente";
  $("cvxModeLabel").textContent=experienceScope();
  $("cvxEnterprise").hidden=!enterprise;
  $("cvxFeedback").textContent=message;
  for(const id of ["metrics","pace","earnings","cvxKpis","cvxPace","cvxGoalChart","cvxFunnel","cvxRanking","cvxFinance","cvxChannels","cvxInsights"]){
   const node=$(id);if(node)empty(node);
  }
  $("progress").style.width="0%";
  $("progressText").textContent="Nenhuma meta cadastrada. Indicadores financeiros não serão calculados até a configuração.";
  const holder=$("cvxGoalChart");
  if(status.canConfigure){
   const button=document.createElement("button");button.type="button";button.className="btn primary";
   button.textContent="Configurar metas e comissões";
   button.addEventListener("click",()=>show("goals"));holder.append(button);
  }else{
   holder.append(textEl("p","Aguarde a configuração das regras comerciais pelo gestor da empresa."));
  }
  // CRM lead and channel activity remains real and useful before financial rules are set.
  const kpis=$("cvxKpis"),funnel=$("cvxFunnel"),channels=$("cvxChannels"),insights=$("cvxInsights");
  try{
   const data=await call("/api/commercial/leads/summary");
   cvxTile(kpis,"Leads cadastrados",n(data.total),"Visíveis para seu perfil","cyan");
   cvxTile(kpis,"Follow-ups vencidos",n(data.followupsOverdue),"Contatos com retorno em atraso","gold");
   cvxTile(kpis,"Leads quentes",n(data.byTemperature?.hot||0),"Classificação atual");
   cvxTile(kpis,"Leads perdidos",n(data.byStage?.lost||0),"Histórico do funil");
   const stages=[["lead","Lead"],["contacted","Contato"],["negotiation","Negociação"],["proposal","Proposta"],["won","Fechamento"],["lost","Perdas"]];
   const maximum=Math.max(1,...Object.values(data.byStage||{}).map(Number).filter(Number.isFinite));
   for(const [key,label] of stages)cvxBar(funnel,label,Number(data.byStage?.[key]||0),maximum);
   funnel.append(textEl("p","Indicadores de oportunidades; metas e comissões ainda não foram configuradas."));
   funnel.lastChild.className="cvx-chart-foot";
   if(data.total>=data.limitedTo)insights.append(textEl("div","A análise considera até "+n(data.limitedTo)+" leads; utilize os filtros do CRM para consultar mais."));
  }catch{
   cvxMessage(funnel,"Não foi possível consultar o funil neste momento.");
  }
  try{
   const data=await call("/api/wa/channels");
   for(const channel of data.channels||[]){
    const line=document.createElement("div");line.className="cvx-rank";
    line.append(textEl("span",String(channel.slot||"")),textEl("span",channel.slot===1?"QR Code / Evolution":"Meta API"),textEl("strong",String(channel.state||"não configurado")));
    channels.append(line);
   }
   if(!channels.children.length)cvxMessage(channels,"Nenhum canal conectado.");
  }catch{
   cvxMessage(channels,"Status dos canais indisponível.");
  }
  if(enterprise){
   cvxMessage($("cvxRanking"),"O ranking de vendas será exibido após a configuração de metas.");
   cvxMessage($("cvxFinance"),"Comissões e valores financeiros ainda não foram configurados.");
  }
  await renderSalesHistory(true);
  return;
 }
 const data=await call("/api/commercial/summary"+contextMonth());
 const m=$("metrics");empty(m);
 card(m,"Vendas",n(data.counts.sold),"Confirmadas na competência");
 card(m,"Meta atual",n(data.target.nextMinSales??data.target.achievedMinSales??0),"Faixa progressiva");
 card(m,"Faltam",n(data.target.remaining),"Para o próximo nível");
 card(m,"Atingimento",n(data.target.completionPct)+"%","Evolução da meta");
 $("progress").style.width=Math.min(100,data.target.completionPct)+"%";
 $("progressText").textContent="Meta conquistada: "+brl(data.target.achievedBonusCents)+". Próximo bônus potencial: "+brl(data.target.nextBonusCents)+".";
 const pace=$("pace");empty(pace);
 card(pace,"Dias úteis restantes",n(data.workdays.remaining));
 card(pace,"Média diária",n(data.pace.averageDaily));
 card(pace,"Ritmo necessário",n(data.pace.requiredDaily));
 card(pace,"Projeção",n(data.pace.projectedSales)+" vendas");
 const earnings=$("earnings");empty(earnings);
 earnings.append(textEl("p","Comissão efetiva: "+brl(data.commissions.effectiveCents)));
 earnings.append(textEl("p","Comissão retida: "+brl(data.commissions.retainedCents)));
 earnings.append(textEl("p","Receita comercial: "+brl(data.revenueCents)));
 if(data.earnings.totalCents!==null)earnings.append(textEl("p","Ganho previsto (operador): "+brl(data.earnings.totalCents)));
 await loadDashboardInsights();
 await renderPremiumDashboard(data);
 await renderSalesHistory();
}
async function loadDashboardInsights(){
 const funnel=$("dashFunnel"),wa=$("dashWa");
 if(!funnel||!wa)return;
 empty(funnel);empty(wa);
 try{
  const d=await call("/api/commercial/leads/summary");
  const stages=[["lead","Leads"],["contacted","Contato"],["negotiation","Negociação"],["proposal","Proposta"],["won","Vendas"],["lost","Perdas"]];
  const max=Math.max(1,...Object.values(d.byStage||{}));
  for(const [key,title] of stages){
   const item=document.createElement("div");item.className="dash-funnel-item";
   const label=document.createElement("span");label.textContent=title;
   const track=document.createElement("div");track.className="dash-funnel-track";
   const fill=document.createElement("div");fill.style.width=Math.round((d.byStage[key]||0)/max*100)+"%";
   track.append(fill);const number=textEl("strong",n(d.byStage[key]||0));
   item.append(label,track,number);funnel.append(item);
  }
 }catch{funnel.append(textEl("p","Configure o funil para visualizar resultados."))}
 try{
  const d=await call("/api/wa/channels");
  for(const channel of d.channels||[]){
   const item=document.createElement("div");item.className="dash-wa-item";
   const title=textEl("span",channel.slot===1?"WhatsApp 1 · QR":"WhatsApp 2 · Meta");
   const state=textEl("strong",(waStates[channel.state]||waStates.unknown)[0]);
   state.dataset.kind=(waStates[channel.state]||waStates.unknown)[1];
   item.append(title,state);wa.append(item);
  }
 }catch{wa.append(textEl("p","Não foi possível consultar os canais."))}
}
const leadStages={lead:"Lead",contacted:"Contatado",negotiation:"Negociação",proposal:"Proposta",won:"Venda",lost:"Perdido",on_hold:"Em espera"};
async function loadLeads(){
 const ddd=$("leadDddFilter").value.trim(),stage=$("leadStageFilter").value;
 const params=new URLSearchParams();if(ddd)params.set("ddd",ddd);if(stage)params.set("stage",stage);
 const [result,summary]=await Promise.all([
  call("/api/commercial/leads?"+params.toString()),
  call("/api/commercial/leads/summary")
 ]);
 const cards=$("leadMetrics");empty(cards);
 card(cards,"Leads",n(summary.total),"Até 500 registros na apuração");
 card(cards,"Quentes",n(summary.byTemperature.hot),"Prioridade comercial");
 card(cards,"Follow-ups pendentes",n(summary.followupsDue),"Tarefas com data vencida ou hoje");
 card(cards,"Conversão",n(summary.conversionPct)+"%","Vendas / (vendas + perdas)");
 const tbody=$("leadTable");empty(tbody);
 for(const lead of result.leads){
  const tr=document.createElement("tr");
  for(const value of [lead.name,lead.source+" / "+(lead.ddd||"—"),lead.temperature,
   leadStages[lead.stage],lead.nextFollowup||"—"]){
   tr.append(textEl("td",value));
  }
  const td=document.createElement("td");
  const select=document.createElement("select");select.setAttribute("aria-label","Etapa do lead "+lead.name);
  for(const [value,label] of Object.entries(leadStages)){
   const option=document.createElement("option");option.value=value;option.textContent=label;
   if(value===lead.stage)option.selected=true;
   select.append(option);
  }
  select.dataset.id=lead.id;select.dataset.version=String(lead.version);
  const save=textEl("button","Salvar etapa");save.className="btn";save.type="button";
  save.dataset.action="stage";save.dataset.id=lead.id;
  const activity=textEl("button","Contato");activity.className="btn";activity.type="button";
  activity.dataset.action="activity";activity.dataset.id=lead.id;
  td.append(select,save,activity);tr.append(td);tbody.append(tr);
 }
 if(!result.leads.length)row(tbody,["Nenhum lead para os filtros selecionados"]);
}
const waStates={
 connected:["Conectado","online"],verified:["Credenciais verificadas","online"],
 validated:["Identidade Meta validada","online"],waiting_scan:["Aguardando leitura","pending"],
 waiting_qr:["Aguardando QR Code","pending"],pending:["Aguardando conexão","pending"],
 connecting:["Conectando","pending"],unavailable:["Provedor indisponível","offline"],
 disconnected:["Desconectado","offline"],provider_missing:["Credenciais do provedor pendentes","offline"],
 not_configured:["Não configurado","offline"],unknown:["Estado não confirmado","offline"]
};
const waUserCanConfigure=()=>["master","admin","manager"].includes(currentUser?.role);
function showWaState(id,state){
 const el=$(id),data=waStates[state]||waStates.unknown;
 el.textContent=data[0];el.dataset.kind=data[1];
}
async function loadWhatsApp(){
 const status=$("waGlobalStatus");
 status.textContent="Consultando os dois canais autorizados...";
 try{
  const data=await call("/api/wa/channels");
  const items=data.channels||[];
  if(items.length!==2||items[0].slot!==1||items[1].slot!==2)throw Error("Configuração inesperada de canais");
  const qr=items[0],official=items[1];
  showWaState("waQrState",qr.state);showWaState("waMetaState",official.state);
  $("waQrNumber").textContent=qr.displayNumber||"Linha 01";
  $("waMetaNumber").textContent=official.displayNumber||"Linha 02";
  const active=items.filter(i=>["connected","verified"].includes(i.state)).length;
  const qrReady=data.providerConfigured?.qr===true,metaReady=data.providerConfigured?.official===true;
  status.textContent="2 canais definidos · "+active+" verificado(s) pelo provedor · Sincronização depende dos webhooks e conexão ativa.";
  if(!qrReady||!metaReady)status.textContent+=" · Provedor(es) pendente(s): "+[!qrReady?"QR / Evolution":null,!metaReady?"Meta oficial":null].filter(Boolean).join(", ")+".";
  $("waQrConnect").disabled=!waUserCanConfigure()||!qrReady||qr.state==="provider_missing";
  $("waMetaForm").querySelectorAll("input,button[type=submit]").forEach(el=>el.disabled=!waUserCanConfigure()||!metaReady);
  $("waMetaWebhook").disabled=!waUserCanConfigure()||!metaReady||!official.configured;
  $("waQrInfo").textContent=!qrReady?"O administrador precisa configurar a URL e a chave da Evolution API no servidor.":qr.configured?"Use Atualizar para consultar a conexão. O QR Code só é exibido quando o provedor o disponibiliza.":"Uma única sessão QR por empresa.";
  $("waMetaInfo").textContent=!metaReady?"A integração Meta está pendente no servidor. O administrador deve configurar CVX_WA_META_APP_SECRET no Railway, sem divulgar o segredo no chat ou navegador.":official.configured?"Número validado. A configuração do webhook da Meta é necessária para sincronização de mensagens.":"Conecte uma única conta oficial Meta por empresa.";
 }catch(error){status.textContent="Não foi possível consultar as conexões: "+error.message}
}
async function loadWaInbox(){
 const slot=Number($("waInboxSlot").value),tbody=$("waInboxTable");empty(tbody);
 try{
  const {messages}=await call("/api/wa/inbox?slot="+slot);
  for(const msg of messages){
   const tr=document.createElement("tr");
   for(const value of [
    slot===1?"QR · Evolution":"API Meta",msg.contact,msg.kind,
    msg.body||"Mensagem de mídia (conteúdo não armazenado)",new Date(msg.occurredAt).toLocaleString("pt-BR")
   ])tr.append(textEl("td",value));
   tbody.append(tr);
  }
  if(!messages.length)row(tbody,["Sem mensagens recebidas e validadas neste canal"]);
 }catch(error){row(tbody,["Não foi possível consultar mensagens: "+error.message])}
}
async function loadSales(){
 const d=await call("/api/commercial/sales"+contextMonth());
 const t=$("salesTable");empty(t);
 for(const s of d.sales)row(t,[s.id,s.sellerId,s.soldAt,statusMap[s.status]||s.status,brl(s.premiumCents),brl(s.activationCents),s.commissionState==="retained"?"Retida":"Liberada"]);
 if(!d.sales.length)row(t,["Sem registros nesta competência"]);
}
async function loadRules(){
 const {rules}=await call("/api/commercial/rules");
 if(!rules)return;
 const tier=rules.tiers.filter(x=>x.minSales>0).slice(0,3);
 for(let i=0;i<tier.length;i++){$("g"+(i+1)).value=tier[i].minSales;$("b"+(i+1)).value=tier[i].bonusCents/100}
 $("rateSale").value=rules.salesRateBps/100;
 $("rateActive").value=rules.activationRateBps/100;
 $("rateRecurring").value=rules.recurringRateBps/100;
 $("fixed").value=rules.fixedSalaryCents/100;
 $("teamTarget").value=rules.teamTargetSales||40;
}
async function loadTeam(){
 const data=await call("/api/commercial/team"+contextMonth());
 const m=$("teamMetrics");empty(m);
 card(m,"Vendedores",n(data.sellerCount));
 card(m,"Total de vendas",n(data.totals.sales));
 card(m,"Meta coletiva",n(data.teamGoal.targetSales??0));
 card(m,"Percentual atingido",data.teamGoal.completionPct===null?"Sem meta":n(data.teamGoal.completionPct)+"%");
 const t=$("teamTable");empty(t);
 for(const s of data.rows)row(t,[s.sellerId,n(s.sales),n(s.remainingSales),n(s.projectedSales),brl(s.effectiveCommissionCents),brl(s.retainedCommissionCents)]);
 if(!data.rows.length)row(t,["Nenhum vendedor com vendas nesta competência"]);
}
async function loadCompanies(){
 const data=await call("/api/platform/companies");
 const metrics=$("companyMetrics");empty(metrics);
 card(metrics,"Empresas",n(data.companies.length));
 card(metrics,"Ativas",n(data.companies.filter(x=>x.status==="active").length));
 card(metrics,"Suspensas",n(data.companies.filter(x=>x.status!=="active").length));
 card(metrics,"Usuários ativos",n(data.companies.reduce((a,x)=>a+x.seatsUsed,0)));
 const table=$("companyTable");empty(table);
 for(const company of data.companies){
  const tr=document.createElement("tr");
  for(const value of [company.name,company.plan,company.seatsUsed+"/"+company.seatLimit,
   company.billingMode==="sandbox"?"Simulação":"Verificar",company.status])
   tr.append(textEl("td",value));
  const td=document.createElement("td");
  if(company.id!==currentTenantId){
   const button=textEl("button",company.status==="active"?"Suspender":"Reativar");
   button.type="button";button.className="btn";button.dataset.tenant=company.id;button.dataset.status=company.status==="active"?"suspended":"active";
   td.append(button);
  }else td.textContent="Conta da plataforma";
  tr.append(td);table.append(tr);
 }
}
let currentTenantId="";
async function loadCompanyProfile(){const d=await call("/api/pilot/company");currentTenantId=d.company.id}
async function loadRenewals(){
 const d=await call("/api/commercial/renewals?asOf="+new Date().toISOString().slice(0,10));
 const s=d.summary,m=$("renewalMetrics");empty(m);
 card(m,"Vencidos",n(s.overdue));
 card(m,"Até 10 dias",n(s.within10));
 card(m,"11 a 30 dias",n(s.within30));
 card(m,"Após 30 dias",n(s.later));
 const table=$("renewalTable");empty(table);
 for(const x of d.items)row(table,[x.id,x.sellerId,x.endsOn,n(x.daysUntil),x.band]);
 if(!d.items.length)row(table,["Nenhum contrato a renovar"]);
}
async function loadOffsiteStatus(){
 const el=$("offsiteStatus");
 try{
  const data=await call("/api/pilot/backups/status");
  if(!data.offsiteConfigured){el.textContent="Armazenamento externo não configurado.";return}
  if(!data.verification){el.textContent="Armazenamento configurado. Nenhum backup validado ainda.";return}
  el.textContent="Último backup restaurado e verificado: "+new Date(data.verification.verifiedAt).toLocaleString("pt-BR")+" · "+Math.round(data.verification.sizeBytes/1024)+" KB cifrados.";
 }catch(err){el.textContent="Falha ao consultar backup: "+err.message}
}
async function loadStripe(){
 const status=$("stripeStatus"),plans=$("stripePlans"),tbody=$("stripeTable");empty(plans);empty(tbody);
 try{
  const data=await call("/api/billing/stripe/status");
  const catalog=data.catalog||{};
  status.textContent=data.checkoutEnabled
   ?"Stripe em modo TESTE. Os links a seguir simulam uma assinatura, sem movimentar dinheiro real."
   :"Tabela comercial cadastrada no Stripe TESTE. Checkout indisponível enquanto as credenciais e o webhook não forem homologados.";
  const names={starter:"Starter",professional:"Professional",business:"Business"};
  for(const [plan,title] of Object.entries(names)){
   const price=catalog[plan];
   const wrapper=document.createElement("div");wrapper.className="card";wrapper.style.padding="16px";
   wrapper.append(textEl("h3",title));
   if(price){
    const priceLabel=textEl("p",brl(price.monthlyCents)+" / mês");priceLabel.className="k-value";priceLabel.style.fontSize="22px";
    const annual=textEl("p",brl(price.annualCents)+" / ano · economia de "+brl(price.annualSavingsCents));
    annual.className="note";
    const seats=textEl("p","Inclui "+price.seats+(price.seats===1?" usuário":" usuários")+" no plano.");seats.className="note";
    wrapper.append(priceLabel,annual,seats);
   }
   const cycles=[["monthly","Mensal"],["annual","Anual"]];
   for(const [cycle,label] of cycles){
    const button=textEl("button","Contratar "+label+" (teste)");button.className="btn";button.type="button";
    button.dataset.stripePlan=plan;button.dataset.stripeCycle=cycle;
    button.style.marginTop="7px";button.style.width="100%";
    button.disabled=!data.checkoutEnabled||!(data.availableCycles?.[plan]||[]).includes(cycle)
       ||currentUser.role==="operator"||currentUser.role==="manager"||currentUser.role==="master";
    wrapper.append(button);
   }
   plans.append(wrapper);
  }
  if(!data.subscriptions?.length){row(tbody,["Nenhuma assinatura de teste registrada"])}
  for(const subscription of data.subscriptions){
   row(tbody,[names[subscription.plan]||subscription.plan,
    (subscription.cycle==="annual"?"Anual":"Mensal")+" · "+subscription.status,
    subscription.entitlement,subscription.updatedAt?new Date(subscription.updatedAt).toLocaleString("pt-BR"):"—"]);
  }
 }catch(err){status.textContent="Falha ao consultar tabela de planos: "+err.message}
}
async function loadUsers(){
 const d=await call("/api/pilot/users");
 const tbody=$("usersTable"),options=$("sellerOptions");empty(tbody);empty(options);
 for(const u of d.users){
  row(tbody,[u.email,u.role,u.id]);
  const opt=document.createElement("option");opt.value=u.id;opt.label=u.email+" — "+u.role;options.append(opt);
 }
}
async function refresh(){
 const base=contextMonth();
 $("printReport").href="/api/commercial/report/print"+base;
 $("exportCsv").href="/api/commercial/report.csv"+base;
 if(currentView==="dashboard")return loadDashboard();
 if(currentView==="sales")return loadSales();
 if(currentView==="whatsapp")return loadWhatsApp();
 if(currentView==="leads")return loadLeads();
 if(currentView==="goals")return loadRules();
 if(currentView==="team")return loadTeam();
 if(currentView==="renewals")return loadRenewals();
 if(currentView==="companies")return loadCompanies();
 if(currentView==="billing")return loadStripe();
 if(currentView==="users"){await loadUsers();if(["admin","master"].includes(currentUser.role))await loadOffsiteStatus();return}
}
function bindForm(id,endpoint,transform,after){
 $(id).addEventListener("submit",async e=>{
  e.preventDefault();const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;
  try{
   const values=Object.fromEntries(new FormData(e.currentTarget).entries());
   await call(endpoint,{method:"POST",body:transform(values)});
   notify("Registro salvo com sucesso no piloto");if(after)await after();
   await refresh();
  }catch(err){notify(err.message,true)}finally{btn.disabled=false}
 });
}
async function init(){
 const me=await call("/api/auth/me");csrf=me.csrf;currentUser=me.user;
 const individual=currentUser.productMode==="individual";
 document.body.dataset.product=individual?"individual":"enterprise";
 const brand=document.querySelector(".brand small");
 if(brand)brand.textContent=individual?"PROFESSIONAL · INDIVIDUAL":"ENTERPRISE · EMPRESAS";
 const heading=document.querySelector("header .toolbar strong");
 if(heading)heading.textContent=individual?"COMVERXA / Professional":"COMVERXA / Enterprise";
 const note=document.querySelector("#sidebar .foot");
 if(note&&individual)note.textContent="Carteira exclusiva do profissional. WhatsApp depende de conexão validada.";
 if(note&&!individual)note.textContent="Permissões e indicadores por cargo na empresa. Integrações dependem de validação.";
 $("cvxRefresh").addEventListener("click",()=>loadDashboard().catch(e=>notify(e.message,true)));
 $("cvxExport").addEventListener("click",()=>{window.open("/api/commercial/report/print"+contextMonth(),"_blank","noopener,noreferrer")});
 $("period").value=period;
 $("saleSeller").value=currentUser.id;$("policySeller").value=currentUser.id;$("leadSeller").value=currentUser.id;
 if(currentUser.role==="operator"||individual){
  document.querySelectorAll('#nav [data-view="team"],#nav [data-view="users"],#nav [data-view="companies"]').forEach(b=>b.hidden=true);
  if(currentUser.role==="operator")$("rulesForm").querySelectorAll("input,button").forEach(el=>el.disabled=true);
  $("saleSeller").readOnly=true;$("policySeller").readOnly=true;$("leadSeller").readOnly=true;
  $("printReport").hidden=false;
 }
 if(currentUser.role==="supervisor"){
  document.querySelectorAll('#nav [data-view="goals"],#nav [data-view="users"],#nav [data-view="billing"]').forEach(el=>el.hidden=true);
  $("sellerGoalForm").querySelectorAll("input,button").forEach(el=>el.disabled=true);
 }
 if(!["admin","master","director"].includes(currentUser.role)||individual){document.querySelectorAll('#nav [data-view="users"]').forEach(el=>{el.hidden=true})}
 if(!["admin","master","director"].includes(currentUser.role)||individual){$("offsiteBackupPanel").hidden=true}
 if(currentUser.role==="master"){document.querySelectorAll('#nav [data-view="companies"]').forEach(el=>{el.hidden=false})}
 if(!["admin","master","manager","director"].includes(currentUser.role)){document.querySelectorAll('#nav [data-view="billing"]').forEach(el=>{el.hidden=true})}
 if(!me.mustChangePassword&&!individual&&["admin","master","director"].includes(currentUser.role)){
  loadUsers().catch(e=>notify("Não foi possível carregar os usuários: "+e.message,true));
 }
 document.querySelectorAll("#nav [data-view]").forEach(b=>b.addEventListener("click",()=>show(b.dataset.view)));
 $("mobileMenu").addEventListener("click",()=>{$("sidebar").classList.toggle("open");$("overlay").classList.toggle("open")});
 $("overlay").addEventListener("click",()=>{$("sidebar").classList.remove("open");$("overlay").classList.remove("open")});
 $("period").addEventListener("change",()=>{period=$("period").value;refresh().catch(e=>notify(e.message,true))});
 $("logout").addEventListener("click",async()=>{try{await call("/api/auth/logout",{method:"POST",body:{}})}finally{location.assign("/login")}});
 $("stripePlans").addEventListener("click",async event=>{
  const button=event.target.closest("button[data-stripe-plan]");
  if(!button||button.disabled)return;
  button.disabled=true;
  try{
   const data=await call("/api/billing/stripe/checkout",{method:"POST",body:{plan:button.dataset.stripePlan,cycle:button.dataset.stripeCycle||"monthly"}});
   if(!data.testMode||!/^https:\/\/checkout\.stripe\.com\//.test(data.url))throw Error("Checkout de teste indisponível");
   location.assign(data.url);
  }catch(err){notify("Não foi possível abrir o Stripe: "+err.message,true);button.disabled=false}
 });
 if(["admin","master"].includes(currentUser.role)){
  $("runOffsiteBackup").addEventListener("click",async()=>{
   const btn=$("runOffsiteBackup");btn.disabled=true;notify("Iniciando backup criptografado e verificação de restauração.");
   try{const result=await call("/api/pilot/backups/offsite",{method:"POST",body:{}});
    if(!result.verified)throw Error("Backup não confirmado");
    await loadOffsiteStatus();notify("Backup externo verificado com sucesso.");
   }catch(err){notify("Backup não confirmado: "+err.message,true)}finally{btn.disabled=false}
  });
  $("pilotBackup").addEventListener("click",async()=>{
   const button=$("pilotBackup");button.disabled=true;
   try{
    const resp=await fetch("/api/pilot/backup",{method:"POST",credentials:"same-origin",
     headers:{"x-csrf-token":csrf,"x-cvx-backup-confirm":"EXPORTAR"},cache:"no-store"});
    if(!resp.ok)throw Error("Backup não disponível ("+resp.status+").");
    const blob=await resp.blob(),url=URL.createObjectURL(blob);
    try{const a=document.createElement("a");a.href=url;a.download="comverxa-comercial-piloto-"+new Date().toISOString().slice(0,10)+".sqlite";
      document.body.append(a);a.click();a.remove();
    }finally{setTimeout(()=>URL.revokeObjectURL(url),1500)}
    notify("Backup gerado; salve uma cópia fora do Railway.");
   }catch(error){notify(error.message,true)}finally{button.disabled=false}
  });
 }

 $("dashOpenWa").addEventListener("click",()=>show("whatsapp"));
 $("waRefresh").addEventListener("click",()=>loadWhatsApp());
 $("waQrCheck").addEventListener("click",()=>loadWhatsApp());
 $("waLoadInbox").addEventListener("click",()=>loadWaInbox());
 $("waInboxSlot").addEventListener("change",()=>loadWaInbox());
 $("waQrConnect").addEventListener("click",async event=>{
  const button=event.currentTarget;button.disabled=true;
  $("waQrPanel").hidden=true;$("waQrInfo").textContent="Solicitando QR Code ao provedor Evolution...";
  try{
   const setup=await call("/api/wa/qr/register",{method:"POST",body:{}});
   if(!setup.configured)throw Error("Evolution ainda não está configurada no servidor");
   const result=await call("/api/wa/qr/connect",{method:"POST",body:{}});
   if(result.connected){$("waQrInfo").textContent="Sessão conectada. Confira o estado da linha.";showWaState("waQrState","connected");return}
   if(result.qrDataUrl){
    const url=result.qrDataUrl;
    if(!/^data:image\/png;base64,[A-Za-z0-9+/=]{100,300000}$/.test(url))throw Error("QR recebido em formato inválido");
    $("waQrImage").src=url;$("waQrPanel").hidden=false;
    showWaState("waQrState","waiting_scan");$("waQrInfo").textContent="Escaneie o QR Code usando o WhatsApp do celular. O código é temporário.";
   }else{
    showWaState("waQrState","waiting_qr");$("waQrInfo").textContent="O provedor ainda não retornou uma imagem QR. Tente novamente após verificar a instância.";
   }
  }catch(error){$("waQrInfo").textContent="Não foi possível obter QR Code: "+error.message;notify("Falha de conexão do canal QR.",true)}
  finally{button.disabled=false}
 });
 $("waMetaForm").addEventListener("submit",async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
  const f=new FormData(form);$("waMetaInfo").textContent="Validando Phone Number ID na Meta...";
  try{
   const data=await call("/api/wa/official/register",{method:"POST",body:{
    phoneNumberId:String(f.get("phoneNumberId")||"").trim(),
    accessToken:String(f.get("accessToken")||"").trim()
   }});
   form.elements.accessToken.value="";
   $("waMetaInfo").textContent="Número "+(data.displayNumber||"")+" validado. Configure o webhook antes de considerar a sincronização ativa.";
   notify("Conexão Meta validada no servidor. Falta habilitar o webhook no painel Meta.");
   await loadWhatsApp();
  }catch(error){$("waMetaInfo").textContent="Meta ainda não validada: "+error.message}
  finally{button.disabled=false}
 });
 $("waMetaWebhook").addEventListener("click",async()=>{
  try{
   const d=await call("/api/wa/official/webhook-setup");
   $("waWebhookUrl").value=d.callbackUrl;$("waWebhookToken").value=d.verifyToken;
   $("waWebhookPanel").hidden=false;
  }catch(error){notify("Webhook indisponível: "+error.message,true)}
 });
 $("waRevealWebhook").addEventListener("click",()=>{
  const field=$("waWebhookToken");field.type=field.type==="password"?"text":"password";
  $("waRevealWebhook").textContent=field.type==="password"?"Mostrar token":"Ocultar token";
 });
 $("refreshLeads").addEventListener("click",()=>loadLeads().catch(e=>notify(e.message,true)));
 $("leadTable").addEventListener("click",async event=>{
  const button=event.target.closest("button[data-action]");if(!button)return;
  button.disabled=true;
  try{
   const leadId=button.dataset.id;
   if(button.dataset.action==="stage"){
    const dropdown=[...button.parentElement.querySelectorAll("select")][0];
    await call("/api/commercial/leads/"+encodeURIComponent(leadId),{
     method:"POST",body:{expectedVersion:Number(dropdown.dataset.version),stage:dropdown.value}
    });
    notify("Etapa atualizada.");
   }else if(button.dataset.action==="activity"){
    const note=prompt("Observação do contato (não envia mensagem):");
    if(!note?.trim())return;
    await call("/api/commercial/leads/"+encodeURIComponent(leadId)+"/activities",{
     method:"POST",body:{type:"note",note:note.trim()}
    });
    notify("Atividade registrada no histórico.");
   }
   await loadLeads();
  }catch(e){notify(e.message,true)}finally{button.disabled=false}
 });
 bindForm("leadForm","/api/commercial/leads",v=>({
  name:v.name,phone:v.phone,email:v.email,sellerId:v.sellerId,stage:v.stage,
  source:v.source,uf:v.uf,temperature:v.temperature,nextFollowup:v.nextFollowup||null,
  consentStatus:v.consentStatus
 }),async()=>{$("leadForm").reset();$("leadSeller").value=currentUser.id;});
 bindForm("saleForm","/api/commercial/sales",v=>({id:v.id,sellerId:v.sellerId,soldAt:v.soldAt,status:v.status,premiumCents:cents(v.premium),activationCents:cents(v.activation),recurringCents:cents(v.recurring)}));
 bindForm("policyForm","/api/commercial/policies",v=>({id:v.id,sellerId:v.sellerId,startsOn:v.startsOn,endsOn:v.endsOn,productType:v.productType,status:v.status}));
 bindForm("rulesForm","/api/commercial/rules",v=>{
  const tiers=[{minSales:0,bonusCents:0}];
  for(let i=1;i<=3;i++)tiers.push({minSales:Number($("g"+i).value),bonusCents:cents($("b"+i).value)});
  return {tiers,salesRateBps:basis($("rateSale").value),activationRateBps:basis($("rateActive").value),recurringRateBps:basis($("rateRecurring").value),
    fixedSalaryCents:cents($("fixed").value),teamTargetSales:Number($("teamTarget").value),halfSaturday:true};
 });
 bindForm("sellerGoalForm","/api/commercial/seller-plans",v=>({sellerId:v.sellerId,tiers:[
  {minSales:0,bonusCents:0},{minSales:Number(v.goal1),bonusCents:cents(v.bonus1)},{minSales:Number(v.goal2),bonusCents:cents(v.bonus2)}]}));
 $("userForm").addEventListener("submit",async e=>{
  e.preventDefault();const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;
  try{
   const v=Object.fromEntries(new FormData(e.currentTarget).entries());
   const created=await call("/api/pilot/users",{method:"POST",body:{email:v.email,password:v.password,role:v.role}});
   notify("Usuário criado. ID do vendedor: "+created.id);
   e.currentTarget.reset();await loadUsers();
  }catch(error){notify(error.message,true)}finally{btn.disabled=false}
 });
 if(currentUser.role==="master"){
  const companyForm=$("companyForm");
  const companyPlan=companyForm.querySelector('select[name="plan"]');
  const seatInput=companyForm.querySelector('input[name="seatLimit"]');
  const seatsByPlan={starter:1,professional:3,business:8};
  const syncSeats=()=>{seatInput.value=String(seatsByPlan[companyPlan.value]||1)};
  companyPlan.addEventListener("change",syncSeats);syncSeats();
  bindForm("companyForm","/api/platform/companies",v=>({
   tenantId:v.tenantId,companyName:v.companyName,plan:v.plan,seatLimit:Number(v.seatLimit),
   adminEmail:v.adminEmail,adminPassword:v.adminPassword
  }),()=>loadCompanies());
  $("companyTable").addEventListener("click",async e=>{
   const button=e.target.closest("button[data-tenant]");if(!button)return;
   if(!confirm("Confirma "+(button.dataset.status==="suspended"?"suspensão":"reativação")+" desta empresa?"))return;
   button.disabled=true;
   try{await call("/api/platform/companies/"+encodeURIComponent(button.dataset.tenant)+"/status",
    {method:"POST",body:{status:button.dataset.status}});
    await loadCompanies();notify("Empresa atualizada.");
   }catch(err){notify(err.message,true)}finally{button.disabled=false}
  });
 }
 $("passwordForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const v=Object.fromEntries(new FormData(e.currentTarget).entries());
  if(v.newPassword!==v.confirmPassword){notify("Confirmação da senha não confere.",true);return}
  const b=e.currentTarget.querySelector('button[type="submit"]');b.disabled=true;
  try{await call("/api/auth/password",{method:"POST",body:{oldPassword:v.oldPassword,newPassword:v.newPassword}});
   location.assign("/login");
  }catch(error){notify("Não foi possível alterar a senha: "+error.message,true)}finally{b.disabled=false}
 });
 if(me.mustChangePassword){
  document.querySelectorAll("#nav button[data-view]:not([data-view=account])").forEach(b=>b.hidden=true);
  show("account");notify("Por segurança, altere a senha provisória antes de usar o sistema.");
  return;
 }
 try{await loadCompanyProfile()}catch(e){notify("Não foi possível carregar o cadastro da empresa.",true)}
 try{await loadRules()}catch(e){if(e.message!=="Falha: 404")notify("Configure as regras da empresa em Metas e Comissão.",false)}
 try{await refresh()}catch(e){if(e.message.includes("Commission rules not configured")||e.message==="Verifique os campos e regras informadas"){notify("Configure suas metas em Metas e Comissão.",false);show("goals")}else notify(e.message,true)}
}
init().catch(e=>notify(e.message,true));
