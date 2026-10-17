/**
 * COMVERXA – proxy de visualização de mídia WhatsApp com autorização por mensagem.
 *
 * Faz parte da feature em revisão; NÃO integrar sem implementar o callback
 * authorizeMessage para validar (sessão, empresa, linha, conversa e mensagem).
 * Nenhuma credencial da Evolution é exposta ao navegador.
 */
const ALLOWED_MIME = new Set([
 "image/jpeg","image/png","image/webp",
 "audio/ogg","audio/webm","audio/mp4","audio/mpeg"
]);
const MAX_BYTES = 16*1024*1024;
const noStore = {"Cache-Control":"no-store, private", "X-Content-Type-Options":"nosniff",
 "Cross-Origin-Resource-Policy":"same-origin", "X-Frame-Options":"DENY"};

const responseError = (code, message)=>new Response(JSON.stringify({error:message}),
  {status:code,headers:{...noStore,"Content-Type":"application/json; charset=utf-8"}});

/**
 * @param {{
 * authorizeMessage: (req:Request, conversationId:string, messageId:string)=>Promise<
 *   null|{tenantId:string, instance:string, providerMessageId:string, type:"audio"|"image"}>,
 * evolutionUrl:string, evolutionApiKey:string,
 * rateLimit:(req:Request, tenantId:string)=>Promise<boolean>,
 * fetchImpl?:typeof fetch
 * }} deps
 */
export function makeMediaViewHandler(deps){
 if (typeof deps?.authorizeMessage!=="function" || typeof deps.rateLimit!=="function")
  throw new Error("Integração não configurada: autenticação e limitação obrigatórias");
 if (!deps.evolutionApiKey)throw new Error("Evolution API key ausente");
 const origin = new URL(deps.evolutionUrl);
 if (!["https:","http:"].includes(origin.protocol) || origin.username || origin.password || origin.search)
  throw new Error("URL Evolution inválida");
 const fetcher = deps.fetchImpl || fetch;
 return async (req)=>{
  if(req.method!=="GET")return responseError(405,"Método não permitido");
  try{
   const reqUrl = new URL(req.url);
   if(reqUrl.pathname!=="/api/comverxa/whatsapp/media/view")return responseError(404,"Rota não encontrada");
   const conv=String(reqUrl.searchParams.get("conversationId")||"");
   const mid=String(reqUrl.searchParams.get("messageId")||"");
   if(!/^[\w-]{1,96}$/.test(conv)||!/^[\w-]{1,128}$/.test(mid))return responseError(400,"Mensagem inválida");
   // As chaves fornecidas na URL são identificadores internos; busque
   // instância/providerMessageId SOMENTE a partir do banco autenticado.
   const msg=await deps.authorizeMessage(req,conv,mid);
   if(!msg)return responseError(403,"Mensagem não autorizada");
   if(!msg.tenantId || !/^[\w-]{1,70}$/.test(msg.instance)
      || !/^[\w-]{1,160}$/.test(msg.providerMessageId)
      || !["audio","image"].includes(msg.type))return responseError(422,"Mídia indisponível");
   if(!(await deps.rateLimit(req,msg.tenantId)))return responseError(429,"Muitas consultas");
   const url = new URL(origin);
   url.pathname = origin.pathname.replace(/\/$/,"") +
    "/chat/getBase64FromMediaMessage/" + encodeURIComponent(msg.instance);
   const provider = await fetcher(url.href,{
     method:"POST", headers:{"Content-Type":"application/json",apikey:deps.evolutionApiKey},
     body:JSON.stringify({message:{key:{id:msg.providerMessageId}},convertToMp4:false}),
     signal:AbortSignal.timeout(30000),redirect:"error"
   });
   if(!provider.ok)return responseError(502,"Mídia indisponível no provedor");
   const json=await provider.json();
   const content=json?.data?.base64||json?.base64;
   const mime=String(json?.data?.mimetype||json?.mimetype||"").split(";")[0].toLowerCase();
   const kind=mime.startsWith("image/")?"image":mime.startsWith("audio/")?"audio":"unknown";
   if(!ALLOWED_MIME.has(mime)||kind!==msg.type)return responseError(415,"Formato de mídia não permitido");
   if(typeof content!=="string")return responseError(502,"Resposta inválida do provedor");
   // Aceita base64 puro ou prefixo MIME, sem permitir tipo alternativo.
   const marker=content.match(/^data:([^;,]+);base64,/i);
   if(marker && marker[1].toLowerCase()!==mime)return responseError(415,"MIME divergente");
   const raw=marker?content.slice(marker[0].length):content;
   if(raw.length>Math.ceil(MAX_BYTES/3)*4+8 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(raw))
     return responseError(413,"Mídia grande ou inválida");
   const bytes=Buffer.from(raw,"base64");
   if(bytes.length<1||bytes.length>MAX_BYTES)return responseError(413,"Mídia grande ou vazia");
   return new Response(bytes,{status:200,headers:{
    ...noStore,"Content-Type":mime, "Content-Disposition":"inline",
    "Content-Security-Policy":"default-src 'none'; sandbox",
    "Content-Length":String(bytes.length)
   }});
  }catch{return responseError(503,"Não foi possível abrir a mídia");}
 };
}
