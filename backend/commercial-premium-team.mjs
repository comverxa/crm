/**
 * COMVERXA — visão da equipe e metas individuais.
 * Fase de integração: cálculo isolado, sem acesso direto a clientes ou produção.
 * Autorização sempre resolvida no servidor; não confiar em tenant/role do navegador.
 */
import {assertScope,validateRules,salesSnapshot} from "./commercial-premium-core.mjs";

const ID=/^[a-zA-Z0-9_.:-]{1,100}$/;
function validId(v){if(typeof v!=="string"||!ID.test(v))throw Error("Invalid seller");return v}
export function validateSellerPlan(plan){
  if(!plan||typeof plan!=="object")throw Error("Invalid seller plan");
  const tenantId=validId(plan.tenantId),sellerId=validId(plan.sellerId);
  const tiers=Array.isArray(plan.tiers)?plan.tiers:null;
  if(tiers===null)throw Error("Individual tiers required");
  const verified=validateRules({tiers,salesRateBps:plan.salesRateBps??0,
    activationRateBps:plan.activationRateBps??0,recurringRateBps:plan.recurringRateBps??0,
    fixedSalaryCents:plan.fixedSalaryCents??0});
  return {tenantId,sellerId,tiers:verified.tiers,
    fixedSalaryCents:verified.fixedSalaryCents,
    salesRateBps:verified.salesRateBps,
    activationRateBps:verified.activationRateBps,
    recurringRateBps:verified.recurringRateBps};
}

/** Enables distinct salesperson goals plus an optional separately defined TEAM goal.
 * Team bonuses are the SUM of earned per-seller bonuses, never a team-wide tier
 * accidentally applied to total sales.
 */
export function teamDashboard({session,sales,plans=[],month,asOf,defaultRules,teamTargetSales=null}){
  assertScope(session);
  if(!["master","admin","manager"].includes(session.role))throw Error("Forbidden");
  const rules=validateRules(defaultRules);
  if(!Array.isArray(sales)||!Array.isArray(plans))throw Error("Invalid data");
  if(teamTargetSales!==null&&(!Number.isSafeInteger(teamTargetSales)||teamTargetSales<=0||teamTargetSales>1_000_000))
    throw Error("Invalid team goal");
  const scoped=sales.filter(s=>s.tenantId===session.tenantId);
  const planMap=new Map();
  for(const p of plans){
    if(!p || p.tenantId!==session.tenantId)continue;
    const validated=validateSellerPlan(p);
    if(planMap.has(validated.sellerId))throw Error("Duplicate seller plan");
    planMap.set(validated.sellerId,validated);
  }
  const sellers=new Set([...planMap.keys(),...scoped.map(s=>validId(s.sellerId))]);
  if(sellers.size>1000)throw Error("Too many sellers");
  const rows=[];
  for(const sellerId of sellers){
    const p=planMap.get(sellerId),config=p?{...rules,...p,holidays:rules.holidays,halfSaturday:rules.halfSaturday}:rules;
    const individual=salesSnapshot({session:{tenantId:session.tenantId,userId:sellerId,role:"operator"},
      sales:scoped,month,asOf,rules:config});
    rows.push({
      sellerId,sales:individual.counts.sold,lost:individual.counts.lost,
      negotiation:individual.counts.negotiation,amountCents:individual.revenueCents,
      effectiveCommissionCents:individual.commissions.effectiveCents,
      retainedCommissionCents:individual.commissions.retainedCents,
      achievedBonusCents:individual.target.achievedBonusCents,
      nextGoalSales:individual.target.nextMinSales,
      remainingSales:individual.target.remaining,completionPct:individual.target.completionPct,
      fixedSalaryCents:individual.earnings.fixedSalaryCents,
      projectedSales:individual.pace.projectedSales,atRisk:individual.pace.atRisk,
    });
  }
  rows.sort((a,b)=>b.sales-a.sales||b.amountCents-a.amountCents||a.sellerId.localeCompare(b.sellerId));
  const totals=rows.reduce((acc,s)=>{
    for(const key of ["sales","lost","negotiation","amountCents","effectiveCommissionCents",
      "retainedCommissionCents","achievedBonusCents","fixedSalaryCents"])acc[key]+=s[key];
    if(s.atRisk)acc.atRiskSellers++;
    return acc;
  },{sales:0,lost:0,negotiation:0,amountCents:0,effectiveCommissionCents:0,
    retainedCommissionCents:0,achievedBonusCents:0,fixedSalaryCents:0,atRiskSellers:0});
  const completionPct=teamTargetSales===null?null:Math.min(100,Math.round(totals.sales*1000/teamTargetSales)/10);
  const remaining=teamTargetSales===null?null:Math.max(0,teamTargetSales-totals.sales);
  return {tenantId:session.tenantId,month,asOf,sellerCount:rows.length,teamGoal:{
    targetSales:teamTargetSales,remainingSales:remaining,completionPct},totals,rows};
}
