/**
 * COMVERXA Premium Comercial — SQLite adapter, isolated and not mounted in production.
 * Inject a Bun or Node SQLite connection. The caller MUST validate the session on
 * the server and take encrypted backups before using this with real customer data.
 */
import {assertScope,assertWriteScope,validateRules,salesSnapshot,renewalQueue,money} from "./commercial-premium-core.mjs";
import {validateSellerPlan,teamDashboard} from "./commercial-premium-team.mjs";
const ident=/^[a-zA-Z0-9_.:-]{1,100}$/;
function id(s){if(typeof s!=="string"||!ident.test(s))throw Error("Invalid id");return s}
function date(s){if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+"T00:00:00Z"))||new Date(s+"T00:00:00Z").toISOString().slice(0,10)!==s)throw Error("Invalid date");return s}
function stmt(db,sql){return typeof db.query==="function"?db.query(sql):db.prepare(sql)}
function audit(db,s,action,entity){
 stmt(db,"INSERT INTO cvx_comm_audit (tenant_id,actor_id,action,entity_id,created_at) VALUES (?,?,?,?,?)")
  .run(s.tenantId,s.userId,action,entity,new Date().toISOString());
}
function tx(db,fn){db.exec("BEGIN IMMEDIATE");try{const v=fn();db.exec("COMMIT");return v}catch(e){db.exec("ROLLBACK");throw e}}
function oneOf(x,allowed){if(!allowed.includes(x))throw Error("Invalid enum");return x}
function sale(r){return {id:r.id,tenantId:r.tenant_id,sellerId:r.seller_id,soldAt:r.sold_at,status:r.status,
 premiumCents:r.premium_cents,activationCents:r.activation_cents,recurringCents:r.recurring_cents,commissionState:r.commission_state}}
function policy(r){return {id:r.id,tenantId:r.tenant_id,sellerId:r.seller_id,productType:r.product_type,status:r.status,
 startsOn:r.starts_on,endsOn:r.ends_on,vehicleRef:r.vehicle_ref,vehiclePlateMasked:r.vehicle_plate_masked,externalContractRef:r.external_contract_ref}}
