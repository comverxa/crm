# COMVERXA — Backup manual ADM Master (código candidato)

**Status inicial: código de revisão, NÃO implantado automaticamente no CRM.**

O arquivo `backend/owner-backup-addon.js` fornece `GET /admin/backup` e `POST /api/master/backup?scope=crm|finance|billing` quando incluído como wrapper no processo Bun do CRM principal. Usa sessão do `/api/master/me`, cookie CSRF curto, confirmação e verificação estrita da origem.

Para cada banco fonte, SQLite `VACUUM INTO` produz uma cópia íntegra temporária, conferida por `PRAGMA integrity_check`, retornada ao administrador como download e excluída do temporário. Os dados originais não são apagados, restaurados ou modificados.

**São três bancos do SaaS:** `conecta_saas.db`, `comverxa-finance.sqlite` e `comverxa-billing-lab.sqlite`. O download é individual (não é backup integral de todos os serviços). O Prospect IA, Postgres/Evolution e Redis têm volumes/bases diferentes.

## Limites
- Até 100 MiB por arquivo para evitar estouro de memória; bancos maiores exigem solução em streaming/volume.
- O proprietário deve manter cópias criptografadas fora do Railway e testar restaurações independentes.
- Não ativa backups automáticos do Railway nem verifica faturamento.
- A homologação real precisa confirmar login ADM na produção, download e restauração em ambiente isolado. NÃO adicionar usuário/senha ao GitHub.
- Não implantar em produção sem revalidar diff e monitorar `/healthz`. Se algo falhar, retornar ao código anterior, preservando o volume `/data`.
