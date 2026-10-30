/**
 * Public COMVERXA pilot catalog. Monetary amounts use BRL cents.
 * Catalog prices are approved proposed launch values, NOT proof that live
 * payment processing or an entitlement service has been enabled.
 */
export const COMVERXA_PRICING=Object.freeze({
 starter:Object.freeze({name:"Starter",monthlyCents:9990,annualCents:99900,seats:1}),
 professional:Object.freeze({name:"Professional",monthlyCents:21990,annualCents:219900,seats:3}),
 business:Object.freeze({name:"Business",monthlyCents:39990,annualCents:399900,seats:8})
});
export function publicPriceCatalog(){
 return Object.fromEntries(Object.entries(COMVERXA_PRICING).map(([key,plan])=>[key,{
  ...plan,annualSavingsCents:plan.monthlyCents*12-plan.annualCents,
  currency:"brl",monthlyInterval:"month",annualInterval:"year",
  priceType:"test_catalog",realPaymentsEnabled:false
 }]));
}
export function validateCatalogPrices({monthly={},annual={}}={}){
 for(const [plan,configured] of Object.entries(COMVERXA_PRICING)){
  for(const pair of [{cycle:"monthly",prices:monthly},{cycle:"annual",prices:annual}]){
   const value=pair.prices[plan];
   if(value!==undefined&&value!==null&&value!==""&&!/^price_[A-Za-z0-9]+$/.test(value))
    throw Error("Invalid "+plan+" "+pair.cycle+" Stripe TEST price ID");
  }
 }
 return true;
}