export function createCommercialStore(db){
 if(!db||typeof db.exec!=="function"||(typeof db.query!=="function"&&typeof db.prepare!=="function"))throw Error("SQLite connection required");
 db.exec("CREATE TABLE IF NOT EXISTS cvx_comm_rules (tenant_id TEXT PRIMARY KEY,rules_json TEXT NOT NULL,updated_at TEXT NOT NULL,actor_id TEXT NOT NULL)");
 db.exec("CREATE TABLE IF NOT EXISTS cvx_comm_sales (tenant_id TEXT NOT NULL,id TEXT NOT NULL,seller_id TEXT NOT NULL,sold_at TEXT NOT NULL,status TEXT NOT NULL,premium_cents INTEGER NOT NULL,activation_cents INTEGER NOT NULL,recurring_cents INTEGER NOT NULL,commission_state TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(tenant_id,id))");
 db.exec("CREATE INDEX IF NOT EXISTS cvx_comm_sales_month ON cvx_comm_sales(tenant_id,sold_at,seller_id)");
 db.exec("CREATE TABLE IF NOT EXISTS cvx_comm_policies (tenant_id TEXT NOT NULL,id TEXT NOT NULL,seller_id TEXT NOT NULL,product_type TEXT NOT NULL,status TEXT NOT NULL,starts_on TEXT NOT NULL,ends_on TEXT NOT NULL,vehicle_ref TEXT,vehicle_plate_masked TEXT,external_contract_ref TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(tenant_id,id))");
 db.exec("CREATE INDEX IF NOT EXISTS cvx_comm_policies_due ON cvx_comm_policies(tenant_id,status,ends_on)");
 db.exec("CREATE TABLE IF NOT EXISTS cvx_comm_seller_plans (tenant_id TEXT NOT NULL,seller_id TEXT NOT NULL,plan_json TEXT NOT NULL,updated_at TEXT NOT NULL,actor_id TEXT NOT NULL,PRIMARY KEY(tenant_id,seller_id))");
 db.exec("CREATE TABLE IF NOT EXISTS cvx_comm_audit (event_id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,entity_id TEXT NOT NULL,created_at TEXT NOT NULL)");
 db.exec("CREATE INDEX IF NOT EXISTS cvx_comm_audit_scope ON cvx_comm_audit(tenant_id,event_id)");
 return {
  saveRules(s,input){
   assertScope(s);if(!["master","admin","manager"].includes(s.role))throw Error("Forbidden");
   const rules=validateRules(input),now=new Date().toISOString();
   tx(db,()=>{stmt(db,"INSERT INTO cvx_comm_rules (tenant_id,rules_json,updated_at,actor_id) VALUES (?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET rules_json=excluded.rules_json,updated_at=excluded.updated_at,actor_id=excluded.actor_id").run(s.tenantId,JSON.stringify(rules),now,s.userId);audit(db,s,"RULES_UPDATED","rules")});
   return rules;
  },
  getRules(s){assertScope(s);const r=stmt(db,"SELECT rules_json FROM cvx_comm_rules WHERE tenant_id=?").get(s.tenantId);return r?validateRules(JSON.parse(r.rules_json)):null},
  upsertSale(s,v){
   assertScope(s);if(!v||typeof v!=="object")throw Error("Invalid sale");
   if(v.tenantId!==undefined&&v.tenantId!==s.tenantId)throw Error("Not found");
   const a={id:id(v.id),sellerId:id(v.sellerId),soldAt:date(v.soldAt),
    status:oneOf(v.status,["lead","negotiation","proposal","sold","active","lost","canceled"]),
    premiumCents:money(v.premiumCents??0),activationCents:money(v.activationCents??0),recurringCents:money(v.recurringCents??0),
    commissionState:s.role==="operator"?"retained":oneOf(v.commissionState??"retained",["effective","retained"])};
   assertWriteScope(s,s.tenantId,a.sellerId);
   const prior=stmt(db,"SELECT seller_id,status,commission_state FROM cvx_comm_sales WHERE tenant_id=? AND id=?").get(s.tenantId,a.id);
   if(prior&&s.role==="operator"&&(prior.seller_id!==s.userId||["sold","active"].includes(prior.status)))throw Error("Forbidden");
   const now=new Date().toISOString();
   const sql="INSERT INTO cvx_comm_sales (tenant_id,id,seller_id,sold_at,status,premium_cents,activation_cents,recurring_cents,commission_state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,id) DO UPDATE SET seller_id=excluded.seller_id,sold_at=excluded.sold_at,status=excluded.status,premium_cents=excluded.premium_cents,activation_cents=excluded.activation_cents,recurring_cents=excluded.recurring_cents,commission_state=excluded.commission_state,updated_at=excluded.updated_at";
   tx(db,()=>{stmt(db,sql).run(s.tenantId,a.id,a.sellerId,a.soldAt,a.status,a.premiumCents,a.activationCents,a.recurringCents,a.commissionState,now,now);audit(db,s,prior?"SALE_UPDATED":"SALE_CREATED",a.id);if(prior?.commission_state==="retained"&&a.commissionState==="effective")audit(db,s,"COMMISSION_RELEASED",a.id)});
   return a;
  },
  listSales(s,month){
   assertScope(s);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error("Invalid month");
   const sql="SELECT * FROM cvx_comm_sales WHERE tenant_id=? AND sold_at>=? AND sold_at<=?"+(s.role==="operator"?" AND seller_id=?":"")+" ORDER BY sold_at DESC,id DESC LIMIT 10001";
   const params=[s.tenantId,month+"-01",month+"-31"];if(s.role==="operator")params.push(s.userId);
   const rows=stmt(db,sql).all(...params);if(rows.length>10000)throw Error("Result too large; paginate");
   return rows.map(sale);
  },
  upsertPolicy(s,v){
   assertScope(s);if(!v||typeof v!=="object")throw Error("Invalid policy");
   if(v.tenantId!==undefined&&v.tenantId!==s.tenantId)throw Error("Not found");
   const p={id:id(v.id),sellerId:id(v.sellerId),productType:oneOf(v.productType,["insurance","vehicle_protection","assistance","other"]),status:oneOf(v.status,["active","pending_renewal","expired","canceled"]),
    startsOn:date(v.startsOn),endsOn:date(v.endsOn),vehicleRef:v.vehicleRef==null?null:id(v.vehicleRef),
    vehiclePlateMasked:v.vehiclePlateMasked==null?null:String(v.vehiclePlateMasked).slice(0,20),
    externalContractRef:v.externalContractRef==null?null:String(v.externalContractRef).slice(0,100)};
   if(p.endsOn<p.startsOn)throw Error("Invalid policy period");
   assertWriteScope(s,s.tenantId,p.sellerId);
   const prior=stmt(db,"SELECT seller_id FROM cvx_comm_policies WHERE tenant_id=? AND id=?").get(s.tenantId,p.id);
   if(prior&&s.role==="operator"&&prior.seller_id!==s.userId)throw Error("Forbidden");
   const now=new Date().toISOString();
   const sql="INSERT INTO cvx_comm_policies (tenant_id,id,seller_id,product_type,status,starts_on,ends_on,vehicle_ref,vehicle_plate_masked,external_contract_ref,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,id) DO UPDATE SET seller_id=excluded.seller_id,product_type=excluded.product_type,status=excluded.status,starts_on=excluded.starts_on,ends_on=excluded.ends_on,vehicle_ref=excluded.vehicle_ref,vehicle_plate_masked=excluded.vehicle_plate_masked,external_contract_ref=excluded.external_contract_ref,updated_at=excluded.updated_at";
   tx(db,()=>{stmt(db,sql).run(s.tenantId,p.id,p.sellerId,p.productType,p.status,p.startsOn,p.endsOn,p.vehicleRef,p.vehiclePlateMasked,p.externalContractRef,now,now);audit(db,s,prior?"POLICY_UPDATED":"POLICY_CREATED",p.id)});
   return p;
  },
  listPolicies(s,{limit=10000}={}){
   assertScope(s);if(!Number.isInteger(limit)||limit<1||limit>10000)throw Error("Invalid limit");
   const sql="SELECT * FROM cvx_comm_policies WHERE tenant_id=?"+(s.role==="operator"?" AND seller_id=?":"")+" ORDER BY ends_on ASC LIMIT ?";
   const args=s.role==="operator"?[s.tenantId,s.userId,limit]:[s.tenantId,limit];
   return stmt(db,sql).all(...args).map(policy);
  },
  saveSellerPlan(s,input){
   assertScope(s);if(!["master","admin","manager"].includes(s.role))throw Error("Forbidden");
   if(input?.tenantId!==undefined&&input.tenantId!==s.tenantId)throw Error("Not found");
   const defaults=this.getRules(s);if(!defaults)throw Error("Commission rules not configured");
   const plan=validateSellerPlan({...defaults,...input,tenantId:s.tenantId});
   tx(db,()=>{
    stmt(db,"INSERT INTO cvx_comm_seller_plans(tenant_id,seller_id,plan_json,updated_at,actor_id) VALUES (?,?,?,?,?) ON CONFLICT(tenant_id,seller_id) DO UPDATE SET plan_json=excluded.plan_json,updated_at=excluded.updated_at,actor_id=excluded.actor_id").run(s.tenantId,plan.sellerId,JSON.stringify(plan),new Date().toISOString(),s.userId);
    audit(db,s,"SELLER_PLAN_UPDATED",plan.sellerId);
   });return plan;
  },
  listSellerPlans(s){
   assertScope(s);if(!["master","admin","manager"].includes(s.role))throw Error("Forbidden");
   return stmt(db,"SELECT plan_json FROM cvx_comm_seller_plans WHERE tenant_id=? ORDER BY seller_id ASC LIMIT 1001").all(s.tenantId).map(r=>JSON.parse(r.plan_json));
  },
  teamSummary(s,{month,asOf,teamTargetSales=null}){
   assertScope(s);if(!["master","admin","manager"].includes(s.role))throw Error("Forbidden");
   const defaultRules=this.getRules(s);if(!defaultRules)throw Error("Commission rules not configured");
   return teamDashboard({session:s,sales:this.listSales(s,month),plans:this.listSellerPlans(s),month,asOf,defaultRules,teamTargetSales:teamTargetSales??defaultRules.teamTargetSales??null});
  },
  snapshot(s,{month,asOf}){
   const rules=this.getRules(s);if(!rules)throw Error("Commission rules not configured");
   return salesSnapshot({session:s,sales:this.listSales(s,month),month,asOf,rules});
  },
  renewals(s,{asOf}){return renewalQueue({session:s,contracts:this.listPolicies(s),asOf})},
  listAudit(s,{limit=100}={}){
   assertScope(s);if(!["master","admin","manager"].includes(s.role))throw Error("Forbidden");
   if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error("Invalid limit");
   return stmt(db,"SELECT actor_id,action,entity_id,created_at FROM cvx_comm_audit WHERE tenant_id=? ORDER BY event_id DESC LIMIT ?").all(s.tenantId,limit);
  }
 };
}
