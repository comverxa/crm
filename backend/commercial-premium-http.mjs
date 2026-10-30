/**
 * Authenticated HTTP adapter for the COMVERXA Premium Comercial module.
 * Not mounted in production; MUST be wired to the existing CRM's real,
 * server-validated session and CSRF middleware. Default is disabled.
 */
import {makeCommercialReport,makeCommercialCsv} from "./commercial-premium-reports.mjs";
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"private, no-store","x-content-type-options":"nosniff"}});
const endpoint="/api/commercial/";
export function createCommercialHttpHandler({store,leads=null,getSession,verifyCsrf,enabled=false,maxBytes=16_384}={}){
 if(!store || typeof store.snapshot!=="function" || typeof getSession!=="function" || typeof verifyCsrf!=="function")
  throw Error("Authenticated integration dependencies required");
 return async function commercialRequest(req){
  let url;try{url=new URL(req.url)}catch{return json(404,{error:"Not found"})}
  if(!url.pathname.startsWith(endpoint))return json(404,{error:"Not found"});
  if(!enabled)return json(503,{error:"Commercial module not enabled"});
  let session;try{session=await getSession(req)}catch{return json(401,{error:"Unauthorized"})}
  if(!session?.tenantId||!session?.userId||!["master","admin","manager","operator"].includes(session.role))
   return json(401,{error:"Unauthorized"});
  const action=url.pathname.slice(endpoint.length);
  if(!["GET","POST"].includes(req.method))return json(405,{error:"Method not allowed"});
  if(req.method==="POST"){
   let csrfOk=false;try{csrfOk=await verifyCsrf(req,session)}catch{}
   if(!csrfOk)return json(403,{error:"Forbidden"});
  }
  let input=null;
  if(req.method==="POST"){
   if(!/^application\/json(?:\s*;|\s*$)/i.test(req.headers.get("content-type")||""))
    return json(415,{error:"JSON required"});
   const claimed=Number(req.headers.get("content-length"));
   if(Number.isFinite(claimed)&&claimed>maxBytes)return json(413,{error:"Payload too large"});
   try{const body=await req.text();if(new TextEncoder().encode(body).byteLength>maxBytes)return json(413,{error:"Payload too large"});input=JSON.parse(body);
     if(!input||typeof input!=="object"||Array.isArray(input))return json(400,{error:"Invalid JSON"})}
   catch{return json(400,{error:"Invalid JSON"})}
  }
  const month=url.searchParams.get("month")||"";
  const asOf=url.searchParams.get("asOf")||new Date().toISOString().slice(0,10);
  try{
   if(action.startsWith("leads")&&leads){
    if(action==="leads"&&req.method==="GET")
     return json(200,{leads:leads.list(session,{stage:url.searchParams.get("stage")||undefined,
      ddd:url.searchParams.get("ddd")||undefined,uf:url.searchParams.get("uf")||undefined,limit:200})});
    if(action==="leads/summary"&&req.method==="GET")return json(200,leads.summary(session));
    if(action==="leads"&&req.method==="POST")return json(201,{lead:leads.create(session,input)});
    const parts=action.split("/");
    if(parts[0]==="leads"&&parts[1]&&parts.length<=4){
     const leadId=decodeURIComponent(parts[1]);
     if(parts.length===2&&req.method==="GET")return json(200,{lead:leads.get(session,leadId)});
     if(parts.length===2&&req.method==="POST")return json(200,{lead:leads.update(session,leadId,input)});
     if(parts.length===3&&parts[2]==="history"&&req.method==="GET")
      return json(200,{history:leads.history(session,leadId)});
     if(parts.length===3&&parts[2]==="activities"&&req.method==="POST")
      return json(201,{activity:leads.recordActivity(session,leadId,input)});
    }
   }
   if(action==="configuration-status"&&req.method==="GET")return json(200,{
    configured:store.getRules(session)!==null,
    canConfigure:["master","admin","manager"].includes(session.role)
   });
   if(action==="summary"&&req.method==="GET")return json(200,store.snapshot(session,{month,asOf}));
   if(action==="team"&&req.method==="GET")return json(200,store.teamSummary(session,{month,asOf}));
   if(action==="seller-plans"&&req.method==="GET")return json(200,{plans:store.listSellerPlans(session)});
   if(action==="seller-plans"&&req.method==="POST")return json(201,{plan:store.saveSellerPlan(session,input)});
   if((action==="report/print"||action==="report.csv")&&req.method==="GET"){
    const managerial=["master","admin","manager"].includes(session.role);
    if(action==="report.csv"&&!managerial)return json(403,{error:"Forbidden"});
    const summary=store.snapshot(session,{month,asOf});
    const team=managerial?store.teamSummary(session,{month,asOf}):null;
    if(action==="report.csv"){
     const csv=makeCommercialCsv({period:month,team});
     return new Response(csv,{status:200,headers:{
      "content-type":"text/csv; charset=utf-8","content-disposition":'attachment; filename="comverxa-comercial-'+month+'.csv"',
      "cache-control":"private, no-store","x-content-type-options":"nosniff"}});
    }
    // A team-wide bonus must never be inferred from group volume.
    const adjusted=team?{...summary,counts:{...summary.counts,sold:team.totals.sales},
      revenueCents:team.totals.amountCents,
      commissions:{effectiveCents:team.totals.effectiveCommissionCents,retainedCents:team.totals.retainedCommissionCents},
      target:{...summary.target,achievedBonusCents:team.totals.achievedBonusCents,
        completionPct:team.teamGoal.completionPct??0}}:summary;
    const html=makeCommercialReport({period:month,asOf,subject:managerial?"Fechamento comercial da equipe":"Demonstrativo individual",summary:adjusted,team});
    return new Response(html,{status:200,headers:{"content-type":"text/html; charset=utf-8",
      "cache-control":"private, no-store","x-content-type-options":"nosniff",
      "x-frame-options":"DENY",
      "content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
   }
   if(action==="sales"&&req.method==="GET")return json(200,{sales:store.listSales(session,month)});
   if(action==="renewals"&&req.method==="GET")return json(200,store.renewals(session,{asOf}));
   if(action==="rules"&&req.method==="GET")return json(200,{rules:store.getRules(session)});
   if(action==="sales"&&req.method==="POST")return json(201,{sale:store.upsertSale(session,input)});
   if(action==="policies"&&req.method==="POST")return json(201,{policy:store.upsertPolicy(session,input)});
   if(action==="rules"&&req.method==="POST")return json(200,{rules:store.saveRules(session,input)});
   return json(404,{error:"Not found"});
  }catch(err){
   const message=String(err?.message||"");
   if(message==="Unauthorized")return json(401,{error:"Unauthorized"});
   if(message==="Forbidden")return json(403,{error:"Forbidden"});
   if(message==="Not found")return json(404,{error:"Not found"});
   if(message==="Version conflict"||message==="Duplicate lead")return json(409,{error:message});
   if(/^(Invalid|Commission rules not configured|Tiers must increase|Result too large)/.test(message))
     return json(400,{error:"Invalid request"});
   return json(500,{error:"Internal error"});
  }
 };
}
