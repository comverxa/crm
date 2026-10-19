// Normalização de status: artefato de testes. Não modifica a produção.
export const mapStatus = Object.freeze({PENDING:"pending",SERVER_ACK:"sent",DELIVERY_ACK:"delivered",READ:"read",PLAYED:"played",ERROR:"failed"});
export function normalizeDelivery(value) {
  const keys=["ERROR","PENDING","SERVER_ACK","DELIVERY_ACK","READ","PLAYED"];
  const raw=String(value??"").trim().toUpperCase();
  // Webhooks podem enviar o mesmo ACK como numero ou string numerica.
  const key=(typeof value==="number" || /^[0-5]$/.test(raw))?keys[Number(value)]:raw;
  return mapStatus[key]||null;
}
export function reconcileDelivery(oldState,newState) {
  const rank={pending:0,sent:1,delivered:2,read:3,played:4};
  if (!newState) return oldState||null;
  if(newState==="failed")return oldState==="pending"||!oldState?"failed":oldState;
  // ACK pendente atrasado nao deve esconder falha ja registrada.
  if(oldState==="failed" && newState==="pending")return "failed";
  return rank[newState]!==undefined && (rank[oldState]===undefined||rank[newState]>rank[oldState])?newState:oldState;
}
