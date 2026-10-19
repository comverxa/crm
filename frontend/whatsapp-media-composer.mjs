/**
 * COMVERXA - Controles de imagem e gravação de voz.
 * Módulo isolado para integrar AO compositor da conversa (não ao site comercial).
 *
 * Exemplo de uso após integrar com o CRM:
 * mountWhatsAppMediaComposer(document.querySelector('#composer'), {
 *   getConversationId: () => selectedConversationId,
 *   onSent: () => refreshCurrentConversation(),
 *   csrfToken: () => csrfTokenFromAuthenticatedSession()
 * });
 */
export function mountWhatsAppMediaComposer(container, options) {
  if (!(container instanceof HTMLElement) || typeof options?.getConversationId !== "function") {
    throw new Error("Compositor ou conversa não informados");
  }
  const host = document.createElement("section");
  host.className = "cvx-whatsapp-media";
  host.setAttribute("aria-label","Envio de imagens e áudios");
  const controls = document.createElement("div");
  controls.className = "cvx-media-actions";
  const makeButton = (label,action) => {
    const b=document.createElement("button"); b.type="button"; b.textContent=label;
    b.className="cvx-media-btn"; b.addEventListener("click",action); return b;
  };
  const imgInput = document.createElement("input");
  imgInput.type="file"; imgInput.accept="image/png,image/jpeg,image/webp";
  imgInput.hidden=true;
  const audioInput=document.createElement("input");
  audioInput.type="file"; audioInput.accept="audio/ogg,audio/webm,audio/mp4,audio/mpeg,.m4a,.mp3,.ogg,.webm";
  audioInput.hidden=true;
  const details=document.createElement("div"); details.className="cvx-media-preview";
  details.hidden=true;
  const media=document.createElement("div");
  const caption=document.createElement("input");
  caption.type="text"; caption.placeholder="Legenda da imagem (opcional)"; caption.maxLength=1024;
  const send=makeButton("Enviar anexo",()=>sendAttachment());
  const cancel=makeButton("Cancelar",()=>reset());
  const status=document.createElement("p"); status.setAttribute("role","status");
  status.setAttribute("aria-live","polite");
  status.className="cvx-media-status";
  details.append(media,caption,send,cancel);
  let file=null,mediaURL=null,recorder=null,recordingStream=null,stopping=false,recordChunks=[];
  let busy=false,requestKey=null,selectionConversationId=null;
  const recordButton=makeButton("Gravar áudio",()=>toggleRecording());
  controls.append(
    makeButton("Imagem",()=>imgInput.click()),
    makeButton("Arquivo de áudio",()=>audioInput.click()),
    recordButton
  );
  host.append(controls,imgInput,audioInput,details,status);
  container.append(host);
  const setStatus=(message)=>{status.textContent=message;};
  function stopTracks() {
    if(recordingStream){for(const track of recordingStream.getTracks())track.stop();recordingStream=null;}
  }
  function reset() {
    if(recorder?.state === "recording") {stopping=true;recorder.stop();}
    stopTracks();
    file=null;requestKey=null;selectionConversationId=null;imgInput.value="";audioInput.value="";caption.value="";
    if(mediaURL)URL.revokeObjectURL(mediaURL);
    mediaURL=null;media.replaceChildren();details.hidden=true;recordButton.textContent="Gravar áudio";
    send.disabled=false;setStatus("");
  }
  function preview(selected) {
    reset(); if(!selected)return;
    const type=String(selected.type||"").split(";")[0];
    if(!type.startsWith("image/")&&!type.startsWith("audio/")){
      setStatus("Selecione uma imagem ou áudio válido."); return;
    }
    selectionConversationId=String(options.getConversationId()||"");
    if(!selectionConversationId){setStatus("Selecione uma conversa antes de anexar.");return;}
    file=selected;mediaURL=URL.createObjectURL(file);
    const view=document.createElement(type.startsWith("image/")?"img":"audio");
    view.src=mediaURL;view.setAttribute("aria-label","Pré-visualização do anexo");
    if(view instanceof HTMLAudioElement)view.controls=true;
    else {view.alt="Imagem selecionada";view.style.maxWidth="100%";view.style.maxHeight="220px";}
    media.replaceChildren(view);details.hidden=false;
    caption.hidden=!type.startsWith("image/");
    send.textContent=type.startsWith("image/")?"Enviar imagem":"Enviar áudio";
    setStatus("Confira o anexo antes de enviar.");
  }
  imgInput.addEventListener("change",()=>preview(imgInput.files?.[0]));
  audioInput.addEventListener("change",()=>preview(audioInput.files?.[0]));
  async function toggleRecording() {
    if(busy)return;
    if(recorder?.state === "recording"){
      recorder.stop();recordButton.disabled=true;return;
    }
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
      setStatus("O navegador não permite gravação de áudio. Use Arquivo de áudio.");return;
    }
    const recordingConversation=String(options.getConversationId()||"");
    if(!recordingConversation){setStatus("Selecione uma conversa antes de gravar.");return;}
    reset();recordChunks=[];stopping=false;
    try {
      recordingStream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(String(options.getConversationId()||"")!==recordingConversation){
        stopTracks();setStatus("Conversa alterada. Grave novamente para evitar envio ao contato errado.");return;
      }
      const types=["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"];
      const supported=types.find(t=>MediaRecorder.isTypeSupported(t));
      recorder=new MediaRecorder(recordingStream,supported?{mimeType:supported}:{});
      recorder.addEventListener("dataavailable",event=>{if(event.data?.size)recordChunks.push(event.data);});
      recorder.addEventListener("stop",()=>{
        recordButton.disabled=false;stopTracks();
        if(stopping)return;
        if(String(options.getConversationId()||"")!==recordingConversation){
          recordChunks=[];
          setStatus("Conversa alterada durante a gravação. Áudio descartado para proteger o destinatário.");
          return;
        }
        const typ=recorder.mimeType||supported||"audio/webm";
        const ext=typ.includes("mp4")?"m4a":typ.includes("ogg")?"ogg":"webm";
        const blob=new Blob(recordChunks,{type:typ});
        if(blob.size)preview(new File([blob],"voz."+ext,{type:typ}));
        else setStatus("Gravação vazia; tente novamente.");
      });
      recorder.start();
      recordButton.textContent="Parar gravação";
      setStatus("Gravando áudio... pressione Parar gravação para ouvir antes de enviar.");
    }catch(err) {
      stopTracks();recordButton.textContent="Gravar áudio";
      setStatus("Microfone indisponível ou permissão negada.");
    }
  }
  async function sendAttachment() {
    if(busy||!file)return;
    const conversationId=String(options.getConversationId()||"");
    if(!conversationId){setStatus("Selecione uma conversa para enviar.");return;}
    if(conversationId!==selectionConversationId){
      setStatus("Você mudou de conversa. Cancele este anexo e selecione-o novamente para evitar envio ao contato errado.");
      return;
    }
    busy=true;send.disabled=true;
    if(!crypto?.randomUUID){setStatus("Navegador incompatível com envio seguro.");busy=false;send.disabled=false;return;}
    requestKey=requestKey||crypto.randomUUID();
    setStatus("Enviando anexo pelo WhatsApp...");
    const form=new FormData();
    form.append("conversationId",conversationId);
    form.append("file",file,file.name);
    form.append("caption",caption.value);
    form.append("idempotencyKey",requestKey);
    try {
      const csrf=typeof options.csrfToken==="function"?options.csrfToken():null;
      const headers=csrf?{"X-CSRF-Token":csrf}:{};
      const res=await fetch("/api/comverxa/whatsapp/media",{
        method:"POST",credentials:"same-origin",headers,body:form,cache:"no-store"
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(data.error||"Não foi possível enviar");
      setStatus("Envio aceito pelo WhatsApp. Aguarde a confirmação de entrega.");
      if(typeof options.onSent==="function")await options.onSent(data);
      reset();
      setStatus("Anexo enviado ao provedor. Confira o histórico.");
    }catch(err){
      setStatus(String(err.message||"Erro ao enviar")+". Verifique o histórico antes de tentar novamente.");
      // Mantém o botão desativado para evitar disparo duplicado após timeout.
    }finally {busy=false;}
  }
  return {
    destroy(){reset();host.remove();},
    get recording(){return recorder?.state==="recording";},
    get hasAttachment(){return !!file;}
  };
}
