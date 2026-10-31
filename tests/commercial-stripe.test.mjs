import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createPremiumServer} from "../backend/commercial-premium-server.mjs";
import {createStripeBilling,verifyStripeEvent} from "../backend/commercial-premium-stripe.mjs";
import {publicPriceCatalog} from "../backend/commercial-premium-pricing.mjs";
const secret="sk_test_mockonly1234567890",webhookSecret="whsec_only_unit_tests123456";
const priceIds={starter:"price_StarterTest01",professional:"price_ProTest001",business:"price_BizTest001"};
const annualIds={starter:"price_StarterYear01",professional:"price_ProYear001",business:"price_BizYear001"};
const timestamp=Date.parse("2026-10-30T01:00:00.000Z");
const planOrigin="https://comverxa-comercial-piloto-production.up.railway.app";
function signature(payload,ts=Math.floor(timestamp/1000)){
 const bytes=Buffer.from(JSON.stringify(payload)),signed=String(ts)+"."+bytes.toString();
 return {bytes,signature:"t="+ts+",v1="+createHmac("sha256",webhookSecret).update(signed).digest("hex")};
}
const evt=(id,type,obj)=>({id,type,livemode:false,data:{object:obj}});
const sid="cs_test_checkout_0001",sub="sub_test_000001",customer="cus_test_000001";
function context(db){
 let form,calls=0;
 const app=createStripeBilling({db,secretKey:secret,webhookSecret,priceIds,priceIdsAnnual:annualIds,baseUrl:planOrigin,clock:()=>timestamp,
  fetchImpl:async(url,request)=>{
   calls++;assert.equal(url,"https://api.stripe.com/v1/checkout/sessions");
   assert.equal(request.method,"POST");
   assert.match(request.headers.Authorization,/sk_test_/);
   assert.ok(request.headers["Idempotency-Key"].startsWith("cvx_pilot_checkout_"));
   form=new URLSearchParams(request.body.toString());
   return new Response(JSON.stringify({id:sid,url:"https://checkout.stripe.com/c/pay/cs_test_checkout_0001"}),{status:200});
  }});
 return {app,get form(){return form},get calls(){return calls}};
}
test("Stripe test Checkout uses only server-trusted plan prices; no customer charges or entitlement on redirect",async()=>{
 const db=new DatabaseSync(":memory:");
 try{
  const ctx=context(db);
  assert.deepEqual(ctx.app.status("company-A").subscriptions,[]);
  const result=await ctx.app.checkout("company-A","professional","owner@example.test");
  assert.equal(result.testMode,true);assert.match(result.url,/^https:\/\/checkout.stripe.com/);
  assert.equal(ctx.form.get("line_items[0][price]"),priceIds.professional);
  assert.equal(ctx.form.get("mode"),"subscription");
  assert.equal(ctx.form.get("client_reference_id"),"company-A");
  assert.equal(ctx.form.get("customer_email"),"owner@example.test");
  assert.equal(ctx.form.get("metadata[tenant_id]"),"company-A");
  const again=await ctx.app.checkout("company-A","professional","owner@example.test");
  assert.equal(again.url,result.url);assert.equal(ctx.calls,1);
  assert.throws(()=>createStripeBilling({db,secretKey:"sk_live_abcabcabcabc",webhookSecret,priceIds,baseUrl:planOrigin}),/TEST key/);
  assert.equal(ctx.app.status("company-A").subscriptions.length,0);
 }finally{db.close()}
});
test("Stripe signed events: only matched completed checkout + paid invoice grant subscription access; retries deduplicated",async()=>{
 const db=new DatabaseSync(":memory:");
 try{
  const ctx=context(db),checkout=await ctx.app.checkout("company-A","starter","owner@example.test");
  assert.ok(checkout.url);
  const intent=ctx.form.get("metadata[intent_id]");
  const completed=evt("evt_checkout_001","checkout.session.completed",{
   id:sid,mode:"subscription",status:"complete",client_reference_id:"company-A",
   customer,subscription:sub,metadata:{tenant_id:"company-A",plan:"starter",intent_id:intent}});
  const signed=signature(completed);
  assert.equal(ctx.app.handleWebhook(signed.bytes,signed.signature,{clock:()=>timestamp}).accepted,true);
  assert.equal(ctx.app.handleWebhook(signed.bytes,signed.signature,{clock:()=>timestamp}).duplicate,true);
  let subscription=ctx.app.status("company-A").subscriptions[0];
  assert.equal(subscription.entitlement,"pending");
  await assert.rejects(ctx.app.checkout("company-A","professional","owner@example.test"),/Subscription already exists/);
  let failed=evt("evt_invoice_fail001","invoice.payment_failed",{id:"in_fail_0001",customer,subscription:sub,status:"open"});
  const f=signature(failed);ctx.app.handleWebhook(f.bytes,f.signature,{clock:()=>timestamp});
  assert.equal(ctx.app.status("company-A").subscriptions[0].entitlement,"pending");
  const free=signature(evt("evt_invoice_free01","invoice.paid",{id:"in_free_00001",customer,subscription:sub,status:"paid",amount_paid:0}));
  ctx.app.handleWebhook(free.bytes,free.signature,{clock:()=>timestamp});
  assert.equal(ctx.app.status("company-A").subscriptions[0].entitlement,"pending");
  const mismatch=signature(evt("evt_wrongprice01","invoice.paid",{
   id:"in_wrong_00001",customer,subscription:sub,status:"paid",amount_paid:3000,currency:"brl",
   lines:{data:[{price:{id:priceIds.business}}]}}));
  assert.throws(()=>ctx.app.handleWebhook(mismatch.bytes,mismatch.signature,{clock:()=>timestamp}),/invoice currency or price mismatch/);
  assert.equal(ctx.app.status("company-A").subscriptions[0].entitlement,"pending");
  const paid=evt("evt_invoice_paid01","invoice.paid",{id:"in_paid_00001",customer,subscription:sub,status:"paid",amount_paid:3000,
   currency:"brl",lines:{data:[{price:{id:priceIds.starter}}]}});
  const p=signature(paid);ctx.app.handleWebhook(p.bytes,p.signature,{clock:()=>timestamp});
  subscription=ctx.app.status("company-A").subscriptions[0];
  assert.equal(subscription.status,"active");assert.equal(subscription.entitlement,"active");
  assert.equal(ctx.app.status("company-B").subscriptions.length,0);
  const canceled=evt("evt_sub_deleted01","customer.subscription.deleted",{id:sub,customer,status:"canceled"});
  const c=signature(canceled);ctx.app.handleWebhook(c.bytes,c.signature,{clock:()=>timestamp});
  assert.equal(ctx.app.status("company-A").subscriptions[0].entitlement,"canceled");
  const latePaid=signature(evt("evt_invoice_paid02","invoice.paid",{id:"in_paid_00002",customer,subscription:sub,status:"paid",amount_paid:3000,
    currency:"brl",lines:{data:[{pricing:{price_details:{price:priceIds.starter}}}]}}));
  ctx.app.handleWebhook(latePaid.bytes,latePaid.signature,{clock:()=>timestamp});
  assert.equal(ctx.app.status("company-A").subscriptions[0].entitlement,"canceled");
 }finally{db.close()}
});
test("Stripe signature verification rejects expired, tampered, livemode and unsigned events",()=>{
 const basic=evt("evt_valid123456","invoice.paid",{id:"in_paid_00001"});
 const signed=signature(basic);
 assert.equal(verifyStripeEvent(signed.bytes,signed.signature,webhookSecret,{clock:()=>timestamp}).id,basic.id);
 assert.throws(()=>verifyStripeEvent(signed.bytes,"t=1,v1=abcd",webhookSecret,{clock:()=>timestamp}));
 assert.throws(()=>verifyStripeEvent(signed.bytes,signed.signature,webhookSecret,{clock:()=>timestamp+301000}),/Expired/);
 assert.throws(()=>verifyStripeEvent(Buffer.from("{}"),signed.signature,webhookSecret,{clock:()=>timestamp}),/signature/i);
 const live=signature({...basic,livemode:true});
 assert.throws(()=>verifyStripeEvent(live.bytes,live.signature,webhookSecret,{clock:()=>timestamp}),/Invalid Stripe test event/);
});
test("Stripe unbound invoice returns error for provider retry, no unintended tenant provision",async()=>{
 const db=new DatabaseSync(":memory:");
 try{
  const app=context(db).app;
  const paid=signature(evt("evt_paidunknown1","invoice.paid",{id:"in_unbound001",customer,subscription:sub,status:"paid",amount_paid:10000}));
  assert.throws(()=>app.handleWebhook(paid.bytes,paid.signature,{clock:()=>timestamp}),/mapping unavailable/);
  assert.equal(app.status("company-A").subscriptions.length,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM cvx_pilot_stripe_events").get().c,0);
 }finally{db.close()}
});

test("HTTP SaaS Stripe endpoints require authenticated tenant, password rotation and CSRF",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"cvx-stripe-http-"));
 const app=createPremiumServer({dbPath:join(dir,"pilot.sqlite"),
  bootstrapEmail:"admin@exemplo.test",bootstrapPassword:"BootPassTest-2026-1234",cookieSecure:false,
  stripeConfig:{secretKey:secret,webhookSecret,priceIds,clock:()=>timestamp,
   fetchImpl:async()=>new Response(JSON.stringify({id:sid,url:"https://checkout.stripe.com/c/pay/test-session"}),{status:200})}});
 try{
  await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+app.server.address().port;
  const post=(path,body,headers={})=>fetch(base+path,{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body)});
  assert.equal((await fetch(base+"/api/billing/stripe/status")).status,401);
  assert.equal((await post("/api/billing/stripe/checkout",{plan:"starter"})).status,401);
  const first=await post("/api/auth/login",{email:"admin@exemplo.test",password:"BootPassTest-2026-1234"});
  assert.equal(first.status,200);
  const cookie=first.headers.get("set-cookie").split(";")[0];
  const session=await(await fetch(base+"/api/auth/me",{headers:{cookie}})).json();
  assert.equal(session.mustChangePassword,true);
  let r=await post("/api/billing/stripe/checkout",{plan:"starter"},{cookie,"x-csrf-token":session.csrf});
  assert.equal(r.status,403);
  r=await post("/api/auth/password",{oldPassword:"BootPassTest-2026-1234",newPassword:"ChangedPassTest-2026-1234"},{cookie,"x-csrf-token":session.csrf});
  assert.equal(r.status,200);
  const login=await post("/api/auth/login",{email:"admin@exemplo.test",password:"ChangedPassTest-2026-1234"});
  const cookie2=login.headers.get("set-cookie").split(";")[0];
  const user=await(await fetch(base+"/api/auth/me",{headers:{cookie:cookie2}})).json();
  r=await post("/api/billing/stripe/checkout",{plan:"starter"},{cookie:cookie2,"x-csrf-token":"invalid"});
  assert.equal(r.status,403);
  r=await post("/api/billing/stripe/checkout",{plan:"starter"},{cookie:cookie2,"x-csrf-token":user.csrf});
  assert.equal(r.status,200);assert.equal((await r.json()).testMode,true);
  r=await fetch(base+"/api/billing/stripe/status",{headers:{cookie:cookie2}});
  assert.equal(r.status,200);assert.equal((await r.json()).availablePlans.length,3);
  r=await post("/api/billing/stripe/webhook",{fake:"event"},{});
  assert.equal(r.status,400);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true})}
});

