/**
 * COMVERXA — renderer acessível de mídias de WhatsApp no histórico.
 * Recebe ID interno de mensagem + ID interno da conversa do CRM.
 * URLs são apontadas exclusivamente para o proxy autenticado do MESMO DOMÍNIO.
 * Chamar somente para mídias já autorizadas/listadas pelo servidor.
 */
export function renderWhatsAppMedia({conversationId,messageId,type,caption=""}={}){
 if(!/^[\w-]{1,96}$/.test(String(conversationId||""))
   || !/^[\w-]{1,128}$/.test(String(messageId||""))
   || !["image","audio"].includes(type))throw new Error("Mídia inválida");
 const outer=document.createElement("div");
 outer.className="cvx-inbox-media";
 const label=document.createElement("span");
 label.textContent=type==="image"?"Imagem":"Mensagem de áudio";
 outer.append(label);
 if(caption){
   const description=document.createElement("p");
   description.textContent=String(caption).slice(0,1024);
   outer.append(description);
 }
 const button=document.createElement("button");
 button.type="button";button.className="cvx-inbox-media-show";
 button.textContent=type==="image"?"Visualizar imagem":"Ouvir áudio";
 const content=document.createElement("div");
 const status=document.createElement("span");
 status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 const endpoint = new URL("/api/comverxa/whatsapp/media/view",location.origin);
 endpoint.searchParams.set("conversationId",String(conversationId));
 endpoint.searchParams.set("messageId",String(messageId));
 button.addEventListener("click",()=>{
   button.disabled=true;
   const media=document.createElement(type==="image"?"img":"audio");
   if(media instanceof HTMLImageElement){
      media.alt=String(caption||"Imagem enviada na conversa").slice(0,240);
      media.loading="lazy";media.style.maxWidth="100%";media.style.maxHeight="350px";
   }else {media.controls=true;media.preload="none";media.setAttribute("aria-label","Mensagem de áudio");}
   media.addEventListener("error",()=>{
      status.textContent="Não foi possível abrir esta mídia. Atualize a conversa e tente novamente.";
      button.disabled=false;
   });
   media.src=endpoint.pathname+endpoint.search;
   content.replaceChildren(media);
   button.hidden=true;
   status.textContent="";
 });
 outer.append(button,content,status);
 return outer;
}
