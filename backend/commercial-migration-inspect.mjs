/**
 * Read-only COMVERXA legacy CRM backup schema inventory.
 * Run ONLY on an exported/restored COPY, never on a live database volume.
 * No record values, email addresses, messages, passwords or PII are emitted.
 * This utility does not migrate or modify data.
 */
import {DatabaseSync} from "node:sqlite";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const TYPES=[
 ["companies",/(company|companies|empresa|tenant|cliente|conta|account)/i],
 ["users",/(user|usuario|operador|vendedor|consultor|agent|staff)/i],
 ["leads",/(lead|prospect|contato|contact|pipeline|funil|deal|oportunidade)/i],
 ["messages",/(message|mensagem|convers|chat|whatsapp|inbox|instance)/i],
 ["sales",/(sale|venda|proposal|proposta|pedido|order)/i],
 ["billing",/(billing|payment|invoice|license|licen|plano|subscription|assinatura|contract)/i],
 ["events",/(audit|event|log|history|historico|activity|atividade)/i]
];
export function inspectBackup(dbPath){
 if(typeof dbPath!=="string"||!dbPath.trim())throw Error("Backup file path required");
 const db=new DatabaseSync(resolve(dbPath),{readOnly:true});
 try{
  const integrity=db.prepare("PRAGMA integrity_check").get();
  if(!integrity||Object.values(integrity)[0]!=="ok")throw Error("SQLite backup integrity_check failed");
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC").all();
  if(tables.length>1000)throw Error("Schema too large");
  const result=tables.map(({name})=>{
    const cols=db.prepare("PRAGMA table_info("+quote(name)+")").all().map(c=>({
      name:c.name,type:c.type,primaryKey:!!c.pk,nullable:!c.notnull
    }));
    const foreignKeys=db.prepare("PRAGMA foreign_key_list("+quote(name)+")").all().map(f=>({
      referencesTable:f.table,from:f.from,to:f.to
    }));
    return {name,categories:TYPES.filter(([,pattern])=>pattern.test(name)).map(([kind])=>kind),
      columns:cols,foreignKeys};
  });
  const groups=Object.fromEntries(TYPES.map(([name])=>[name,result.filter(t=>t.categories.includes(name)).map(t=>t.name)]));
  return {integrity:"ok",mode:"read-only-schema",tableCount:result.length,tables:result,groups,
   warning:"Only a restored export. No customer records were read or migrated."};
 }finally{db.close()}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const source=process.argv[2];
 if(!source||source.startsWith("-")){console.error("Usage: node backend/commercial-migration-inspect.mjs /private/path/backup.sqlite");process.exitCode=2}
 else{
  try{console.log(JSON.stringify(inspectBackup(source),null,2))}
  catch(error){console.error("Inspection failed:",error?.message||"Unknown error");process.exitCode=1}
 }
}
