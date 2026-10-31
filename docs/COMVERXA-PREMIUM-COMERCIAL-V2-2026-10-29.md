# COMVERXA Premium Comercial — evolução v2 (29/10/2026)

Status: branch de desenvolvimento, PR #32 (rascunho). **NÃO integrado ao CRM Railway** e **NÃO homologado para produção**.

## Recursos efetivamente adicionados
- Motor de performance individual em `backend/commercial-premium-team.mjs`, com faixas/bonificações por vendedor, projeção, receita e ranking, independente da meta coletiva da empresa.
- Metas por vendedor persistidas em SQLite na tabela `cvx_comm_seller_plans` e meta coletiva persistida nas regras de empresa (`teamTargetSales`). As chaves de tenant derivam da sessão autenticada, nunca de form aberto.
- Regra de integridade financeira: operador não consegue marcar uma comissão como liberada e não consegue reescrever vendas registradas em estados `sold` ou `active`. A aprovação pelo gestor registra evento `COMMISSION_RELEASED` no histórico.
- API adicional: GET `/api/commercial/team`, GET/POST `/api/commercial/seller-plans`, GET `/api/commercial/report/print` (imprimir/salvar como PDF pelo navegador) e GET `/api/commercial/report.csv` (equipe, permitido apenas a gestores). Todos dependem de sessão resolvida no servidor; escritas dependem de CSRF; endpoints não estão montados em produção.
- Relatório HTML sanitizado com política CSP restritiva e CSV com mitigação de fórmulas em células.
- Prévia mobile: nova tela de equipe/ranking, meta coletiva, exportação CSV fictícia e fluxo visual de contato para renovações nas janelas 10/15/30 dias. Dados apenas temporários no navegador.

## Evidências de validação
- Workflow `COMVERXA Premium Comercial v1` em Node 22, com testes unitários de metas, remuneração, permissões, separação empresa A/B, persistência, CSRF, relatórios e verificações da interface. Consultar a última execução bem-sucedida no GitHub Actions da branch.
- O teste de front verifica sintaxe de JavaScript e elementos essenciais, **não é teste visual em iPhone/Android**.
- GitHub Pages publica **somente** `site/preview-premium-comercial.html` a partir de `main`; o serviço Railway não foi modificado.

## Pontos de atenção antes de usar em clientes
1. Fazer backup consistente da base Railway, restaurar em ambiente isolado e confirmar esquema existente, evitando alterações diretas no volume `/data`.
2. Vincular vendedor e equipe a usuários ativos reais no banco do CRM; rejeitar referências a usuário inexistente e definir políticas de transferência e desligamento.
3. Confirmar os fluxos de aprovação de vendas, elegibilidade de comissão, estorno, cancelamento, chargeback, recorrência liquidada e reabertura de períodos.
4. Ligar `getSession` e `verifyCsrf` do adaptador HTTP ao sistema real; mapear papéis gerente/operador/ADM, autenticação, segurança de cookies e rate limits.
5. Incluir trilha imutável e idempotência dos eventos financeiros; não considerar previsões como valores pagos.
6. Migrar o simulador de interface para os endpoints autenticados, separando informações pessoais e financeiras por perfil e tenant; testar escape HTML, CSV e cabeçalhos.
7. Para PDF produzido no servidor (arquivo PDF binário, não HTML imprimível), adotar gerador de PDF homologado, com teste A/B e máscara de dados sensíveis.
8. Para notificações de renovações, exigir opt-in/canais permitidos, opt-out, agendamento, deduplicação e histórico; nenhuma mensagem é enviada pelo protótipo.
9. Testar em dispositivos reais (iOS, Android, Mac, Windows) e em contas de homologação; não ativar envios WhatsApp nem cobranças automaticamente.
10. Implantar com feature flag por empresa, monitoramento, alertas e procedimento de rollback antes de expansão comercial.

## Limites
O lançamento do GitHub Pages apenas demonstra a experiência visual, não transforma o protótipo em CRM operacional. O PR #32 continua em rascunho; **não** realizar merge/deploy automático no Railway. Dados, licenças vitalícias e conexões WhatsApp existentes permanecem fora desta mudança.
