import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {assertScope,assertWriteScope,validateRules,workdays,salesSnapshot,renewalQueue} from "../backend/commercial-premium-core.mjs";
import {createCommercialStore} from "../backend/commercial-premium-store.mjs";
const manager={tenantId:"empresa-A",userId:"gestor-A",role:"manager"};
const seller={tenantId:"empresa-A",userId:"vendedor-1",role:"operator"};
const otherSeller={tenantId:"empresa-A",userId:"vendedor-2",role:"operator"};
const companyB={tenantId:"empresa-B",userId:"gestor-B",role:"admin"};
const rules={tiers:[{minSales:0,bonusCents:0},{minSales:2,bonusCents:10000},{minSales:4,bonusCents:20000}],
 salesRateBps:1000,activationRateBps:500,recurringRateBps:200,halfSaturday:true};
const data=[
 {id:"A1",tenantId:"empresa-A",sellerId:"vendedor-1",soldAt:"2026-10-15",status:"sold",premiumCents:10000,activationCents:4000,recurringCents:2000,commissionState:"effective"},
 {id:"A2",tenantId:"empresa-A",sellerId:"vendedor-2",soldAt:"2026-10-16",status:"active",premiumCents:20000,activationCents:0,recurringCents:5000,commissionState:"retained"},
 {id:"A3",tenantId:"empresa-A",sellerId:"vendedor-2",soldAt:"2026-10-16",status:"lost",premiumCents:9000,activationCents:0,recurringCents:0,commissionState:"effective"},
 {id:"B1",tenantId:"empresa-B",sellerId:"vendedor-B",soldAt:"2026-10-16",status:"active",premiumCents:999999,activationCents:0,recurringCents:0,commissionState:"effective"}
];
test("rejects client-side or malformed session and invalid thresholds",()=>{
 assert.throws(()=>assertScope({tenantId:"x",role:"manager"}),/Unauthorized/);
 assert.throws(()=>assertScope({...seller,tenantId:""}),/Unauthorized/);
 assert.throws(()=>assertWriteScope(seller,"empresa-B","vendedor-1"),/Not found/);
 assert.throws(()=>assertWriteScope(seller,"empresa-A","vendedor-2"),/Forbidden/);
 assert.throws(()=>validateRules({...rules,tiers:[{minSales:5,bonusCents:100},{minSales:2,bonusCents:200}]}),/Tiers/);
});
test("workdays include optional half Saturdays and skip holidays",()=>{
 const noSat=workdays("2026-10","2026-10-29",{});
 const halfSat=workdays("2026-10","2026-10-29",{halfSaturday:true,holidays:["2026-10-12"]});
 assert.ok(halfSat.total>noSat.total);
 assert.ok(halfSat.elapsed<=halfSat.total);
 assert.ok(noSat.remaining>=0);
 assert.throws(()=>workdays("2026-02","2026-02-30"),/Invalid date/);
});
test("sales dashboard enforces tenant and seller permissions, uses integer cents",()=>{
 const result=salesSnapshot({session:manager,sales:data,month:"2026-10",asOf:"2026-10-20",rules});
 assert.equal(result.counts.sold,2);
 assert.equal(result.counts.lost,1);
 assert.equal(result.revenueCents,41000);
 assert.equal(result.commissions.effectiveCents,1240);
 assert.equal(result.commissions.retainedCents,2100);
 assert.equal(result.target.achievedBonusCents,10000);
 assert.equal(result.target.nextMinSales,4);
 assert.equal(result.target.remaining,2);
 assert.equal(result.sellers.length,2);
 const own=salesSnapshot({session:seller,sales:data,month:"2026-10",asOf:"2026-10-20",rules});
 assert.equal(own.counts.sold,1);
 assert.equal(own.commissions.retainedCents,0);
 assert.deepEqual(own.sellers.map(x=>x.sellerId),["vendedor-1"]);
 const b=salesSnapshot({session:companyB,sales:data,month:"2026-10",asOf:"2026-10-20",rules});
 assert.equal(b.counts.sold,1);
 assert.equal(b.sellers[0].sellerId,"vendedor-B");
});
test("renewal windows: overdue, 10-day and 30-day, never actually send reminders",()=>{
 const policies=[
  {id:"venc",tenantId:"empresa-A",sellerId:"vendedor-1",status:"active",endsOn:"2026-10-20",productType:"insurance"},
  {id:"10",tenantId:"empresa-A",sellerId:"vendedor-1",status:"active",endsOn:"2026-11-08",productType:"insurance"},
  {id:"30",tenantId:"empresa-A",sellerId:"vendedor-2",status:"active",endsOn:"2026-11-28",productType:"vehicle_protection"},
  {id:"b",tenantId:"empresa-B",sellerId:"vendedor-B",status:"active",endsOn:"2026-11-01",productType:"insurance"}
 ];
 const q=renewalQueue({session:manager,contracts:policies,asOf:"2026-10-29"});
 assert.deepEqual(q.summary,{overdue:1,within10:1,within30:1,later:0});
 assert.deepEqual(q.reminders.map(x=>[x.contractId,x.reminderWindow]),[["10",10],["30",30]]);
 assert.equal(renewalQueue({session:seller,contracts:policies,asOf:"2026-10-29"}).items.length,2);
});
test("SQLite commits isolate tenants, protect seller writes and persist audit",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  const store=createCommercialStore(db);
  store.saveRules(manager,rules);
  store.saveRules(companyB,{...rules,tiers:[{minSales:0,bonusCents:0},{minSales:7,bonusCents:15000}]});
  assert.equal(store.getRules(companyB).tiers[1].minSales,7);
  assert.throws(()=>store.saveRules(seller,rules),/Forbidden/);
  for(const item of data)store.upsertSale(item.tenantId==="empresa-B"?companyB:manager,item);
  assert.equal(store.snapshot(manager,{month:"2026-10",asOf:"2026-10-20"}).counts.sold,2);
  assert.equal(store.snapshot(companyB,{month:"2026-10",asOf:"2026-10-20"}).counts.sold,1);
  assert.equal(store.listSales(seller,"2026-10").length,1);
  assert.throws(()=>store.upsertSale(seller,{...data[1],tenantId:"empresa-A"}),/Forbidden/);
  assert.throws(()=>store.upsertSale(manager,{...data[3]}),/Not found/);
  assert.throws(()=>store.listAudit(seller),/Forbidden/);
  store.upsertPolicy(manager,{id:"policy-1",sellerId:"vendedor-1",productType:"vehicle_protection",status:"active",startsOn:"2026-01-01",endsOn:"2026-11-08",vehicleRef:"car-1",vehiclePlateMasked:"***-1D23"});
  store.upsertPolicy(companyB,{id:"policy-1",sellerId:"vendedor-B",productType:"insurance",status:"active",startsOn:"2026-01-01",endsOn:"2026-11-09"});
  assert.equal(store.renewals(seller,{asOf:"2026-10-29"}).summary.within10,1);
  assert.equal(store.listPolicies(companyB).length,1);
  assert.ok(store.listAudit(manager).some(x=>x.action==="POLICY_CREATED"));
 }finally{db.close()}
});
