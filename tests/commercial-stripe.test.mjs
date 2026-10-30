import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {createStripeBilling,verifyStripeEvent} from "../backend/commercial-premium-stripe.mjs";
const secret="sk_test_mockonly1234567890",webhookSecret="whsec_only_unit_tests123456";
const priceIds={starter:"price_StarterTest01",professional:"price_ProTest001",business:"price_BizTest001"};
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
 const app=createStripeBilling({db,secretKey:secret,webhookSecret,priceIds,baseUrl:planOrigin,clock:()=>timestamp,
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
  let failed=evt("evt_invoice_fail001","invoice.payment_failed",{id:"in_fail_0001",customer,subscription:sub,status:"open"});
  const f=signature(failed);ctx.app.handleWebhook(f.bytes,f.signature,{clock:()=>timestamp});
  assert.equal(ctx.app.status("company-A").subscriptions[0].entitlement,"pending");
  const paid=evt("evt_invoice_paid01","invoice.paid",{id:"in_paid_00001",customer,subscription:sub,status:"paid",amount_paid:3000});
  const p=signature(paid);ctx.app.handleWebhook(p.bytes,p.signature,{clock:()=>timestamp});
  subscription=ctx.app.status("company-A").subscriptions[0];
  assert.equal(subscription.status,"active");assert.equal(subscription.entitlement,"active");
  assert.equal(ctx.app.status("company-B").subscriptions.length,0);
  const canceled=evt("evt_sub_deleted01","customer.subscription.deleted",{id:sub,customer,status:"canceled"});
  const c=signature(canceled);ctx.app.handleWebhook(c.bytes,c.signature,{clock:()=>timestamp});
  assert.equal(ctx.app.status("company-A").subscriptions[0].entitlement,"canceled");
  const latePaid=signature(evt("evt_invoice_paid02","invoice.paid",{id:"in_paid_00002",customer,subscription:sub,status:"paid",amount_paid:3000}));
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
