# COMVERXA Premium — arquitetura de expansão (28/10/2026)

> Documento de implementação, não certificação de funcionalidades prontas. Não altera o CRM em produção.

## Objetivo
Evoluir o CRM Railway existente sem perda de dados e sem substituir o backend por demonstrações do GitHub Pages. Os seis módulos têm rastreamento nas issues #25–#30. A issue #24 bloqueia homologação WhatsApp.

## Dependências inegociáveis
1. Extrair o código de produção injetado por variáveis CVX_SOURCE_1..4 para repositório privado **sem publicar tokens**; comparar hash do artefato em execução antes de deploy.
2. Backup consistente de bancos e anexos, cópia externa criptografada e **restauração comprovada** em ambiente isolado.
3. Testes autenticados de isolamento de empresas e papéis; toda consulta/escrita inclui tenant_id derivado da sessão, jamais somente do cliente.
4. Segredos exclusivos por ambiente; filas idempotentes; logs redigidos; métricas de erros e alertas.
5. Homologar o status da sessão WhatsApp existente antes de recriar/reiniciar instâncias.

## Entidades sugeridas (esboço sujeito a migrações compatíveis)
- tenants(id, plan_id, brand_settings, status); users(id, tenant_id, role, status); channel_accounts(id, tenant_id, provider, slot, status)
- contacts(id, tenant_id, external_ref); leads(id, tenant_id, owner_id, contact_id, stage, source_id, qualification)
- conversations(id, tenant_id, channel_id, contact_id, assigned_user_id, status); messages(id, tenant_id, conversation_id, provider_message_id, direction, type, sent_at, delivery_status); attachments(id, tenant_id, message_id, storage_key, mime_type)
- automation_flows(id, tenant_id, trigger, enabled); automation_runs(id, tenant_id, flow_id, lead_id, state, next_at, idempotency_key); automation_events(id, tenant_id, run_id, outcome)
- ai_suggestions(id, tenant_id, lead_id, model, type, rationale, confidence, approved_by)
- campaigns(id, tenant_id, channel, spend, utm); commercial_events(id, tenant_id, lead_id, event_type, amount, occurred_at)
- quotes(id, tenant_id, lead_id, product_type); policies_or_memberships(id, tenant_id, quote_id, status, start_at, end_at); installments(id, tenant_id, membership_id, due_at, paid_at, amount); commissions(id, tenant_id, membership_id, seller_id, amount, status)
- subscriptions(id, tenant_id, plan_id, status, trial_end_at); audit_events(id, tenant_id, actor_id, action, subject, at)
Índices compostos tenant_id + id para todas as referências cruzadas e restrições únicas tenant_id + provider + provider_message_id quando disponível. Não presumir esquema existente antes de migração.

## Ordem de entrega
- **Fase 0 — integridade:** snapshot/restauração, autenticação, isolamento, inventário do código Railway, status QR/Evolution e filas.
- **Fase 1 — omnichannel (#25):** timeline, canais 1–3, mídia, atribuições e webhooks deduplicados.
- **Fase 2 — automações (#26):** cadências com agendamento, consentimento/base legal, templates, pausa por resposta e fila auditável.
- **Fase 3 — IA (#27):** resumos e sugestões opt-in; classificação auditável; human-in-the-loop e orçamentos.
- **Fase 4 — dashboard (#28):** eventos, custos, indicadores financeiros e filtros, inclusive por estado/região.
- **Fase 5 — vertical de seguros (#29):** propostas, vigência, renovação, comissão e cobrança sem alegações indevidas de cobertura.
- **Fase 6 — SaaS white-label (#30):** identidade visual, papéis, limites, painel master, cobrança em sandbox; **não ativar cobrança real sem autorização**.

## Critérios gerais de liberação
- Testes unitários/integrados + fluxo ponta-a-ponta em duas empresas fictícias e múltiplos perfis.
- Testes de envio multimídia por canais configurados com números de teste; erros externos têm retry limitado, DLQ e idempotência.
- Conformidade LGPD (acesso, exclusão, retenção, suboperadores), regras de plataformas e respeito a opt-out.
- Desempenho mobile/desktop, acessibilidade, registro de auditoria, telemetria e rollback testado.
- Mecanismo feature flag por tenant com rollout gradual e rollback independente, sem interromper cliente.
- Evidências reproduzíveis de cada checklist em issues #25–#30.

## Estado na data de criação
Planejamento técnico e issues criados. **Nenhuma implementação desses seis módulos foi homologada por este documento e nenhum deploy foi realizado.**
