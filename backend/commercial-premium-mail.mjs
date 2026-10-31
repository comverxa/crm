/**
 * COMVERXA Pilot — Resend password recovery email adapter.
 * The API key is supplied at runtime (Railway referenced secret).
 * No emails are sent if the integration is disabled or not configured.
 */
const EMAIL_API="https://api.resend.com/emails";
export function createRecoveryMailer({apiKey,from,fetchImpl=fetch}={}){
 if(typeof apiKey!=="string"||!apiKey.startsWith("re_")||apiKey.length<8)throw Error("Resend API key not configured");
 if(typeof from!=="string"||!from.includes("@")||from.length>240)throw Error("Invalid email sender");
 return async function sendRecovery({to,resetUrl}){
  if(typeof to!=="string"||! /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to))throw Error("Invalid recipient");
  const url=new URL(resetUrl);
  if(url.protocol!=="https:")throw Error("Recovery URL requires HTTPS");
  const res=await fetchImpl(EMAIL_API,{method:"POST",headers:{
   Authorization:"Bearer "+apiKey,"content-type":"application/json",
  },body:JSON.stringify({
   from,to:[to],subject:"COMVERXA — redefinição de senha",
   text:"Solicitaram a redefinição de sua senha do COMVERXA Comercial.\n\nAcesse este link em até 15 minutos: "+url.href+
    "\n\nSe você não solicitou, ignore esta mensagem. Nenhuma senha é enviada por e-mail.",
   html:'<!doctype html><html lang="pt-BR"><body style="font:16px Arial,sans-serif;color:#15283e"><h2>COMVERXA Comercial</h2><p>Recebemos uma solicitação de redefinição de senha.</p><p>Para proteger sua conta, abra o link abaixo em até 15 minutos:</p><p><a href="'+
     url.href.replaceAll("&","&amp;").replaceAll('"',"&quot;")+'">Redefinir minha senha</a></p><p>Se não foi você, ignore esta mensagem.</p></body></html>'
  }),signal:AbortSignal.timeout(12000),redirect:"error"});
  if(!res.ok)throw Error("Transactional email provider rejected request");
  return {accepted:true};
 };
}
