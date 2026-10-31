/**
 * COMVERXA Commercial — tenant administration, licensing sandbox and separation.
 * Not a payment processor. Tenant switching and cross-tenant reads are prohibited.
 */
const ID=/^[a-zA-Z0-9_.:-]{1,100}$/;
const NAME=/^[\p{L}\p{N}\s.,()&'-]{2,100}$/u;
import {COMVERXA_PRICING} from "./commercial-premium-pricing.mjs";
const PLANS=new Set(Object.keys(COMVERXA_PRICING));
function id(s){if(typeof s!=="string"||!ID.test(s))throw Error("Invalid tenant id");return s}
function name(s){if(typeof s!=="string"||!NAME.test(s.trim()))throw Error("Invalid company name");return s.trim()}
function dbStmt(db,sql){return typeof db.query==="function"?db.query(sql):db.prepare(sql)}
export function createTenantStore(db){
 db.exec("CREATE TABLE IF NOT EXISTS cvx_pilot_tenants (id TEXT PRIMARY KEY,name TEXT NOT NULL,plan TEXT NOT NULL,status TEXT NOT NULL,seat_limit INTEGER NOT NULL,billing_mode TEXT NOT NULL DEFAULT 'sandbox',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)");
 if(!dbStmt(db,"PRAGMA table_info(cvx_pilot_tenants)").all().some(c=>c.name==="product_mode"))
  db.exec("ALTER TABLE cvx_pilot_tenants ADD COLUMN product_mode TEXT NOT NULL DEFAULT 'enterprise'");
 db.exec("CREATE INDEX IF NOT EXISTS cvx_pilot_tenants_status ON cvx_pilot_tenants(status)");
 function normalize(row){return row?{id:row.id,name:row.name,plan:row.plan,status:row.status,seatLimit:row.seat_limit,billingMode:row.billing_mode,productMode:row.product_mode||"enterprise",createdAt:row.created_at}:null}
 function ensureTenant(tenantId,displayName,productMode=null){
  id(tenantId);
  if(productMode!==null&&!["individual","enterprise"].includes(productMode))throw Error("Invalid product mode");
  const existing=dbStmt(db,"SELECT * FROM cvx_pilot_tenants WHERE id=?").get(tenantId);
  if(existing){
   if(productMode!==null&&(existing.product_mode||"enterprise")!==productMode)
    throw Error("Product mode mismatch: refusing to reuse an existing CRM database");
   return normalize(existing);
  }
  const now=new Date().toISOString(),mode=productMode||"enterprise";
  dbStmt(db,"INSERT INTO cvx_pilot_tenants(id,name,plan,status,seat_limit,billing_mode,product_mode,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
   .run(tenantId,name(displayName),mode==="individual"?"starter":"business","active",mode==="individual"?1:20,"sandbox",mode,now,now);
  return normalize(dbStmt(db,"SELECT * FROM cvx_pilot_tenants WHERE id=?").get(tenantId));
 }
 return {
  ensureTenant,
  current(tenantId){id(tenantId);return normalize(dbStmt(db,"SELECT * FROM cvx_pilot_tenants WHERE id=?").get(tenantId))},
  list(){return dbStmt(db,"SELECT * FROM cvx_pilot_tenants ORDER BY created_at ASC LIMIT 501").all().map(normalize)},
  create({tenantId,companyName,plan="starter",seatLimit,productMode="enterprise"}={}){
   id(tenantId);name(companyName);
   if(!PLANS.has(plan))throw Error("Invalid plan");
   if(!["individual","enterprise"].includes(productMode))throw Error("Invalid product mode");
   const includedSeats=COMVERXA_PRICING[plan].seats;
   if(seatLimit===undefined)seatLimit=includedSeats;
   if(!Number.isSafeInteger(seatLimit)||seatLimit<1||seatLimit>includedSeats||(productMode==="individual"&&seatLimit!==1))
    throw Error("Seat limit exceeds the plan allowance");
   const now=new Date().toISOString();
   dbStmt(db,"INSERT INTO cvx_pilot_tenants(id,name,plan,status,seat_limit,billing_mode,product_mode,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(tenantId,companyName.trim(),plan,"active",seatLimit,"sandbox",productMode,now,now);
   return this.current(tenantId);
  },
  setStatus(tenantId,status){
   id(tenantId);if(!["active","suspended"].includes(status))throw Error("Invalid status");
   const now=new Date().toISOString();
   const r=dbStmt(db,"UPDATE cvx_pilot_tenants SET status=?,updated_at=? WHERE id=?").run(status,now,tenantId);
   if(!r.changes)throw Error("Not found");return this.current(tenantId);
  },
  setBrand(tenantId,companyName){
   id(tenantId);const now=new Date().toISOString();
   const r=dbStmt(db,"UPDATE cvx_pilot_tenants SET name=?,updated_at=? WHERE id=? AND status='active'").run(name(companyName),now,tenantId);
   if(!r.changes)throw Error("Not found");return this.current(tenantId);
  },
  seatCount(tenantId){id(tenantId);return Number(dbStmt(db,"SELECT COUNT(*) AS total FROM cvx_pilot_users WHERE tenant_id=? AND active=1").get(tenantId).total)},
  isEnabled(tenantId){return this.current(tenantId)?.status==="active"}
 };
}
