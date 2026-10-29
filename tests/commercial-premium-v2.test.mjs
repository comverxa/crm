import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {teamDashboard,validateSellerPlan} from "../backend/commercial-premium-team.mjs";
import {createCommercialStore} from "../backend/commercial-premium-store.mjs";
import {createCommercialHttpHandler} from "../backend/commercial-premium-http.mjs";
import {makeCommercialReport,makeCommercialCsv} from "../backend/commercial-premium-reports.mjs";

const manager={tenantId:"A",userId:"m1",role:"manager"};
const other={tenantId:"B",userId:"m2",role:"admin"};
const operator={tenantId:"A",userId:"s1",role:"operator"};
const otherOperator={tenantId:"A",userId:"s2",role:"operator"};
const basic={tiers:[{minSales:0,bonusCents:0},{minSales:2,bonusCents:10000},{minSales:4,bonusCents:25000}],
 salesRateBps:1000,activationRateBps:100,recurringRateBps:50,fixedSalaryCents:100000};
const sale=(id,sellerId,premiumCents=10000,tenantId="A")=>({id,tenantId,sellerId,soldAt:"2026-10-15",
 status:"sold",premiumCents,activationCents:0,recurringCents:0,commissionState:"effective"});

test("individual seller goal differs from team goal and bonuses do not apply to group volume",()=>{
 const sales=[sale("1","s1"),sale("2","s2"),sale("3","s2")];
 const plans=[{tenantId:"A",sellerId:"s1",...basic,tiers:[{minSales:0,bonusCents:0},{minSales:1,bonusCents:5000}]},
 {tenantId:"A",sellerId:"s2",...basic},
 {tenantId:"B",sellerId:"secret",...basic}];
 const result=teamDashboard({session:manager,sales:[...sales,sale("B1","secret",999999,"B")],
  plans,month:"2026-10",asOf:"2026-10-20",defaultRules:basic,teamTargetSales:10});
 assert.equal(result.sellerCount,2);
 assert.equal(result.totals.sales,3);
 assert.equal(result.totals.achievedBonusCents,15000);
 assert.equal(result.teamGoal.remainingSales,7);
 assert.equal(result.teamGoal.completionPct,30);
 assert.deepEqual(result.rows.map(r=>r.sellerId),["s2","s1"]);
 assert.ok(!JSON.stringify(result).includes("secret"));
 assert.equal(result.totals.effectiveCommissionCents,3000);
 assert.throws(()=>teamDashboard({session:operator,sales,plans,month:"2026-10",asOf:"2026-10-20",defaultRules:basic}),/Forbidden/);
 assert.throws(()=>validateSellerPlan({tenantId:"A",sellerId:"s1",tiers:[{minSales:1,bonusCents:-1}]}),/Invalid amount/);
});
test("seller cannot release their own commission nor rewrite a closed sale",()=>{
 const db=new DatabaseSync(":memory:");
 try{
 const store=createCommercialStore(db);
 store.saveRules(manager,basic);store.saveRules(other,basic);
 const initial=store.upsertSale(operator,sale("sale-1","s1"));
 assert.equal(initial.commissionState,"retained");
 assert.equal(store.snapshot(operator,{month:"2026-10",asOf:"2026-10-20"}).commissions.effectiveCents,0);
 assert.equal(store.snapshot(operator,{month:"2026-10",asOf:"2026-10-20"}).commissions.retainedCents,1000);
 assert.throws(()=>store.upsertSale(operator,{...sale("sale-1","s1"),premiumCents:999000}),/Forbidden/);
 store.upsertSale(manager,sale("sale-1","s1"));
 assert.equal(store.snapshot(operator,{month:"2026-10",asOf:"2026-10-20"}).commissions.effectiveCents,1000);
 assert.ok(store.listAudit(manager).some(x=>x.action==="COMMISSION_RELEASED"));
 assert.equal(store.listSales(other,"2026-10").length,0);
 }finally{db.close()}
});
test("seller plans persist by tenant and cannot be edited by operators",()=>{
 const db=new DatabaseSync(":memory:");
 try{
 const store=createCommercialStore(db);store.saveRules(manager,{...basic,teamTargetSales:6});store.saveRules(other,basic);
 const plan=store.saveSellerPlan(manager,{sellerId:"s1",tiers:[{minSales:0,bonusCents:0},{minSales:1,bonusCents:4000}]});
 assert.equal(plan.salesRateBps,1000);
 store.saveSellerPlan(other,{sellerId:"s1",tiers:[{minSales:0,bonusCents:0},{minSales:3,bonusCents:9000}]});
 assert.equal(store.listSellerPlans(manager)[0].tiers[1].minSales,1);
 assert.equal(store.listSellerPlans(other)[0].tiers[1].minSales,3);
 assert.throws(()=>store.saveSellerPlan(operator,{sellerId:"s1",tiers:basic.tiers}),/Forbidden/);
 assert.throws(()=>store.saveSellerPlan(manager,{tenantId:"B",sellerId:"s1",tiers:basic.tiers}),/Not found/);
 store.upsertSale(manager,sale("sale-1","s1"));
 const dash=store.teamSummary(manager,{month:"2026-10",asOf:"2026-10-20"});
 assert.equal(dash.totals.achievedBonusCents,4000);
 assert.equal(dash.teamGoal.remainingSales,5);
 }finally{db.close()}
});
test("print report escapes HTML and CSV prevents spreadsheet formulas",()=>{
 const summary={counts:{sold:1},revenueCents:10000,commissions:{effectiveCents:1000,retainedCents:0},target:{achievedBonusCents:0,completionPct:50}};
 const team={totals:{},rows:[{sellerId:'<img src=x onerror=alert(1)>',sales:1,lost:0,negotiation:0,amountCents:10000,effectiveCommissionCents:1000,retainedCommissionCents:0,achievedBonusCents:0,remainingSales:1}]};
 const html=makeCommercialReport({period:"2026-10",asOf:"2026-10-20",subject:'<script>alert(1)</script>',summary,team});
 assert.ok(html.includes("&lt;script&gt;"));
 assert.ok(html.includes("&lt;img"));
 assert.ok(!html.includes("onclick="));
 assert.ok(!html.includes('<script>alert(1)</script>'));
 const csv=makeCommercialCsv({period:"2026-10",team:{rows:[{...team.rows[0],sellerId:"=HYPERLINK(1)"}]}});
 assert.ok(csv.includes("\"'=HYPERLINK(1)\""));
 assert.ok(csv.startsWith("\uFEFF"));
});
test("HTTP reports return role-filtered data, proper security headers and no cross-tenant bleed",async()=>{
 const db=new DatabaseSync(":memory:");
 try{
 const store=createCommercialStore(db);store.saveRules(manager,basic);store.saveRules(other,basic);
 store.upsertSale(manager,sale("1","s1"));store.upsertSale(other,sale("2","other",40000,"B"));
 let who=operator;
 const app=createCommercialHttpHandler({store,enabled:true,getSession:async()=>who,verifyCsrf:async()=>true});
 const get=path=>new Request("https://crm.test"+path);
 const month="?month=2026-10&asOf=2026-10-20";
 const operatorReport=await app(get("/api/commercial/report/print"+month));
 assert.equal(operatorReport.status,200);
 assert.match(operatorReport.headers.get("content-security-policy"),/frame-ancestors 'none'/);
 const reportHtml=await operatorReport.text();
 assert.ok(!reportHtml.includes("other"));
 assert.equal((await app(get("/api/commercial/report.csv"+month))).status,403);
 assert.equal((await app(get("/api/commercial/team"+month))).status,403);
 assert.equal((await app(get("/api/commercial/seller-plans"))).status,403);
 who=manager;
 const teamResponse=await app(get("/api/commercial/team"+month));
 assert.equal((await teamResponse.json()).totals.sales,1);
 const csv=await app(get("/api/commercial/report.csv"+month));
 assert.equal(csv.status,200);assert.match(csv.headers.get("content-disposition"),/attachment/);
 assert.ok(!(await csv.text()).includes("other"));
 who=other;
 const otherTeam=await app(get("/api/commercial/team"+month));
 assert.equal((await otherTeam.json()).totals.amountCents,40000);
 }finally{db.close()}
});

test("invalid team goal is rejected before persisting",()=>{
 const db=new DatabaseSync(":memory:");try{const store=createCommercialStore(db);assert.throws(()=>store.saveRules(manager,{...basic,teamTargetSales:-3}),/Invalid team goal/);assert.equal(store.getRules(manager),null)}finally{db.close()}
});
