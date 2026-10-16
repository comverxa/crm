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
