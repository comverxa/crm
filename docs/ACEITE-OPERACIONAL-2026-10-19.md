# COMVERXA — situação operacional em 19/10/2026

> Registro de evidências, sem credenciais nem informações dos clientes.
> **Decisão:** aplicativo disponível para um piloto de uso interno/assistido, mas não homologado para comercialização em escala. Não confundir servidor online com implantação de todas as funcionalidades.

## Verificações realizadas em 19/10
- Railway produção `conecta-crm-saas` e `comverxa-prospect-ia`: ONLINE, uma réplica rodando em cada serviço, sem falhas recentes.
- Domínio `app.comverxa.com.br` verificado, SSL válido, CNAME propagado conforme Railway.
- GitHub Actions, execução 39269101307: `tests/commercial-readiness.mjs` concluiu **0 falhas e 1 aviso**, sem autenticação, em produção às 14:27 UTC.
- No teste público: `GET /healthz` HTTP 200 e `status=ok`, páginas LGPD/termos/portal publicadas, rotas ADM e dados do CRM negam acesso anônimo (HTTP 401), HTML do CRM inclui indicadores de layout premium, integração de conversas e orçamento QR.
- Logs de webhook mostram eventos `messages_upsert` com persistência de novas mensagens no banco até 19/10. Isso não valida os dois sentidos nem todas as linhas.
- Resend: domínio com envio habilitado e verificado. Histórico mostra recuperação de senha entregue; isso não confirma redefinição concluída.
- Log de inicialização de 16/10: licença vitalícia nº 1 ativa (Business), nº 2 reservada. Verificar estado com login para confirmação atual.
- Mensagem administrativa anterior ao domínio teve bounce: revisar recebimento do endereço administrativo antes de depender dele para atendimento.

## Uso HOJE com limitações
1. Abra https://app.comverxa.com.br/ e autentique-se com **credenciais existentes**. Não é necessário redefinir senha se o login funciona.
2. Verifique se seu painel mostra os leads, funil, relatórios e conversas existentes; não apague nem recadastre linhas ao tentar solucionar problemas.
3. Para testar WhatsApp por QR, utilize apenas uma conversa de teste própria, envie texto, responda pelo outro aparelho, recarregue o CRM e confira as duas direções, o horário e o número da linha.
4. Utilize somente funcionalidades que comprovar no seu próprio login e não anuncie como liberado o envio de áudio/imagem integrado: o código está exclusivamente no PR #23, não foi implantado.
5. Não iniciar cobrança recorrente real, não comercializar como produção 100% homologada e não usar disparos sem tratamento de LGPD/opt-out e regras da plataforma.

## Bloqueios para concluir as funções e vender em escala
- Autenticação real: teste com dois tenants fictícios e operador/ADM; provar isolamento em leads, inbox, relatórios, canais e exportações.
- Exportar código-fonte **sanitizado** da Railway Function para repositório privado. O código principal é recomposto em produção a partir de quatro variáveis privadas `CVX_SOURCE_1..4`, cujos conteúdos não estão expostos pelo conector. **Não compartilhar valores de variáveis, API keys, senhas ou base de clientes.**
- Integrar e testar o PR #23 no código principal: imagem, legenda, anexos, gravação de áudio, mídia recebida, deduplicação e estados via webhooks.
- Criar backup consistente e testar restauração em ambiente separado; volume persistente não é backup.
- Confirmar faturamento/continuidade Railway, gateway real se vendido, LGPD/termos definitivos e apoio administrativo.
- Validar e configurar o segundo acesso vitalício após indicação/autorizações necessárias.

## Links
- Produção: https://app.comverxa.com.br/
- Admin: https://app.comverxa.com.br/admin
- Evolução de mídia: https://github.com/comverxa/crm/pull/23
- Teste público automatizado (código): https://github.com/comverxa/crm/blob/main/tests/commercial-readiness.mjs

## Política de preservação
Nenhum banco, cliente, mensagem, licença ou variável de produção foi alterado por estas verificações. Os testes usam GETs sem autenticação. As mudanças de desenvolvimento continuam separadas no PR #23.
