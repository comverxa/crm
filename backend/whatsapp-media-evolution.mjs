/**
 * COMVERXA | Evolution QR - envio de imagens e mensagens de voz.
 * Adaptador independente: NÃO publica uma rota por conta própria.
 *
 * Integrar SOMENTE após conectar os callbacks de autenticação de sessão,
 * autorização multi-tenant, proteção CSRF e deduplicação persistente do CRM.
 *
 * O navegador informa APENAS conversationId e arquivo. Nunca aceitar
 * número de destino ou nome da instância da requisição.
 */
const IMAGE = new Set(["image/png", "image/jpeg", "image/webp"]);
const AUDIO = new Set(["audio/ogg", "audio/webm", "audio/mp4", "audio/mpeg"]);
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_AUDIO = 12 * 1024 * 1024;

const reply = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }
  });

function signatureIsAllowed(bytes, mime) {
  const head = bytes.subarray(0, 20);
  if (mime === "image/png") return head.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i)=>head[i] === v);
  if (mime === "image/jpeg") return head.length >= 3 && head[0] === 255 && head[1] === 216 && head[2] === 255;
  if (mime === "image/webp") return Buffer.from(head.subarray(0,4)).toString() === "RIFF" && Buffer.from(head.subarray(8,12)).toString() === "WEBP";
  if (mime === "audio/ogg") return Buffer.from(head.subarray(0,4)).toString() === "OggS";
  if (mime === "audio/webm") return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  if (mime === "audio/mp4") return Buffer.from(head.subarray(4,8)).toString() === "ftyp";
  if (mime === "audio/mpeg") return Buffer.from(head.subarray(0,3)).toString() === "ID3" || (head[0] === 0xff && (head[1]&0xe0) === 0xe0);
  return false;
}

function inferMime(file) {
  const t = String(file.type || "").split(";")[0].toLowerCase().trim();
  if (IMAGE.has(t) || AUDIO.has(t)) return t;
  // MediaRecorder do Safari/iOS pode retornar MIME genérico.
  const name = String(file.name || "").toLowerCase();
  const ext = name.split(".").at(-1);
  return ({png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",
    ogg:"audio/ogg",opus:"audio/ogg",webm:"audio/webm",
    m4a:"audio/mp4",mp4:"audio/mp4",mp3:"audio/mpeg"})[ext] || "";
}
function safeName(name, mime) {
  const ext = ({"image/png":"png","image/jpeg":"jpg","image/webp":"webp",
    "audio/ogg":"ogg","audio/webm":"webm","audio/mp4":"m4a","audio/mpeg":"mp3"})[mime];
  return String(name || "anexo").replace(/[^a-zA-Z0-9_.-]/g,"_").slice(0,65).replace(/\.[^.]+$/,"") + "." + ext;
}

/**
 * @param {{
 *   authorizeConversation: (request:Request, conversationId:string)=>Promise<
 *     null|{instance:string,recipient:string,tenantId:string,line:number}>,
 *   authorizeCsrf:(request:Request)=>Promise<boolean>,
 *   reserveSend:(tenantId:string, idempotencyKey:string)=>Promise<"reserved"|"duplicate">,
 *   finishSend:(tenantId:string, idempotencyKey:string, data:object)=>Promise<void>,
 *   evolutionUrl:string, evolutionApiKey:string, fetchImpl?:typeof fetch
 * }} deps
 */
