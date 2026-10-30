# COMVERXA — Stripe Billing (homologação sem cobrança real)

**Situação de 30/10/2026:** checkout e webhook implementados no módulo Comercial isolado e publicados com a flag de cobrança desligada. A conta Stripe conectada está em TESTE, sem preços cadastrados. Não implica que o sistema esteja pronto para cobrar clientes.

## Arquitetura
- Checkout Stripe Hosted (somente `sk_test_*`) para Starter, Professional e Business.
- Vinculação segura: sessão interna autenticada → tenant_id real → intenção de contratação gravada → checkout gerado no servidor com preço cadastrado, sem aceitar price_id da interface.
- Webhook público `POST https://comverxa-comercial-piloto-production.up.railway.app/api/billing/stripe/webhook`, HMAC validado em bytes brutos, tolerância 300 segundos, deduplicação por ID de evento e transações SQLite.
- `checkout.session.completed` vincula sessão conhecida a assinatura/empresa, mas **não ativa** licença.
- `invoice.paid` com valor efetivamente pago positivo e assinatura vinculada concede direito de assinatura na camada piloto. `invoice.payment_failed` marca inadimplência sem apagar o histórico. Eventos de cancelamento revogam direito da assinatura teste.
- Nenhum evento de teste altera login, bloqueio da empresa, base financeira principal ou licenças vitalícias do `conecta-crm-saas`.
- No momento, a camada grava `entitlement` como preparação para sincronização; **não** implanta a licença paga no CRM principal ou na central de WhatsApp.
- Rotas administrativas `GET /api/billing/stripe/status` e `POST /api/billing/stripe/checkout` com sessão e anti-CSRF. Checkout da conta Master principal bloqueado.

## Variáveis necessárias no serviço Railway *comverxa-comercial-piloto*
Configurar pelo painel de **Variables**, nunca no GitHub, em chat ou em código:
- `CVX_STRIPE_TEST_ENABLED=1`
- `CVX_STRIPE_TEST_SECRET_KEY` (chave **sk_test_**, não sk_live_)
- `CVX_STRIPE_TEST_WEBHOOK_SECRET` (segredo whsec_* do endpoint de teste)
- `CVX_STRIPE_TEST_PRICE_STARTER` (price_* recorrente de teste)
- `CVX_STRIPE_TEST_PRICE_PROFESSIONAL`
- `CVX_STRIPE_TEST_PRICE_BUSINESS`

Não ativar o flag sem as credenciais e ao menos um Price test válido. O código **recusa chaves de produção** no piloto. Não copiar chaves do Stripe para mensagens ou arquivos públicos.

## Configuração no Stripe Dashboard (ambiente TESTE)
1. Definir e aprovar em reais os valores, frequência, impostos, limites por plano, contrato e política de cancelamento.
2. Criar produtos e preços recorrentes para Starter, Professional e Business e copiar os IDs `price_*`.
3. Criar endpoint de webhook de **teste** apontando para a URL acima, selecionando: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated` e `customer.subscription.deleted`.
4. Configurar variáveis de ambiente no serviço piloto do Railway, usando segredos protegidos.
5. Reimplantar o piloto, testar com cartão de testes e verificar: assinatura sem webhook não ativa, webhook falso rejeitado, pagamento confirmado cria direito no ledger, eventos duplicados não duplicam, falha e cancelamento atualizam estado, isolamento por empresa, taxa de erros e auditoria.

## Antes de receber pagamentos reais
- Homologar processamento fiscal (nota fiscal, tributos e contrato de adesão), suporte e cancelamentos.
- Definir política de mensalidade e inadimplência sem confundir falha transitória com cancelamento.
- Integrar o ledger de pagamentos ao backend único, login, quotas e licenças reais, com restauração testada do banco principal.
- Exigir autenticação corporativa robusta, antifraude proporcional, limites, alertas, logs e auditoria.
- Projetar migração test→live: outros produtos/price IDs, novas chaves e webhook; **não** ativar neste piloto de teste.
- Verificar meios de pagamento recorrentes disponíveis para o Brasil diretamente no Stripe; não assumir que Pix recorrente ou cartão estejam habilitados até homologação.

## Evidências
- PR em revisão: https://github.com/comverxa/crm/pull/32
- Suíte de testes 37/37: https://github.com/comverxa/crm/actions/runs/40986801329
- Serviço piloto com deploy SUCCESS no Railway: commit `a1e17c67a856a685c94fc887ec6eaf91ec7f01af`.
