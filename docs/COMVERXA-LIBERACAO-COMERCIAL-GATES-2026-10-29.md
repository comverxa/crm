# COMVERXA — prontidão para comercialização (atualizado em 29/10/2026)

## Situação
**PILOTO OPERACIONAL DISPONÍVEL, COMERCIALIZAÇÃO COMPLETA AINDA NÃO HOMOLOGADA.**

### Confirmado nesta rodada
- CRM principal `conecta-crm-saas`: Railway com deploy SUCCESS, banco `saas-dados` preservado.
- Prospect IA: serviço separado em Railway, deploy SUCCESS; suas automações ainda exigem homologação específica.
- COMVERXA Comercial: serviço `comverxa-comercial-piloto`, volume `comverxa-comercial-piloto-dados` de 500 MB independente do principal, deploy SUCCESS.
- Branch `feature/comverxa-premium-comercial-v1`, PR #32 em rascunho, não mesclado na aplicação principal.
- Testes automatizados: 23 aprovados, 0 falhas, incluindo login, troca obrigatória de senha, permissão por perfil, metas/comissões, backup SQLite restaurável, empresas isoladas e leads.
- Painel ADM Master no piloto: cadastro de empresa, plano Starter/Professional/Business **somente sandbox**, limite de usuários, suspensão, sem cobrança automática.
- Leads/pipeline: DDD, UF, origem, temperatura, lead → contato → negociação → proposta → venda/perda, follow-up, histórico e controle otimista de versão.
- Financeiro comercial: metas progressivas e por vendedor/equipe, comissões de venda/ativação/recorrência, retenção/liberação por gestor, ranking e CSV/PDF via navegador.
- Gestão de seguros: vigências e janelas 30/15/10 dias sugeridas, **sem enviar mensagens**.
- Exportação de backup: na produção principal já existe `/admin/backup` com autenticação Master, snapshot consistente e verificação de integridade; o piloto tem exportação similar para seu próprio banco.

## Pendências que impedem anúncio de "CRM completo"
1. **Unificação real**: contas, empresas, leads, vendas, conversas e licenças do CRM principal não foram migrados/integrados ao piloto. Dois logins/bancos independentes NÃO são um produto SaaS único.
2. **Backup do CRM principal**: é preciso realizar exportação autenticada dos bancos `crm`, `finance` e `billing`, guardar cópias cifradas fora do Railway e testar restauração em instância isolada. Não basta existir uma tela de backup.
3. **WhatsApp operacional**: último diagnóstico do Railway indicou 1 instância Evolution cadastrada e 0 conectadas, em 29/10/2026. Verificar novamente em `https://app.comverxa.com.br/admin/whatsapp-health`, conectar dispositivos autorizados e homologar texto, áudios, imagens, documentos, filas, erros e opt-out, com e sem API oficial conforme suporte efetivo da integração.
4. **Central omnichannel**: PR #31 ainda é protótipo, não está integrado ao atendimento real autenticado; não afirmar 3 linhas simultâneas sem conexão/ensaios.
5. **Comercialização e pagamentos**: modo `sandbox`; não há cobrança Pix/cartão real, webhooks de pagamento homologados, antifraude, emissão fiscal, gestão automática de inadimplência ou cancelamento sincronizado.
6. **LGPD, políticas e segurança**: base legal/consentimento conforme uso, minimização e exportação/eliminação de dados, retenção, logs, incidentes, termos de uso, política de privacidade, DPA e análise jurídica; testes reais de autorização e isolamento A/B. O campo de consentimento NÃO implica permissão para envios em massa.
7. **Recuperação de credenciais e e-mail**: recuperação de conta, convite por link, verificação de e-mail e autenticação forte ainda não conectados ao piloto. Testar Resend na plataforma definitiva.
8. **Operação e confiabilidade**: backups externos agendados, monitoramento/alertas, restauração periódica, escalabilidade, limites, testes de carga, atualização/rollback, auditoria financeira e homologação iOS/Android/desktop.
9. **Plano de negócios e licenças**: primeira licença vitalícia ativa no CRM principal, segunda reservada. Garantir sincronização entre módulos e contrato de SaaS antes de cobrar.
10. **Dados antigos**: não mesclar o módulo piloto na função Bun principal sem backup restaurado, compatibilidade de schema e plano de rollback ensaiado.

## Próxima janela de homologação
- Exportar dados do CRM principal pela tela ADM Master, sem expor a senha ou copiar o banco para repositório.
- Restaurar cópia local/isolada e obter inventário de tabelas/entidades (IDs de empresa, usuário, lead, conversa, venda, licença e transação).
- Implementar um único backend com sessão unificada e adaptadores de migração; bloquear funcionalidades atrás de flags por tenant.
- Conectar as 3 linhas WhatsApp permitidas; validar eventos inbound/outbound, desconexões, mídia, envio real para contas de teste e reconciliação.
- Integrar gateway de pagamentos homologado, testes de contratos/planos e relatórios; deixar cobrança desligada até a aprovação final.
- Executar homologação A/B, backup/restore, pentest proporcional, acessibilidade, mobile/desktop, SLA, suporte e política de atendimento.
- Somente após esses gates: remover a indicação de piloto e liberar planos comerciais, com contrato e responsabilidades claras.

## Risco específico
A primeira senha do piloto apareceu numa conversa anterior. O deploy atual exige a troca antes de qualquer operação comercial. Nenhum token/senha deve ser colocado no GitHub, prints públicos ou materiais de venda.

Referências: PR #32 (https://github.com/comverxa/crm/pull/32), PR #31 (https://github.com/comverxa/crm/pull/31), piloto (https://comverxa-comercial-piloto-production.up.railway.app/login), CRM principal (https://app.comverxa.com.br/).