export function makeMediaHandler(deps) {
  for (const k of ["authorizeConversation","authorizeCsrf","reserveSend","finishSend"]) {
    if (typeof deps[k] !== "function") throw new Error("Adaptador não configurado: " + k);
  }
  const base = new URL(deps.evolutionUrl);
  if (!["https:","http:"].includes(base.protocol) || base.username || base.password || base.search)
    throw new Error("Evolution URL inválida");
  if (!deps.evolutionApiKey) throw new Error("Evolution API key ausente");
  const fetcher = deps.fetchImpl || fetch;
  return async function sendMedia(request) {
    if (request.method !== "POST") return reply({error:"Método não permitido"},405);
    try {
      const url = new URL(request.url);
      if (url.pathname !== "/api/comverxa/whatsapp/media") return reply({error:"Rota não encontrada"},404);
      if (!(await deps.authorizeCsrf(request))) return reply({error:"Sessão/CSRF inválido"},403);
      const form = await request.formData();
      const conversationId = String(form.get("conversationId") || "");
      if (!/^[a-zA-Z0-9_-]{1,96}$/.test(conversationId)) return reply({error:"Conversa inválida"},400);
      const authorized = await deps.authorizeConversation(request, conversationId);
      if (!authorized) return reply({error:"Conversa não autorizada"},403);
      // O tenant, a linha e o destinatário devem ser derivados do banco AUTORIZADO.
      if (!authorized.tenantId || !Number.isInteger(authorized.line) ||
          !/^[\w-]{1,70}$/.test(authorized.instance) ||
          !/^\d{10,15}$/.test(authorized.recipient)) return reply({error:"Canal não configurado"},422);
      const attachment = form.get("file");
      if (!(attachment instanceof File)) return reply({error:"Selecione uma imagem ou áudio"},400);
      const mime = inferMime(attachment);
      const image = IMAGE.has(mime), audio = AUDIO.has(mime);
      const limit = image ? MAX_IMAGE : audio ? MAX_AUDIO : 0;
      if (!limit || attachment.size < 1 || attachment.size > limit) return reply({error:"Tipo ou tamanho não permitido"},413);
      const bytes = new Uint8Array(await attachment.arrayBuffer());
      if (!signatureIsAllowed(bytes, mime)) return reply({error:"Formato de arquivo inválido"},415);
      const caption = String(form.get("caption") || "").trim().slice(0,1024);
      const idempotencyKey = String(form.get("idempotencyKey") || "");
      if (!/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey)) return reply({error:"Identificador de envio inválido"},400);
      if (await deps.reserveSend(authorized.tenantId,idempotencyKey) !== "reserved") return reply({error:"Envio já solicitado; atualize o histórico antes de tentar novamente"},409);
      const endpoint = image ? "sendMedia" : "sendWhatsAppAudio";
      const payload = image
        ? {number:authorized.recipient, mediatype:"image", mimetype:mime,
           media:Buffer.from(bytes).toString("base64"), fileName:safeName(attachment.name,mime), caption}
        : {number:authorized.recipient, audio:Buffer.from(bytes).toString("base64"), encoding:true};
      const path = "/message/" + endpoint + "/" + encodeURIComponent(authorized.instance);
      const target = new URL(base.href); target.pathname = base.pathname.replace(/\/$/,"") + path;
      const provider = await fetcher(target.href, {
        method:"POST",headers:{"Content-Type":"application/json",apikey:deps.evolutionApiKey},
        body:JSON.stringify(payload),signal:AbortSignal.timeout(45000),redirect:"error"
      });
      let providerResponse = {};
      try { providerResponse = await provider.json(); } catch {}
      const externalMessageId = providerResponse?.key?.id || providerResponse?.data?.key?.id || null;
      // Confirmação do fornecedor não é confirmação de entrega no destinatário.
      const result = {ok:provider.ok,providerAccepted:provider.ok,messageId:externalMessageId,
        type:image?"image":"audio",conversationId,line:authorized.line};
      await deps.finishSend(authorized.tenantId,idempotencyKey,result);
      if (!provider.ok) return reply({error:"Falha no envio pelo provedor",providerStatus:provider.status},502);
      return reply(result,202);
    } catch (e) {
      // Não registrar chaves, mídia, números nem dados de clientes.
      return reply({error:"Não foi possível concluir o envio. Verifique o histórico antes de repetir."},503);
    }
  };
}
