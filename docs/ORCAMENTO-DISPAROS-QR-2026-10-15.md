# COMVERXA — Orçamento de disparos para WhatsApp QR (15/10/2026, 22h)
## Publicado e verificado
- App de produção: https://app.comverxa.com.br/
- Simulador já existente ampliado com seleção local dos leads carregados no CRM, pesquisa por nome/etapa, filtro por linha em modo QR, seleção de até 150 contatos exibidos por busca, atualização da quantidade e prévia de mensagem com {nome}.
- Opção QR/Evolution apresenta tarifa de Meta de **R$ 0,00 por padrão**. Valor unitário, despesas fixas, encargos e saldo são informados pelo operador; orçamento não representa cobrança da Meta, fatura ou saldo real.
- Não faz requisição de envio, não cria campanha, não cadastra ou altera lead, não debita saldo. A operação é **prévia de orçamento**, não disparador automatizado homologado.
- Em ambiente de teste público sem sessão real, a seleção de dois contatos sintéticos produziu orçamento de **R$ 1,00** ao informar R$ 0,50 por mensagem. Limpeza da seleção retornou a R$ 0,00.
- QA automatizado: https://github.com/comverxa/crm/actions/runs/38835361496 (aprovado).
- Código versionado: backend/mass-send-cost-estimator.js; teste: tests/mass-send-estimator-live.mjs.
- Código de apresentação ativo via variável CVX_MASS_ESTIMATOR_JS do serviço conecta-crm-saas em Railway. Deploy de produção concluído com SUCCESS, preservando volumes /data e bancos.

## Pendências para disparo em massa REAL sem API oficial
1. Validar o fluxo autenticado de seleção de leads, mensagens e linha QR no navegador do titular.
2. Definir uma autorização explícita/registrada de marketing por destinatário, lista de descadastro, e evitar envio a contatos sem permissão.
3. Definir custo operativo/tabela comercial própria para o modo QR, se houver; não cobrar tarifa da Meta sem API.
4. Projetar e testar uma fila de envio autenticada com limites e confirmação do usuário, tratamento de falhas, registros por campanha, idempotência, cancelamento e proteção contra abuso. Não assumir que a rota individual /api/inbox/:id/send é adequada para disparo massivo.
5. Homologar entrega real, consequências de políticas do WhatsApp e limites do método QR, sem prometer garantia de entrega ou imunidade a bloqueios.
6. Validar separação multiempresa e restauração antes de comercializar em escala.

## Usar o simulador
1. Entre no CRM e clique em **Simular custo de disparos**.
2. Abra **Escolher contatos do CRM e linha QR (orçamento)**, selecione contatos e confira a quantidade.
3. Mantenha **WhatsApp por QR / Evolution**, informe custo próprio por mensagem entregue (se houver), despesas fixas, encargos e saldo disponível informado.
4. Confira total estimado e valor adicional e, se necessário, copie o orçamento.
5. Esta tela não possui ação de enviar campanha. Para atendimento atual continue usando a Caixa de entrada e a linha QR conectada.
