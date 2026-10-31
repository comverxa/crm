const portal=location.pathname.startsWith("/profissional/")?"profissional":location.pathname.startsWith("/empresa/")?"empresa":"";
const portalPage=page=>portal?"/"+portal+"/"+page:"/"+page;
const portalApi=path=>portal?"/api/"+portal+path.slice(4):path;
const $=id=>document.getElementById(id);
const token=new URLSearchParams(location.search).get("token")||"";
if(location.pathname.endsWith("/reset")){
 $("forgotSection").hidden=true;$("resetSection").hidden=false;
 history.replaceState(null,"",portalPage("reset"));
 if(!/^[A-Za-z0-9_-]{40,100}$/.test(token)){
  $("status").textContent="Link inválido. Solicite um novo link de recuperação.";
  $("resetForm").querySelector("button").disabled=true;
 }
}
async function send(path,body){
 const response=await fetch(portalApi(path),{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},cache:"no-store",body:JSON.stringify(body)});
 if(response.status>=500)throw Error("Serviço de e-mail temporariamente indisponível.");
 if(!response.ok)throw Error("Não foi possível concluir. Solicite outro link e tente novamente.");
 return response;
}
$("forgotForm").addEventListener("submit",async event=>{
 event.preventDefault();const btn=event.currentTarget.querySelector("button");btn.disabled=true;
 $("status").textContent="Processando solicitação...";
 try{
  await send("/api/auth/forgot",{email:new FormData(event.currentTarget).get("email")});
  $("status").textContent="Se este e-mail estiver cadastrado e ativo, você receberá instruções em instantes.";
 }catch(err){$("status").textContent=err.message}finally{btn.disabled=false}
});
$("resetForm").addEventListener("submit",async event=>{
 event.preventDefault();const form=event.currentTarget,data=new FormData(form),btn=form.querySelector("button");
 if(data.get("password")!==data.get("confirmation")){$("status").textContent="As senhas não coincidem.";return}
 btn.disabled=true;
 try{
  await send("/api/auth/reset",{token,newPassword:data.get("password")});
  $("status").textContent="Senha redefinida. Entre com a nova senha, digitada manualmente.";
  form.reset();
  location.assign(portalPage("login")+"?senha_atualizada=1");
 }catch(err){$("status").textContent=err.message}finally{btn.disabled=false}
});