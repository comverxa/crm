/**
 * COMVERXA Premium Comercial — Stripe test-mode subscription checkout and verified
 * billing ledger. No entitlement automatically changes the tenant's login state.
 *
 * Explicitly test-only: refuses sk_live_* and livemode:true events.
 * Requires separately provisioned TEST price IDs and webhook endpoint secret.
 * Existing lifetime grants from the main CRM are never written or inspected.
 */
import {createHmac,timingSafeEqual,randomUUID} from "node:crypto";
import {publicPriceCatalog,validateCatalogPrices} from "./commercial-premium-pricing.mjs";
const PLAN_SET=new Set(["starter","professional","business"]);
const TEST_SECRET=/^sk_test_[a-zA-Z0-9_]{10,}$/;
const PRICE_ID=/^price_[a-zA-Z0-9]{5,}$/;
const STRIPE_ID=/^(cus|sub|cs_test|in|evt)_[A-Za-z0-9_]{6,}$/;
const now=()=>new Date().toISOString();
const stmt=(db,sql)=>db.prepare(sql);
const isId=(x,prefix)=>typeof x==="string"&&x.startsWith(prefix+"_")&&STRIPE_ID.test(x);
const objId=value=>typeof value==="string"?value:typeof value?.id==="string"?value.id:null;
const reqFail=(message)=>{throw new Error(message)};
const scalar=value=>String(value);
const eq=(a,b)=>typeof a==="string"&&typeof b==="string"&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function verifyStripeEvent(raw,signature,secret,{clock=()=>Date.now()}={}){
 if(!Buffer.isBuffer(raw)||raw.byteLength>1024*1024)throw Error("Invalid Stripe payload");
 if(typeof secret!=="string"||!secret.startsWith("whsec_"))throw Error("Stripe webhook secret not configured");
 const parts=String(signature||"").split(",").map(x=>x.trim());
 const ts=parts.find(x=>x.startsWith("t="))?.slice(2);
 const sigs=parts.filter(x=>x.startsWith("v1=")).map(x=>x.slice(3));
 if(!/^\d{9,13}$/.test(ts||"")||!sigs.length)throw Error("Invalid Stripe signature");
 const epoch=Number(ts);
 if(Math.abs(clock()/1000-epoch)>300)throw Error("Expired Stripe signature");
 const expected=createHmac("sha256",secret).update(ts+".").update(raw).digest("hex");
 if(!sigs.some(s=>/^[a-f0-9]{64}$/.test(s)&&eq(s,expected)))throw Error("Invalid Stripe signature");
 const event=JSON.parse(raw.toString("utf8"));
 if(!event||event.livemode!==false||!isId(event.id,"evt")||typeof event.type!=="string"||!event.data?.object)
  throw Error("Invalid Stripe test event");
 return event;
}
function asForm(fields){
 const data=new URLSearchParams();
 for(const [name,value] of Object.entries(fields))if(value!==null&&value!==undefined)data.set(name,scalar(value));
 return data;
}
export function createStripeBilling({db,secretKey,webhookSecret,priceIds={},priceIdsAnnual={},baseUrl,
  fetchImpl=fetch,clock=()=>Date.now()}={}){
 if(!db||typeof db.prepare!=="function")throw Error("SQLite required");
 if(!TEST_SECRET.test(secretKey||""))throw Error("Stripe TEST key required");
 if(typeof webhookSecret!=="string"||!webhookSecret.startsWith("whsec_"))throw Error("Stripe webhook secret required");
 const base=new URL(baseUrl);
 if(base.protocol!=="https:"||base.username||base.password||base.search||base.hash||base.pathname!=="/")
  throw Error("HTTPS public origin required");
 validateCatalogPrices({monthly:priceIds,annual:priceIdsAnnual});
 const prices={monthly:{},annual:{}};
 for(const plan of PLAN_SET){
  if(priceIds[plan])prices.monthly[plan]=priceIds[plan];
  if(priceIdsAnnual[plan])prices.annual[plan]=priceIdsAnnual[plan];
 }
 if(!Object.keys(prices.monthly).length&&!Object.keys(prices.annual).length)throw Error("No test prices configured");
 db.exec("CREATE TABLE IF NOT EXISTS cvx_pilot_stripe_checkout (intent_id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,plan TEXT NOT NULL,price_id TEXT NOT NULL,session_id TEXT UNIQUE,checkout_url TEXT,created_at TEXT NOT NULL,consumed_at TEXT)");
 db.exec("CREATE INDEX IF NOT EXISTS cvx_pilot_checkout_tenant ON cvx_pilot_stripe_checkout(tenant_id,created_at)");
 if(!stmt(db,"PRAGMA table_info(cvx_pilot_stripe_checkout)").all().some(x=>x.name==="billing_cycle"))
  db.exec("ALTER TABLE cvx_pilot_stripe_checkout ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly'");
 db.exec("CREATE TABLE IF NOT EXISTS cvx_pilot_stripe_subscriptions(subscription_id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,customer_id TEXT NOT NULL,plan TEXT NOT NULL,status TEXT NOT NULL,entitlement TEXT NOT NULL DEFAULT 'pending',last_paid_invoice TEXT,updated_at TEXT NOT NULL)");
 db.exec("CREATE INDEX IF NOT EXISTS cvx_pilot_stripe_subtenant ON cvx_pilot_stripe_subscriptions(tenant_id,updated_at)");
 if(!stmt(db,"PRAGMA table_info(cvx_pilot_stripe_subscriptions)").all().some(x=>x.name==="billing_cycle"))
  db.exec("ALTER TABLE cvx_pilot_stripe_subscriptions ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly'");
 db.exec("CREATE TABLE IF NOT EXISTS cvx_pilot_stripe_events(event_id TEXT PRIMARY KEY,event_type TEXT NOT NULL,processed_at TEXT NOT NULL)");
 async function postStripe(path,body,idempotencyKey){
  const response=await fetchImpl("https://api.stripe.com/v1/"+path,{
   method:"POST",headers:{"Authorization":"Bearer "+secretKey,"Content-Type":"application/x-www-form-urlencoded",
    "Idempotency-Key":idempotencyKey},body:asForm(body),redirect:"error",signal:AbortSignal.timeout(16000)});
  if(!response.ok)throw Error("Stripe TEST Checkout unavailable: HTTP "+response.status);
  const result=await response.json();
  return result;
 }
 function status(tenantId){
  const rows=stmt(db,"SELECT subscription_id,plan,billing_cycle,status,entitlement,updated_at FROM cvx_pilot_stripe_subscriptions WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 10").all(tenantId);
  return {configured:true,checkoutEnabled:true,testMode:true,availablePlans:Object.keys(prices.monthly),
   availableCycles:Object.fromEntries([...PLAN_SET].map(plan=>[plan,
     ["monthly","annual"].filter(cycle=>!!prices[cycle][plan])])),
   catalog:publicPriceCatalog(),
   subscriptions:rows.map(x=>({subscriptionId:x.subscription_id,plan:x.plan,cycle:x.billing_cycle,status:x.status,
    entitlement:x.entitlement,updatedAt:x.updated_at})),billingMode:"test_only"};
 }
 async function checkout(tenantId,plan,email,cycle="monthly"){
  if(!/^[A-Za-z0-9_.:-]{1,100}$/.test(tenantId)||!PLAN_SET.has(plan)
   ||!["monthly","annual"].includes(cycle)||!prices[cycle][plan])throw Error("Invalid tenant, plan or cycle");
  const priceId=prices[cycle][plan];
  if(typeof email!=="string"||!email.includes("@")||email.length>200)throw Error("Invalid email");
  // Never allow several open checkout URLs for a single tenant without a time-bound lock.
  // Reuse a valid recent session; Stripe itself also deduplicates the provider request.
  const latest=stmt(db,"SELECT * FROM cvx_pilot_stripe_checkout WHERE tenant_id=? AND plan=? AND price_id=? AND session_id IS NOT NULL AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1").get(tenantId,plan,priceId);
  if(latest&&clock()-Date.parse(latest.created_at)<15*60*1000)return {url:latest.checkout_url,testMode:true,cycle};
  const intent=randomUUID(),createdAt=new Date(clock()).toISOString();
  stmt(db,"INSERT INTO cvx_pilot_stripe_checkout(intent_id,tenant_id,plan,price_id,billing_cycle,created_at) VALUES(?,?,?,?,?,?)")
   .run(intent,tenantId,plan,priceId,cycle,createdAt);
  try{
   const session=await postStripe("checkout/sessions",{
    mode:"subscription",success_url:base.origin+"/app?checkout=return",
    cancel_url:base.origin+"/app?checkout=canceled",customer_email:email,
    client_reference_id:tenantId,"line_items[0][price]":priceId,"line_items[0][quantity]":"1",
    "metadata[tenant_id]":tenantId,"metadata[plan]":plan,"metadata[cycle]":cycle,"metadata[intent_id]":intent,
    "subscription_data[metadata][tenant_id]":tenantId,
    "subscription_data[metadata][intent_id]":intent
   },"cvx_pilot_checkout_"+intent);
   if(!isId(session.id,"cs_test")||!session.url||new URL(session.url).protocol!=="https:"||!new URL(session.url).hostname.endsWith(".stripe.com"))
    throw Error("Invalid Stripe test checkout response");
   stmt(db,"UPDATE cvx_pilot_stripe_checkout SET session_id=?,checkout_url=? WHERE intent_id=?")
    .run(session.id,session.url,intent);
   return {url:session.url,testMode:true,cycle};
  }catch(error){
   // Leave the checkout intent for audit; a second request uses a new intent.
   throw error;
  }
 }
 function recordEvent(event){
  const object=event.data.object,type=event.type,id=event.id;
  const seen=stmt(db,"SELECT 1 FROM cvx_pilot_stripe_events WHERE event_id=?").get(id);
  if(seen)return {duplicate:true,accepted:true};
  db.exec("BEGIN IMMEDIATE");
  try{
   if(type==="checkout.session.completed"){
    const meta=object.metadata||{};
    const intent=stmt(db,"SELECT * FROM cvx_pilot_stripe_checkout WHERE intent_id=?").get(meta.intent_id||"");
    const subscriptionId=objId(object.subscription),customerId=objId(object.customer);
    if(!intent||intent.session_id!==object.id||intent.tenant_id!==meta.tenant_id
      ||intent.plan!==meta.plan||intent.billing_cycle!==(meta.cycle||"monthly")
      ||intent.price_id!==prices[intent.billing_cycle]?.[intent.plan]
      ||object.client_reference_id!==intent.tenant_id
      ||object.mode!=="subscription"||object.status!=="complete"
      ||!isId(subscriptionId,"sub")||!isId(customerId,"cus"))
      throw Error("Checkout intent mismatch");
    const assigned=stmt(db,"SELECT tenant_id,customer_id FROM cvx_pilot_stripe_subscriptions WHERE subscription_id=?").get(subscriptionId);
    if(assigned&&(assigned.tenant_id!==intent.tenant_id||assigned.customer_id!==customerId))
      throw Error("Stripe subscription already assigned");
    if(!assigned){
     stmt(db,"INSERT INTO cvx_pilot_stripe_subscriptions(subscription_id,tenant_id,customer_id,plan,billing_cycle,status,entitlement,updated_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(subscriptionId,intent.tenant_id,customerId,intent.plan,intent.billing_cycle,"pending","pending",now());
    }
    stmt(db,"UPDATE cvx_pilot_stripe_checkout SET consumed_at=? WHERE intent_id=?").run(now(),intent.intent_id);
   } else if(["invoice.paid","invoice.payment_failed"].includes(type)){
    const subscriptionId=objId(object.subscription)||objId(object.parent?.subscription_details?.subscription);
    const customerId=objId(object.customer);
    if(!isId(subscriptionId,"sub")||!isId(customerId,"cus"))throw Error("Invoice lacks subscription or customer");
    const row=stmt(db,"SELECT * FROM cvx_pilot_stripe_subscriptions WHERE subscription_id=? AND customer_id=?").get(subscriptionId,customerId);
    if(!row)throw Error("Stripe subscription mapping unavailable; retry webhook");
    if(type==="invoice.paid"&&object.status==="paid"&&Number.isSafeInteger(object.amount_paid)&&object.amount_paid>0&&isId(object.id,"in")){
     const isCanceled=row.status==="canceled"||row.entitlement==="canceled";
     if(!isCanceled)stmt(db,"UPDATE cvx_pilot_stripe_subscriptions SET status='active',entitlement='active',last_paid_invoice=?,updated_at=? WHERE subscription_id=?")
      .run(object.id,now(),subscriptionId);
    } else if(type==="invoice.payment_failed"&&row.status!=="canceled"){
     stmt(db,"UPDATE cvx_pilot_stripe_subscriptions SET status='past_due',updated_at=? WHERE subscription_id=?").run(now(),subscriptionId);
    }
   } else if(type==="customer.subscription.updated"||type==="customer.subscription.deleted"){
    const id=objId(object.id),customerId=objId(object.customer);
    const row=stmt(db,"SELECT * FROM cvx_pilot_stripe_subscriptions WHERE subscription_id=? AND customer_id=?").get(id,customerId);
    if(!row)throw Error("Stripe subscription mapping unavailable; retry webhook");
    const terminal=type==="customer.subscription.deleted"||["canceled","unpaid","incomplete_expired"].includes(object.status);
    if(terminal){
     stmt(db,"UPDATE cvx_pilot_stripe_subscriptions SET status=?,entitlement='canceled',updated_at=? WHERE subscription_id=?")
      .run(type==="customer.subscription.deleted"?"canceled":object.status,now(),id);
    }else if(row.entitlement!=="canceled"){
     stmt(db,"UPDATE cvx_pilot_stripe_subscriptions SET status=?,updated_at=? WHERE subscription_id=?")
      .run(String(object.status||"unknown").slice(0,30),now(),id);
    }
   }
   stmt(db,"INSERT INTO cvx_pilot_stripe_events(event_id,event_type,processed_at) VALUES(?,?,?)")
    .run(id,type,now());
   db.exec("COMMIT");
   return {accepted:true,duplicate:false};
  }catch(error){db.exec("ROLLBACK");throw error}
 }
 function handleWebhook(raw,signature,{clock:time=clock}={}){
  const event=verifyStripeEvent(raw,signature,webhookSecret,{clock:time});
  return recordEvent(event);
 }
 return {checkout,status,handleWebhook,verify:raw=>verifyStripeEvent(raw,"",webhookSecret,{clock}),testMode:true};
}
