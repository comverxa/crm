/**
 * COMVERXA — pré-inspeção de implantação com contagens anonimizadas.
 * Só LÊ a base SQLite e consulta GET da Evolution. NÃO altera cadastros,
 * mensagens, licenças, QR ou variáveis de ambiente; não imprime segredos,
 * e-mails, telefones, nomes de clientes ou identificadores de instância.
 */
async function cvxReadonlyProductionPreflight(){
  const dbPath=Bun.env.CVX_PREFLIGHT_DB||"/data/conecta_saas.db";
  let db;
  try{
    const Sqlite=(await import("bun:sqlite")).Database;
    db=new Sqlite(dbPath,{readonly:true});
    // As verificações são agregadas: dados pessoais não saem do banco.
    const rows=db.query(
      "SELECT s.slot AS slot,s.status AS seat_status,c.plan AS plan,c.status AS company_status "+
      "FROM cxv_lifetime_seats s LEFT JOIN companies c ON c.id=s.company_id ORDER BY s.slot"
    ).all();
    const bySlot=n=>rows.find(r=>r.slot===n);
    const info=s=>!s?"missing":
      s.seat_status==="reserved"?"reserved":
      s.seat_status==="active"&&s.company_status==="active"?"active":"unverified";
    const one=bySlot(1),two=bySlot(2);
    console.info("CVX_READINESS_LICENSE",JSON.stringify({
      slot1:info(one),slot1Business:one?.plan==="business",
      slot2:info(two),slot2Professional:two?.plan==="professional",
      seats:rows.length
    }));
  }catch(error){
    // Não imprimir mensagens SQL externas, caminhos secretos ou valores.
    console.warn("CVX_READINESS_LICENSE",JSON.stringify({status:"check_failed",kind:error?.name||"Error"}));
  }finally{
    try{db?.close()}catch{}
  }
  const addr=Bun.env.EVOLUTION_API_URL||"",key=Bun.env.EVOLUTION_API_KEY||"";
  if(!addr||!key){
    console.info("CVX_READINESS_WHATSAPP",JSON.stringify({status:"credentials_unavailable"}));
    return;
  }
  try{
    const endpoint=new URL(addr);
    if(!["https:","http:"].includes(endpoint.protocol))throw Error("InvalidURL");
    endpoint.pathname=endpoint.pathname.replace(/\/$/,"")+"/instance/fetchInstances";
    endpoint.search="";endpoint.hash="";
    const res=await fetch(endpoint.href,{method:"GET",headers:{apikey:key,Accept:"application/json"},
      redirect:"error",signal:AbortSignal.timeout(9000)});
    if(!res.ok){
      console.warn("CVX_READINESS_WHATSAPP",JSON.stringify({status:"http_error",httpStatus:res.status}));
      return;
    }
    const body=await res.json();
    const rows=Array.isArray(body)?body:Array.isArray(body?.instances)?body.instances:
      Array.isArray(body?.data)?body.data:[];
    const connection=x=>{
      const s=x?.connectionStatus?.state||x?.connectionStatus||x?.instance?.state||
        x?.instance?.connectionStatus?.state||x?.status||x?.state||"unknown";
      return typeof s==="string"?s.toLowerCase():"unknown";
    };
    const connected=rows.filter(x=>connection(x)==="open").length;
    console.info("CVX_READINESS_WHATSAPP",JSON.stringify({
      status:"queried",instances:rows.length,connected,other:rows.length-connected
    }));
  }catch(error){
    console.warn("CVX_READINESS_WHATSAPP",JSON.stringify({status:"check_failed",kind:error?.name||"Error"}));
  }
}
void cvxReadonlyProductionPreflight().catch(()=>console.warn("CVX_READINESS","unexpected_failure"));
