/**
 * COMVERXA Premium Comercial v1 — deterministic business logic.
 * No I/O, WhatsApp send, billing, or access to production data.
 * Money uses integer BRL cents, rates use basis points (10000 = 100%).
 * Authenticated tenantId, userId, role must always be supplied server-side.
 */
const VALID_STATES=new Set(["lead","negotiation","proposal","sold","active","lost","canceled"]);
const CLOSED_STATES=new Set(["sold","active"]);
const ROLES=new Set(["master","admin","manager","operator"]);
const TENANT_ID=/^[a-zA-Z0-9_.:-]{1,100}$/;
export function assertScope(session) {
  if (!session || !TENANT_ID.test(session.tenantId||"") ||
      !TENANT_ID.test(session.userId||"") || !ROLES.has(session.role))
    throw new Error("Unauthorized");
  return session;
}
function day(value) {
  if(typeof value!=="string"||! /^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error("Invalid date");
  const d=new Date(value+"T00:00:00Z");
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value) throw Error("Invalid date");
  return d;
}
function monthParts(month) {
  if(typeof month!=="string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error("Invalid month");
  const [y,m]=month.split("-").map(Number);
  return {first:new Date(Date.UTC(y,m-1,1)),last:new Date(Date.UTC(y,m,0))};
}
function iso(d){return d.toISOString().slice(0,10)}
const rounded=(value)=>Math.round(value);
export function money(value) {
  if(!Number.isSafeInteger(value) || value<0 || value>1_000_000_000_00) throw Error("Invalid amount");
  return value;
}
export function rate(value) {
  if(!Number.isSafeInteger(value) || value<0 || value>10000) throw Error("Invalid rate");
  return value;
}
function pctPart(cents,bps){return rounded(money(cents)*rate(bps)/10000)}
export function validateRules(rules) {
  if(!rules || typeof rules!=="object" || !Array.isArray(rules.tiers) || rules.tiers.length===0 || rules.tiers.length>30)
    throw Error("Invalid rules");
  const tiers=rules.tiers.map(t=>{
    if(!Number.isSafeInteger(t.minSales)||t.minSales<0||t.minSales>1_000_000) throw Error("Invalid sales threshold");
    return {minSales:t.minSales,bonusCents:money(t.bonusCents)};
  });
  for(let i=1;i<tiers.length;i++)
    if(tiers[i].minSales<=tiers[i-1].minSales || tiers[i].bonusCents<tiers[i-1].bonusCents)
      throw Error("Tiers must increase");
  const cfg={
    tiers,salesRateBps:rate(rules.salesRateBps??0),
    activationRateBps:rate(rules.activationRateBps??0),
    recurringRateBps:rate(rules.recurringRateBps??0),
    fixedSalaryCents:money(rules.fixedSalaryCents??0),
    halfSaturday:!!rules.halfSaturday,
    holidays:Array.isArray(rules.holidays)?rules.holidays.slice(0,60).map(s=>iso(day(s))):[],
  };
  return cfg;
}
export function workdays(month,asOf,{holidays=[],halfSaturday=false}={}){
  const {first,last}=monthParts(month),today=day(asOf),ignored=new Set(holidays.map(s=>iso(day(s))));
  let total=0,elapsed=0;
  for(let t=first.getTime();t<=last.getTime();t+=86400000){
    const d=new Date(t),weekday=d.getUTCDay(),key=iso(d);
    const weight=ignored.has(key)?0:weekday===0?0:weekday===6?(halfSaturday?0.5:0):1;
    total+=weight;
    if(t<=today.getTime())elapsed+=weight;
  }
  return {total,elapsed,remaining:Math.max(0,total-elapsed)};
}
function rowsForSession(rows,session,{ownOnly=false}={}){
  assertScope(session);
  if(!Array.isArray(rows))throw Error("Invalid rows");
  return rows.filter(row=>row.tenantId===session.tenantId &&
    ((session.role==="operator"||ownOnly)?row.sellerId===session.userId:true));
}
function saleIsCounted(s){return CLOSED_STATES.has(s.status)}
function validateSale(s){
  if(!s || typeof s!=="object" ||!TENANT_ID.test(s.tenantId||"")||!TENANT_ID.test(s.sellerId||"")||
    typeof s.id!=="string" || !s.id.trim() || !VALID_STATES.has(s.status))throw Error("Invalid sale");
  day(s.soldAt);
  money(s.premiumCents??0);money(s.activationCents??0);money(s.recurringCents??0);
  if(!["effective","retained"].includes(s.commissionState??"effective"))throw Error("Invalid commission state");
  return s;
}
export function salesSnapshot({session,sales,month,asOf,rules,ownOnly=false}){
  const cfg=validateRules(rules),period=monthParts(month);
  const scoped=rowsForSession(sales,session,{ownOnly})
    .map(validateSale)
    .filter(s=>day(s.soldAt)>=period.first && day(s.soldAt)<=period.last);
  const sold=scoped.filter(saleIsCounted),counts={sold:sold.length,lost:scoped.filter(s=>s.status==="lost").length,
    canceled:scoped.filter(s=>s.status==="canceled").length,negotiation:scoped.filter(s=>s.status==="negotiation").length};
  let effective=0,retained=0,revenue=0;
  const bySeller=new Map();
  for(const s of sold){
    const value=money(s.premiumCents??0),activation=money(s.activationCents??0),recurring=money(s.recurringCents??0);
    const earned=pctPart(value,cfg.salesRateBps)+pctPart(activation,cfg.activationRateBps)+pctPart(recurring,cfg.recurringRateBps);
    if(!Number.isSafeInteger(earned))throw Error("Commission overflow");
    if(s.commissionState==="retained")retained+=earned;else effective+=earned;
    revenue+=value+activation+recurring;
    const row=bySeller.get(s.sellerId)||{sellerId:s.sellerId,sales:0,revenueCents:0,commissionCents:0};
    row.sales++;row.revenueCents+=value+activation+recurring;row.commissionCents+=earned;
    bySeller.set(s.sellerId,row);
  }
  const achieved=[...cfg.tiers].reverse().find(t=>counts.sold>=t.minSales)||null;
  const next=cfg.tiers.find(t=>counts.sold<t.minSales)||null;
  const days=workdays(month,asOf,cfg);
  const avg=days.elapsed>0?counts.sold/days.elapsed:0;
  const projected=days.elapsed>0?Math.max(counts.sold,avg*days.total):counts.sold;
  const required=next&&days.remaining>0?(next.minSales-counts.sold)/days.remaining:0;
  const target=next||cfg.tiers[cfg.tiers.length-1];
  const completion=target.minSales===0?100:Math.min(100,rounded(counts.sold*1000/target.minSales)/10);
  return {
    month,asOf,counts,workdays:days,
    target:{achievedMinSales:achieved?.minSales??null,nextMinSales:next?.minSales??null,
      remaining:next?next.minSales-counts.sold:0,completionPct:completion,
      achievedBonusCents:achieved?.bonusCents??0,nextBonusCents:next?.bonusCents??0},
    commissions:{effectiveCents:effective,retainedCents:retained},
    revenueCents:revenue,earnings:{
      fixedSalaryCents:session.role==="operator"?cfg.fixedSalaryCents:null,
      variableCents:effective+(achieved?.bonusCents??0),
      totalCents:session.role==="operator"?cfg.fixedSalaryCents+effective+(achieved?.bonusCents??0):null,
      nextTierPotentialBonusCents:next?.bonusCents??0,
    },pace:{averageDaily:rounded(avg*100)/100,requiredDaily:rounded(required*100)/100,
      projectedSales:rounded(projected*10)/10,projectedTargetPct:target.minSales?rounded(projected*1000/target.minSales)/10:100,
      atRisk:!!next&&days.remaining>0&&required>avg*1.25,
      periodClosed:days.remaining===0},
    sellers:[...bySeller.values()].sort((a,b)=>b.sales-a.sales||a.sellerId.localeCompare(b.sellerId)),
  };
}
export function renewalQueue({session,contracts,asOf,ownOnly=false}){
  const current=day(asOf),rows=rowsForSession(contracts,session,{ownOnly});
  const summary={overdue:0,within10:0,within30:0,later:0},reminders=[];
  const items=rows.filter(c=>["active","pending_renewal"].includes(c.status)).map(c=>{
    const end=day(c.endsOn),daysUntil=Math.round((end-current)/86400000);
    const band=daysUntil<0?"overdue":daysUntil<=10?"within10":daysUntil<=30?"within30":"later";
    summary[band]++;
    const nextReminder=([10,15,30].find(n=>daysUntil<=n&&daysUntil>=0))??null;
    // This is a suggested action only: no customer message is generated or sent.
    if(nextReminder!==null)reminders.push({contractId:c.id,daysUntil,reminderWindow:nextReminder});
    return {id:c.id,sellerId:c.sellerId,endsOn:c.endsOn,daysUntil,band,
      productType:c.productType,vehiclePlateMasked:c.vehiclePlateMasked??null};
  }).sort((a,b)=>a.daysUntil-b.daysUntil||String(a.id).localeCompare(String(b.id)));
  return {asOf,summary,items,reminders};
}
export function assertWriteScope(session,tenantId,sellerId){
  assertScope(session);
  if(tenantId!==session.tenantId)throw Error("Not found");
  if(session.role==="operator"&&sellerId!==session.userId)throw Error("Forbidden");
  return true;
}
