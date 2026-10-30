import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script = readFileSync(new URL('../site/comverxa-premium-login.js', import.meta.url), 'utf8');
function browser(fetchImpl) {
  const button = {disabled:false}, info={textContent:''}, redirects=[];
  let onSubmit;
  const form={querySelector:s=>{assert.equal(s,'button[type="submit"]');return button},addEventListener:(n,cb)=>{assert.equal(n,'submit');onSubmit=cb}};
  const document={getElementById:id=>id==='form'?form:id==='info'?info:null};
  function FormDataMock(){this.get=n=>n==='email'?'  User@Example.Test ':n==='password'?' keep spaces ':null}
  vm.runInNewContext(script,{document,FormData:FormDataMock,fetch:fetchImpl,location:{assign:path=>redirects.push(path)}},{timeout:1000});
  const submit=()=>onSubmit({preventDefault(){}});
  return {button,info,redirects,submit};
}
test('401 differentiates credentials from connection failure; email normalized, password preserved',async()=>{
  let options;
  const b=browser(async(path,opts)=>{assert.equal(path,'/api/auth/login');options=opts;return {ok:false,status:401}});
  await b.submit();
  assert.deepEqual(JSON.parse(options.body),{email:'user@example.test',password:' keep spaces '});
  assert.equal(options.credentials,'same-origin');
  assert.match(b.info.textContent,/senha não conferem/);
  assert.match(b.info.textContent,/separado do CRM principal/);
  assert.equal(b.button.disabled,false);
});
test('duplicate submissions are ignored until first response settles',async()=>{
  let resolve,requests=0;
  const b=browser(()=>{requests++;return new Promise(r=>resolve=r)});
  const first=b.submit();await b.submit();
  assert.equal(requests,1);assert.equal(b.button.disabled,true);
  resolve({ok:false,status:429});await first;
  assert.equal(b.button.disabled,false);
  assert.match(b.info.textContent,/15 minutos/);
});
test('200 redirects only to authenticated app and leaves button disabled',async()=>{
  const b=browser(async()=>({ok:true,status:200}));
  await b.submit();
  assert.equal(b.info.textContent,'Acesso validado. Abrindo painel...');
  assert.deepEqual(b.redirects,['/app']);
  assert.equal(b.button.disabled,true);
});
test('suspension, server errors and network errors present distinct messages',async()=>{
  for(const [response,match] of [[{ok:false,status:403},/suspenso/],[{ok:false,status:503},/Tente novamente/]]){
    const b=browser(async()=>response);await b.submit();assert.match(b.info.textContent,match);
  }
  const b=browser(async()=>{throw Error('network')});await b.submit();
  assert.match(b.info.textContent,/Falha de conexão/);
  assert.equal(b.button.disabled,false);
});
