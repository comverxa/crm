/**
 * COMVERXA — authorized server-rendered commercial reports.
 * Render HTML and use Print -> Save as PDF; CSV is UTF-8 with formula protection.
 * The caller MUST obtain reports with an authenticated, server-validated session.
 */
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const brl=c=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(c/100);
const num=x=>new Intl.NumberFormat("pt-BR",{maximumFractionDigits:1}).format(x);
function periodCheck(period){if(typeof period!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw Error("Invalid month")}
const csvCell=v=>{
 const value=String(v??"").replace(/[\r\n]/g," ").replace(/"/g,'""');
 return '"'+(/^\s*[=+\-@]/.test(value)?"'"+value:value)+'"';
};
const css="@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:14px system-ui,-apple-system,Arial,sans-serif;color:#1b2d45;margin:0;background:#f4f7fc}header{padding:28px;background:#0b1c33;color:#fff;border-radius:12px;margin:0 0 18px}header strong{letter-spacing:1.3px;color:#45d5e5}h1{font-size:26px;margin:8px 0}h2{font-size:17px;margin:20px 0 10px}.small{font-size:11px;opacity:.85}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.metric{background:#fff;border:1px solid #dce4ef;border-radius:9px;padding:12px}.metric label{display:block;font-size:11px;color:#61758c}.metric b{display:block;margin-top:7px;font-size:20px}table{width:100%;border-collapse:collapse;background:white;font-size:11px}th,td{padding:9px 7px;text-align:left;border-bottom:1px solid #e0e9f1}th{background:#eff5fb;color:#304560}footer{margin-top:25px;font-size:10px;color:#607389;line-height:1.5}.toolbar{margin:12px 0 20px}button{background:#027b91;color:white;border:0;padding:10px 15px;border-radius:7px;cursor:pointer}@media print{body{background:white}header{border-radius:0}.toolbar{display:none}.metric{break-inside:avoid}tr{break-inside:avoid}}";
const metric=(label,value)=>'<div class="metric"><label>'+esc(label)+'</label><b>'+esc(value)+'</b></div>';
export function makeCommercialReport({period,asOf,subject="Demonstrativo comercial",summary,team=null}){
 periodCheck(period);
 if(!summary||!summary.counts||!summary.commissions||!summary.target)throw Error("Invalid summary");
 if(team!==null&&(!team.rows||!team.totals))throw Error("Invalid team report");
 const rows=team===null?"":'<h2>Desempenho individual da equipe</h2><table><thead><tr><th>Vendedor</th><th>Vendas</th><th>Receita</th><th>Comissão efetiva</th><th>Comissão retida</th><th>Bônus</th></tr></thead><tbody>'+team.rows.map(r=>'<tr><td>'+esc(r.sellerId)+'</td><td>'+num(r.sales)+'</td><td>'+brl(r.amountCents)+'</td><td>'+brl(r.effectiveCommissionCents)+'</td><td>'+brl(r.retainedCommissionCents)+'</td><td>'+brl(r.achievedBonusCents)+'</td></tr>').join("")+'</tbody></table>';
 return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>COMVERXA · '+esc(period)+'</title><style>'+css+'</style></head><body><header><strong>COMVERXA · PREMIUM COMERCIAL</strong><h1>'+esc(subject)+'</h1><div class="small">Competência '+esc(period)+' · Corte '+esc(asOf??"")+'</div></header><div class="toolbar"><button type="button" onclick="window.print()">Imprimir / Salvar em PDF</button></div><section class="metrics">'+
 metric("Vendas confirmadas",num(summary.counts.sold))+
 metric("Receita comercial apurada",brl(summary.revenueCents))+
 metric("Comissões efetivas",brl(summary.commissions.effectiveCents))+
 metric("Comissões retidas",brl(summary.commissions.retainedCents))+
 metric("Bônus da faixa atingida",brl(summary.target.achievedBonusCents))+
 metric("Meta atingida",num(summary.target.completionPct)+"%")+
 '</section>'+rows+'<footer>Consulta comercial autenticada. Valores previstos, sujeitos à conciliação contratual e aprovação financeira; não comprovam pagamento ou cobertura securitária. Dados restritos à empresa e ao perfil autorizado.</footer></body></html>';
}
export function makeCommercialCsv({period,team}){
 periodCheck(period);
 if(!team||!Array.isArray(team.rows))throw Error("Invalid team report");
 const headings=["competencia","vendedor","vendas","perdas","negociacoes","receita_centavos","comissao_efetiva_centavos","comissao_retida_centavos","bonus_conquistado_centavos","meta_restante"];
 const lines=[headings.map(csvCell).join(";")];
 for(const r of team.rows)lines.push([period,r.sellerId,r.sales,r.lost,r.negotiation,r.amountCents,r.effectiveCommissionCents,
  r.retainedCommissionCents,r.achievedBonusCents,r.remainingSales].map(csvCell).join(";"));
 return "\uFEFF"+lines.join("\r\n")+"\r\n";
}
