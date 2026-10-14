#!/usr/bin/env node
'use strict';
// COMVERXA: smoke tests nao destrutivos contra producao.
// Nao usa contas reais, chaves de API ou informacoes de clientes.
const base = process.env.COMVERXA_URL || 'https://app.comverxa.com.br';
const timeout = 9000;
const cases = [
  {name:'HTTPS/saude',path:'/healthz',status:[200],json:v=>v.status==='ok'&&v.service==='comverxa'},
  {name:'Pagina de entrada',path:'/',status:[200],html:true},
  {name:'Sessao anonima bloqueada',path:'/api/me',status:[401,403]},
  {name:'Leads anonimos bloqueados',path:'/api/leads',status:[401,403]},
  {name:'Dashboard anonimo bloqueado',path:'/api/dashboard',status:[401,403]},
  {name:'Equipe anonima bloqueada',path:'/api/team',status:[401,403]},
  {name:'Exportacao anonima bloqueada',path:'/api/owner/export',status:[401,403]},
  {name:'Admin master protegido',path:'/api/platform/clients',status:[401,403]},
  {name:'Cadastro invalido recusado',path:'/api/signup',method:'POST',body:{company:'',name:'',email:'nao-e-email',password:'curta'},status:[400,422]},
  {name:'Login falso recusado',path:'/api/login',method:'POST',body:{email:'qa-comverxa-nao-existe@example.invalid',password:'senha-falsa-qa'},status:[401]},
  {name:'Criacao anonima bloqueada',path:'/api/leads',method:'POST',body:{name:'QA',phone:'00000000000'},status:[401,403]},
  {name:'Origem hostil recusada',path:'/api/login',method:'POST',origin:'https://hostil.example',body:{email:'qa@example.invalid',password:'x'},status:[403]},
];
const results=[];
for (const c of cases) {
  const options={method:c.method||'GET',redirect:'manual',headers:{Accept:'application/json'}};
  if(c.body){options.headers['content-type']='application/json';options.body=JSON.stringify(c.body)}
  if(c.origin)options.headers.origin=c.origin;
  const t=Date.now();
  try {
    const response=await fetch(new URL(c.path,base),{...options,signal:AbortSignal.timeout(timeout)});
    const value=await response.text();
    const reasons=[];
    if(!c.status.includes(response.status))reasons.push('HTTP '+response.status+' (esperado '+c.status.join('/')+')');
    if(c.json){try{if(!c.json(JSON.parse(value)))reasons.push('Resposta de saude inesperada')}catch{reasons.push('JSON invalido')}}
    if(c.html){if(!/html/i.test(response.headers.get('content-type')||''))reasons.push('Content-Type nao e HTML')}
    results.push({teste:c.name,status:response.status,ms:Date.now()-t,aprovado:reasons.length===0,motivo:reasons.join('; ')});
  }catch(e){results.push({teste:c.name,aprovado:false,motivo:String(e?.message||e)})}
}
for(const r of results)console.log((r.aprovado?'PASSOU':'FALHOU')+' | '+r.teste+' | '+(r.status||'sem HTTP')+' | '+(r.ms||0)+'ms'+(r.motivo?' | '+r.motivo:''));
const passed=results.filter(r=>r.aprovado).length;
console.log('RESUMO: '+passed+'/'+results.length+' testes de superficie passaram. Isso NAO homologa multi-tenant, pagamentos ou LGPD.');
if(passed!==results.length)process.exitCode=1;
