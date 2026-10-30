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
async function loadDashboard(){
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
 if(currentView==="leads")return loadLeads();
 if(currentView==="goals")return loadRules();
 if(currentView==="team")return loadTeam();
 if(currentView==="renewals")return loadRenewals();
 if(currentView==="companies")return loadCompanies();
 if(currentView==="users")return loadUsers();
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
 $("period").value=period;
 $("saleSeller").value=currentUser.id;$("policySeller").value=currentUser.id;$("leadSeller").value=currentUser.id;
 if(currentUser.role==="operator"){
  document.querySelectorAll('#nav [data-view="team"],#nav [data-view="users"]').forEach(b=>b.hidden=true);
  $("rulesForm").querySelectorAll("input,button").forEach(el=>el.disabled=true);
  $("saleSeller").readOnly=true;$("policySeller").readOnly=true;$("leadSeller").readOnly=true;
  $("printReport").hidden=false;
 }
 if(!["admin","master"].includes(currentUser.role)){$('#nav [data-view="users"]').hidden=true}
 if(currentUser.role==="master"){$('#nav [data-view="companies"]').hidden=false}
 if(["admin","master","manager"].includes(currentUser.role))await loadUsers();
 document.querySelectorAll("#nav [data-view]").forEach(b=>b.addEventListener("click",()=>show(b.dataset.view)));
 $("mobileMenu").addEventListener("click",()=>{$("sidebar").classList.toggle("open");$("overlay").classList.toggle("open")});
 $("overlay").addEventListener("click",()=>{$("sidebar").classList.remove("open");$("overlay").classList.remove("open")});
 $("period").addEventListener("change",()=>{period=$("period").value;refresh().catch(e=>notify(e.message,true))});
 $("logout").addEventListener("click",async()=>{try{await call("/api/auth/logout",{method:"POST",body:{}})}finally{location.assign("/login")}});
 if(["admin","master"].includes(currentUser.role)){
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
