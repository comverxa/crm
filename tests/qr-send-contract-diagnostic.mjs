const r=await fetch("https://app.comverxa.com.br/",{signal:AbortSignal.timeout(20000)});
if(!r.ok)throw Error("CRM public page unavailable "+r.status);
const html=await r.text();
for(const needle of ["async function sendReply","function sendReply","async function openThread","function openThread","async function api(","function api(","/api/inbox/"]){
 const pos=html.indexOf(needle);
 const snippet=pos<0?"not found":html.slice(pos,Math.min(html.length,pos+2600))
  .replace(/\b(?:\+?\d{11,15})\b/g,"[REDACTED_PHONE]")
  .replace(/(?:Bearer\s+)[A-Za-z0-9_.-]+/g,"Bearer [REDACTED]");
 console.log("CONTRACT",needle,JSON.stringify(snippet));
}

const formStart=html.search(/<form[^>]*id=["']leadForm["']/i);
const formEnd=formStart>=0?html.indexOf("</form>",formStart):-1;
const form=formStart>=0&&formEnd>formStart?html.slice(formStart,formEnd+7):"";
const fields=[...form.matchAll(/<(?:input|select|textarea)\\b[^>]*name=["']([^"']+)["']/gi)].map(m=>m[1]);
const optinFlags=["consent","opt_in","marketing_consent","consent_evidence","approved","opt_out"].map(k=>({name:k,inLeadForm:fields.includes(k),mentionedInApp:html.includes(k)}));
console.log("LEAD_FORM_CONTRACT",JSON.stringify({formPresent:form.length>0,namedFieldCount:fields.length,fields:fields.filter(x=>!/password|token|secret/i.test(x)),optinFlags}));

console.log("LEAD_FORM_STRUCTURE",JSON.stringify({markup:form.slice(0,2200),length:form.length}));

const needles=["async function saveLead","function saveLead","async function editLead","function editLead","async function loadLeads","function loadLeads","async function renderLeads","function renderLeads","name=\"optin\"","optin:"];
for(const needle of needles){
 const pos=html.indexOf(needle);
 const snippet=pos<0?"not found":html.slice(pos,Math.min(html.length,pos+2000));
 console.log("CONSENT_CONTRACT",needle,JSON.stringify(snippet));
}
