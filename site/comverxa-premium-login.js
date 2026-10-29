const form=document.getElementById("form");
form.addEventListener("submit",async event=>{
 event.preventDefault();
 const fields=new FormData(form),status=document.getElementById("info");
 status.textContent="Verificando acesso...";
 try{
  const response=await fetch("/api/auth/login",{method:"POST",credentials:"same-origin",
   headers:{"content-type":"application/json"},
   body:JSON.stringify({email:fields.get("email"),password:fields.get("password")})});
  if(!response.ok){status.textContent="Credenciais inválidas ou limite de tentativas atingido.";return}
  location.assign("/app");
 }catch{status.textContent="Falha de conexão. Tente novamente."}
});