test("approved catalog has exactly the six authorized BRL monthly/yearly values",()=>{
 const catalog=publicPriceCatalog();
 const plans={
  starter:[9990,99900,1],professional:[21990,219900,3],business:[39990,399900,8]
 };
 for(const [plan,[month,year,seats]] of Object.entries(plans)){
  assert.equal(catalog[plan].monthlyCents,month);
  assert.equal(catalog[plan].annualCents,year);
  assert.equal(catalog[plan].seats,seats);
  assert.equal(catalog[plan].annualSavingsCents,month*12-year);
  assert.equal(catalog[plan].realPaymentsEnabled,false);
 }
});
test("annual checkout uses exact server-side Stripe annual Price and tags billing cycle",async()=>{
 const db=new DatabaseSync(":memory:");
 try{
  const ctx=context(db);
  const status=ctx.app.status("company-A");
  assert.equal(status.catalog.business.annualCents,399900);
  assert.deepEqual(status.availableCycles.business,["monthly","annual"]);
  const session=await ctx.app.checkout("company-A","business","billing@example.test","annual");
  assert.equal(session.cycle,"annual");
  assert.equal(ctx.form.get("line_items[0][price]"),annualIds.business);
  assert.equal(ctx.form.get("metadata[cycle]"),"annual");
  assert.equal(ctx.form.get("client_reference_id"),"company-A");
  assert.equal(db.prepare("SELECT billing_cycle FROM cvx_pilot_stripe_checkout LIMIT 1").get().billing_cycle,"annual");
 }finally{db.close()}
});

