/**
 * Inspeciona apenas os marcadores do HTML público do COMVERXA.
 * Sem login, sem POST, sem ler ou escrever dados privados.
 */
const url="https://app.comverxa.com.br/";
const r=await fetch(url,{headers:{"User-Agent":"COMVERXA-ReadOnly-Release-Inspector/1"},
 redirect:"manual",signal:AbortSignal.timeout(20000)});
if(r.status!==200)throw Error("CRM login HTTP "+r.status);
const html=await r.text();
const flags={
 whatsappQrCorrection:html.includes("Enviar pela Evolution API (QR)"),
 massBudgetEstimator:html.includes("cvx-disparo-orcamento"),
 assistedQueue:html.includes("__cvxQrAssistedQueueInstalled"),
 batch10Button:html.includes("Enviar próximos 10 (QR)"),
 batch10Logic:html.includes("async function sendBatch("),
 privacyAndSecurity:UI_contains(html)
};
function UI_contains(x){return x.includes("comverxa-premium-v2")&&x.includes("cvx-inbox-channel-patch")}
for(const [name,value] of Object.entries(flags))console.log("MARKER "+name+" "+(value?"PRESENT":"ABSENT"));
console.log("READ_ONLY: arquivo HTML público, sem sessão, mensagens, números ou credenciais.");
if(!Object.values(flags).every(Boolean))process.exitCode=1;
