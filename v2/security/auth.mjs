import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';

const validId = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(x);
export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw Error('invalid_password');
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(password, salt, 64).toString('hex');
  return 'scrypt$' + salt + '$' + digest;
}
export function verifyPassword(password, stored) {
  if(typeof password !== 'string' || password.length>1024 || typeof stored !== 'string')return false;
  const parts = stored.split('$');
  if(parts.length!==3 || parts[0]!=='scrypt' || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2]))return false;
  return timingSafeEqual(scryptSync(password,parts[1],64),Buffer.from(parts[2],'hex'));
}
const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
export function issueSession({userId,tenantId,role},secret,now=Math.floor(Date.now()/1000)) {
  if(!validId(userId)||!validId(tenantId)||!['owner','manager','agent'].includes(role)||typeof secret!=='string'||secret.length<32)throw Error('invalid_session');
  const payload=b64({sub:userId,tenant:tenantId,role,iat:now,exp:now+8*3600});
  const signature=createHmac('sha256',secret).update(payload).digest('base64url');
  return payload+'.'+signature;
}
export function readSession(token,secret,now=Math.floor(Date.now()/1000)) {
  if(typeof token!=='string'||token.length>4096||typeof secret!=='string'||secret.length<32)return null;
  const parts=token.split('.'); if(parts.length!==2)return null;
  const expected=createHmac('sha256',secret).update(parts[0]).digest();
  let signature;try{signature=Buffer.from(parts[1],'base64url');}catch{return null;}
  if(signature.length!==expected.length || !timingSafeEqual(signature,expected))return null;
  let p;try{p=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));}catch{return null;}
  if(!validId(p.sub)||!validId(p.tenant)||!['owner','manager','agent'].includes(p.role)||!Number.isSafeInteger(p.exp)||!Number.isSafeInteger(p.iat)||p.exp<=now||p.iat>now+60||p.exp-p.iat>8*3600)return null;
  return {userId:p.sub,tenantId:p.tenant,role:p.role};
}
export function tenantQuery(session,sql,params=[]) {
  if(!session||!validId(session.tenantId)||!/\$1\b/.test(sql))throw Error('tenant_scope_required');
  return {text:sql,values:[session.tenantId,...params]};
}
