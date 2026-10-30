# COMVERXA — Integração Omnichannel P0 no CRM real

Status: **não implantado**. Este repositório hospeda o site e componentes experimentais; o backend do CRM principal roda separadamente no Railway e não é automaticamente atualizado pelos commits desta branch.

## Dependências antes de qualquer implantação
1. Identificar e versionar de forma segura o código-fonte efetivamente executado pelo serviço Railway `conecta-crm-saas`. Não substituir a imagem/function existente por este protótipo.
2. Obter backup consistente dos bancos e demonstrar restauração **em ambiente separado**. Nunca substituir nem apagar o volume `saas-dados`.
3. Confirmar autenticação e sessão reais, proteção CSRF e permissões ADM/gerente/operador; a sessão deve ser resolvida no servidor.
4. Implantar tabela transacional tenant-scoped para channels, conversations, messages, assignments, outbox e event-deduplication, com índices únicos para `(tenant_id, channel_id, provider_message_id)` e `(tenant_id, request_id)`. `MemoryInboxStore` e cache `Map` são apenas de referência.
5. Determinar secret de webhook exclusivo de cada canal, verificar assinatura Meta sobre corpo bruto ou secret de proxy para Evolution; jamais aceitar token recebido do navegador como prova de autenticidade.
6. Usar conexão HTTPS/TLS para Evolution; resolver o nome da instância somente do cadastro confiável da empresa; segredos somente em variáveis servidor, nunca em logs/HTML.
7. Mapear conversa e canal a cada envio; o endpoint de envio é `POST /api/omnichannel/messages/send`, `{ conversationId, text, requestId }`, com autenticação/CSRF e flag `enabled=false` por padrão.
8. Montar `site/omnichannel-composer.mjs` **dentro da view autenticada do CRM** com conversa válida e token CSRF; não publicar no GitHub Pages como interface funcional isolada.
9. Implementar fila transacional/outbox e reconciliação de resultado incerto, receipts de entrega, histórico persistente e proteção contra envio duplicado após restart/escala.
10. Verificar conexão, QR, recebimento, envio, reabertura do histórico, autorização entre empresas A/B e troca de atendentes. Testar em instâncias e números de homologação autorizados, com consentimento e políticas do canal.
11. Implementar mídia com armazenamento privado e validação de MIME/tamanho/acesso; protótipo atual registra só metadados, não baixa nem transmite anexos.
12. Ativar uma linha por vez via flag/config por tenant, monitorar e ter rollback testado; só então expandir para até 3 linhas.

## Contratos existentes
- `backend/omnichannel-core.mjs`: modelo de inbox e normalização dos webhooks (in-memory).
- `backend/omnichannel-webhook.mjs`: validação de assinatura/segredo e parser HTTP.
- `backend/omnichannel-outbound.mjs`: escopo de locatário e envio de texto (idempotência em memória).
- `backend/omnichannel-evolution-transport.mjs`: chamada `message/sendText/{instance}` após resolução segura de instância.
- `backend/omnichannel-send-http.mjs`: endpoint de envio, sempre com sessão servidor e CSRF.
- `site/omnichannel-composer.mjs`: botão e editor de mensagem, não montados no CRM real.
- `tests/omnichannel-*.test.mjs`: testes sintéticos; **não** demonstram conexão real com Evolution ou Meta.

## Critério de pronto
- Envio, recebimento e histórico real visíveis no CRM, com confirmação do provedor e status de entrega separados.
- Persistência após restart, testes de isolamento de duas empresas e permissões; nenhuma exposição de mídia ou segredos.
- Homologação real documentada, backup restaurável e rollback, logs observáveis sem dados sensíveis.
- Nenhuma alteração de produção ou ativação de disparos em massa somente com este documento.