test("one tenant cannot open conflicting parallel or cross-plan Stripe Checkouts",async()=>{
 const db=new DatabaseSync(":memory:");
 try{
  const ctx=context(db);
  await ctx.app.checkout("company-C","starter","admin@example.test","monthly");
  await assert.rejects(
    ctx.app.checkout("company-C","professional","admin@example.test","annual"),
    /Another checkout is still open/
  );
  const same=await ctx.app.checkout("company-C","starter","admin@example.test","monthly");
  assert.equal(same.testMode,true);
  assert.equal(ctx.calls,1);
 }finally{db.close()}
});

test("Independent Stripe checkout redirects only to the corresponding CRM, never the legacy app",async()=>{
 for(const portalPath of ["/profissional/app","/empresa/app"]){
  const db=new DatabaseSync(":memory:");let form;
  try{
   const app=createStripeBilling({db,secretKey:secret,webhookSecret,priceIds,baseUrl:"https://example.test",
    portalPath,clock:()=>timestamp,fetchImpl:async(url,request)=>{
     form=new URLSearchParams(request.body);
     return new Response(JSON.stringify({id:sid,url:"https://checkout.stripe.com/c/pay/cs_test_checkout_0001"}),{status:200});
    }});
   await app.checkout("tenant-123","starter","demo@example.test");
   assert.equal(form.get("success_url"),"https://example.test"+portalPath+"?checkout=return");
   assert.equal(form.get("cancel_url"),"https://example.test"+portalPath+"?checkout=canceled");
  }finally{db.close()}
 }
 const db=new DatabaseSync(":memory:");
 try{assert.throws(()=>createStripeBilling({db,secretKey:secret,webhookSecret,priceIds,baseUrl:"https://example.test",portalPath:"//attacker.com"}),/Invalid Stripe return path/)}
 finally{db.close()}
});
