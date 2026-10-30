/**
 * External smoke test: public pages and anonymous access restrictions.
 * No customer credentials and no POST requests.
 * Run from GitHub Actions to validate actual Railway ingress, TLS and responses.
 */
import assert from "node:assert/strict";
const origin=(process.env.CVX_COM_SMOKE_URL||"https://comverxa-comercial-piloto-production.up.railway.app").replace(/\/$/,"");
if(!origin.startsWith("https://"))throw Error("Public smoke test requires HTTPS");
async function get(path,{redirect="follow"}={}){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
 try{return await fetch(origin+path,{method:"GET",redirect,cache:"no-store",signal:controller.signal})}
 finally{clearTimeout(timeout)}
}
const health=await get("/healthz");
assert.equal(health.status,200,"Health endpoint must be HTTP 200");
const state=await health.json();
assert.equal(state.status,"ok");
assert.equal(state.service,"commercial-pilot");
for(const [path,expected] of [["/login","Entrar no Comercial"],["/forgot","Recuperação de acesso"]]){
 const res=await get(path);
 assert.equal(res.status,200,path+" must open");
 assert.match(res.headers.get("content-type")||"",/text\/html/);
 assert.match(res.headers.get("cache-control")||"",/no-store/);
 assert.match(res.headers.get("x-frame-options")||"",/deny/i);
 assert.ok((await res.text()).includes(expected),path+" title is missing");
}
const theme=await get("/assets/commercial-theme.css");
assert.equal(theme.status,200,"Premium theme must be publicly served");
assert.match(theme.headers.get("content-type")||"",/text\/css/);
assert.match(await theme.text(),/wa-channel-grid/);
const internal=await get("/app",{redirect:"manual"});
assert.equal(internal.status,303,"Unauthenticated app must redirect");
assert.match(internal.headers.get("location")||"",/\/login$/);
const userApi=await get("/api/auth/me");
assert.equal(userApi.status,401,"Anonymous account info must not be returned");
const backup=await get("/api/pilot/backups/status");
assert.equal(backup.status,401,"Anonymous backup status must not be returned");
const stripeStatus=await get("/api/billing/stripe/status");
assert.equal(stripeStatus.status,401,"Stripe subscription details must require authentication");
for(const endpoint of ["/api/platform/companies","/api/commercial/leads","/api/commercial/summary?month=2026-10","/api/pilot/company","/api/wa/channels","/api/wa/inbox?slot=1"]){
 const response=await get(endpoint);
 assert.equal(response.status,401,"Anonymous access must be rejected on "+endpoint);
}
console.log("COMVERXA_PUBLIC_SMOKE_OK: login, health, recovery, protected app, billing, tenant and lead APIs");
