# COMVERXA — Renovação, alertas e inadimplência (LABORATÓRIO)

**Status da versão:** preparada no GitHub e validada em CI; publicação do upgrade no Railway pendente. O CRM de produção continua com o ciclo básico de cobrança fictícia/pagamento fictício anteriormente validado.

## Funcionalidades preparadas

- Painel de vencimentos próximos (até 7 dias), inadimplência fictícia e total em atraso.
- Faixas de atraso: 1 a 7, 8 a 30 e 31+ dias, calculadas pelas datas de vencimento em relação à data corrente de São Paulo.
- Filtros por pendente, vence em 7 dias, vencida, paga em simulação, cancelada.
- Renovação manual de uma cobrança com estado `PAID_SIMULATED`: nova competência no mês seguinte, mesmo valor e vencimento deslocado em um mês (clamp no último dia do mês: 31/01/2028 → 29/02/2028). Registro auditado.
- Lembrete **exclusivamente interno**, com limite de um registro por cobrança a cada dia UTC. Nenhuma mensagem é enviada.
- Registros mantidos no banco de testes isolado `/data/comverxa-billing-lab.sqlite`, sem integração com gateway.

## Propriedades de segurança

- Requer sessão autenticada no ADM Master e token antifalsificação CSRF em todas as ações de escrita.
- Requisições de domínios externos são recusadas, mesmo com a sessão. A origem nula de navegador móvel só é tolerada com sessão e token CSRF válidos.
- Não altera plano, vencimento real, situação de assinatura, acesso, contratos reais nem ledger do financeiro real.
- Não envia e-mail, WhatsApp, PIX, boleto, cobrança bancária nem fatura fiscal.
- O processamento de renovação é **manual por botão**, e não uma cobrança recorrente automática.

## Testes e publicação

O teste `tests/billing-lab-auth.test.mjs` executa com Bun e valida autenticação, CSRF, data de vencimento, alertas, renovação, duplicação bloqueada, data bissexta, lembrete fictício e ausência de mutação nas APIs de clientes. O GitHub Actions `Testar seguranca de cobrancas no celular` e `Validar simulador de cobrancas COMVERXA` passaram na versão preparada.

Para produção, exige implantação revisada no Railway da nova implementação de `backend/billing-lab-middleware.js` e `backend/billing-lab-ui.html`, **sem substituir a aplicação principal**. Confirmar implantação, healthcheck e testes de acesso negado antes de solicitar validação manual na sessão real. Não é necessário migrar tabelas financeiras principais, apagar volumes nem alterar contratos de clientes.
