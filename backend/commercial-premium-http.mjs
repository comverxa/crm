/**
 * Authenticated HTTP adapter for the COMVERXA Premium Comercial module.
 * Not mounted in production; MUST be wired to the existing CRM's real,
 * server-validated session and CSRF middleware. Default is disabled.
 */
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"private, no-store","x-content-type-options":"nosniff"}});
const endpoint="/api/commercial/";
export function createCommercialHttpHandler({store,getSession,verifyCsrf,enabled=false,maxBytes=16_384}={}){
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
  if(req.method==="POST"&&!(await verifyCsrf(req,session)))return json(403,{error:"Forbidden"});
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
   if(action==="summary"&&req.method==="GET")return json(200,store.snapshot(session,{month,asOf}));
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
   if(/^(Invalid|Commission rules not configured|Tiers must increase|Result too large)/.test(message))
     return json(400,{error:"Invalid request"});
   return json(500,{error:"Internal error"});
  }
 };
}
