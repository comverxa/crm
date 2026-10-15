# COMVERXA · Correção do canal de resposta WhatsApp (15/10/2026)

## Sintoma
A Caixa de entrada exibiu o botão **Enviar resposta Meta API** e o erro **Meta Cloud API não configurada**, mesmo com uma linha conectada pela Evolution API.

## Diagnóstico
- O aplicativo original envia pela rota autenticada `POST /api/inbox/:id/send`.
- A implementação do servidor **já possui ramificação para linhas `mode='qr'`**, que consulta o estado da instância na Evolution API e solicita `POST /message/sendText/:instance`. A mensagem de erro da Meta ocorre quando a **conversa/lead está atribuída a uma linha diferente da QR** (Meta ou sem integração).
- A interface anterior mantinha a legenda fixa **Enviar resposta Meta API** para todas as conversas, sem informar o canal associado ao lead.

## Correção implantada
Arquivo-fonte: `backend/whatsapp-channel-inbox.js`.

- Com a conversa atribuída à linha `mode='qr'`, o botão passa a exibir **Enviar pela Evolution API (QR)**; o botão de modelos da Meta é ocultado.
- Com a conversa atribuída à Meta, a tela mostra **Enviar pela Meta API**, avisa que não é a linha Evolution e oferece **Alterar lead para WhatsApp 2 (Evolution)** (ou outra linha QR disponível).
- Ao clicar em alterar, abre o **editor de lead existente**, com a linha QR sugerida. O usuário precisa revisar e clicar em **Salvar**. Nenhum lead é movido automaticamente e nenhuma mensagem é enviada sem clique.
- Se a conversa estiver em linha sem integração, o botão de envio é bloqueado até que o contato seja atribuído a um canal funcional.
- O código é mantido na variável `CVX_WHATSAPP_INBOX_JS` do Railway e injetado no HTML do CRM no caminho autenticado normal. Não são expostas chaves da Evolution API ao navegador.
- Implantação Railway 15/10/2026, estado **SUCCESS**. Não houve alteração do schema do banco, nem mutações de clientes durante a homologação.

## Testes
- QA no navegador com leads fictícios, inclusive navegador acessando o HTML **real de produção**: https://github.com/comverxa/crm/actions/runs/38786588488 (sucesso; sem POST/PUT em produção).
- Monitor público, incluindo existência do patch QR e proteção das APIs: https://github.com/comverxa/crm/actions/runs/38786766496 (sucesso).

## Utilização para resolver o caso
1. Abrir https://app.comverxa.com.br/ e atualizar sem cache com `Ctrl+Shift+R`.
2. Acessar **Caixa de entrada** e abrir a conversa.
3. Se aparecer **Meta API**, clicar **Alterar lead para WhatsApp 2 (Evolution)**, conferir o formulário e **Salvar**. Reabrir a Caixa de entrada, filtrar WhatsApp 2 e selecionar o contato.
4. Quando aparecer **Enviar pela Evolution API (QR)**, enviar uma mensagem de teste para um número próprio/autorizado e responder pelo telefone.
5. Se houver erro, registrar mensagem e status, evitando exposições de telefones, tokens e mensagens de clientes.

## Correção adicional do atendimento que permanece aberto — 15/10/2026

A captura real do usuário mostrou uma lista com contatos identificados como **WhatsApp 2**, enquanto o aviso do atendimento aberto ainda dizia **linha 1**. O motivo identificado foi a utilização de `selected.line` de uma cópia anterior da conversa, enquanto o usuário já havia salvado `leads[].line = 2` no CRM.

- Atualizado `backend/whatsapp-channel-inbox.js`: a identificação do canal consulta primeiro a **linha atual do lead cadastrado**, usando ID exato; o cache da conversa aberta é reconciliado apenas em memória. O banco não é alterado e não há envio automático.
- Com a linha efetiva em Evolution QR, o botão volta a ficar habilitado sem ser necessário encerrar a conversa.
- Teste local e na página realmente publicada aprovado em https://github.com/comverxa/crm/actions/runs/38789582613, incluindo cenário em que a conversa está com linha 1 e o lead já foi salvo com linha 2.
- Railway confirmou a implantação do patch v2 com estado SUCCESS; teste de navegador não executou POST/PUT/DELETE no CRM real.
- **Atenção**: envio/entrega real ainda requer verificação com WhatsApp próprio ou destinatário autorizado; uma melhoria no botão não comprova sucesso da Evolution API.

## Limite de homologação
A **seleção de canal e a correção visual estão verificadas**, mas o teste ponta a ponta de entrega e recebimento a partir de uma sessão real do usuário **ainda depende do envio autorizado em conta conectada**. A Evolution API é uma integração não oficial com riscos operacionais e restrições de uso. Não confundir status do QR ou HTTP 200 do webhook com entrega confirmada.
