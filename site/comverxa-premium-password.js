/* COMVERXA Premium — accessible show/hide password for all authentication forms.
 * Purely visual: no logging, clipboard access, network calls or secret storage.
 */
(function(){
 "use strict";
 const svgNS="http://www.w3.org/2000/svg";
 function iconElement(name,attrs={}){
  const element=document.createElementNS(svgNS,name);
  for(const [key,value] of Object.entries(attrs))element.setAttribute(key,String(value));
  return element;
 }
 function attach(input){
  if(input.closest(".cvx-password-wrap")||input.hasAttribute("data-no-password-toggle"))return;
  const parent=input.parentNode;
  if(!parent)return;
  const wrapper=document.createElement("span");
  wrapper.className="cvx-password-wrap";
  parent.insertBefore(wrapper,input);
  wrapper.append(input);
  input.classList.add("cvx-password-input");
  const button=document.createElement("button");
  button.type="button";
  button.className="cvx-password-toggle";
  button.setAttribute("aria-label","Mostrar senha");
  button.setAttribute("aria-pressed","false");
  button.title="Mostrar senha";
  const icon=iconElement("svg",{viewBox:"0 0 24 24",width:20,height:20,fill:"none",
   stroke:"currentColor","stroke-width":1.8,"stroke-linecap":"round",
   "stroke-linejoin":"round","aria-hidden":"true",focusable:"false"});
  icon.append(iconElement("path",{d:"M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"}));
  icon.append(iconElement("circle",{cx:12,cy:12,r:3}));
  const slash=iconElement("path",{d:"M3 3l18 18"});
  slash.setAttribute("display","none");
  icon.append(slash);
  button.append(icon);
  button.addEventListener("click",()=>{
   const revealed=input.type==="password";
   input.type=revealed?"text":"password";
   button.setAttribute("aria-pressed",String(revealed));
   button.setAttribute("aria-label",revealed?"Ocultar senha":"Mostrar senha");
   button.title=revealed?"Ocultar senha":"Mostrar senha";
   slash.setAttribute("display",revealed?"inline":"none");
   // Retain keyboard focus on toggle and preserve typed content.
  });
  wrapper.append(button);
  const form=input.form;
  if(form)form.addEventListener("reset",()=>{
   input.type="password";button.setAttribute("aria-pressed","false");
   button.setAttribute("aria-label","Mostrar senha");button.title="Mostrar senha";
   slash.setAttribute("display","none");
  });
 }
 function init(){
  document.querySelectorAll('input[type="password"]').forEach(attach);
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
 else init();
})();
