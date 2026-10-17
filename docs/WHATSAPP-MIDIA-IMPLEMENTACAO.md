# COMVERXA – Áudio e imagem no WhatsApp (integração em preparação)

**Status: código isolado, NÃO implantado no CRM de produção.** Esta branch não muda a aplicação, os dados SQLite, os volumes, as sessões ou os números WhatsApp já conectados. O sistema em `app.comverxa.com.br` continua usando o backend Railway.

## Componentes preparados

- `backend/whatsapp-media-evolution.mjs`: recebe imagem (PNG/JPEG/WEBP) ou áudio (OGG/WEBM/M4A/MP3), valida tamanho e assinatura, encaminha à Evolution API v2 por `/message/sendMedia/{instance}` ou `/message/sendWhatsAppAudio/{instance}`.
- `frontend/whatsapp-media-composer.mjs`: botões de imagem e anexo, gravação pelo microfone com `MediaRecorder` (iOS/Safari ou navegadores compatíveis), prévia, legenda, cancelar e confirmar.
- `tests/whatsapp-media.test.mjs`: testes isolados com fornecedor simulado; **não enviam mensagens reais**.

## Bloqueios para ativar em produção (obrigatórios)

1. **Conectar ao login existente**: o adaptador exige `authorizeCsrf` e `authorizeConversation`. A autorização deve verificar a sessão atual e buscar conversa, empresa, linha, destinatário e instância no banco – nunca ler destino/instância enviados pelo navegador. Verificar permissões do operador, situação da assinatura e limite por empresa.
2. **Idempotência real**: callbacks `reserveSend` e `finishSend` devem ser transacionais, persistir o resultado e reconciliar pedidos cujo status ficou incerto após timeout; não enviar novamente automaticamente. Idempotência deve cobrir requisições paralelas por tenant.
3. **Integração da rota**: encaminhar `POST /api/comverxa/whatsapp/media` ao `makeMediaHandler` **apenas após** as verificações acima. Configurar `evolutionUrl` e `evolutionApiKey` pelo serviço servidor, nunca no frontend.
4. **Integrar o compositor** à conversa selecionada (ID real do CRM). Remover listeners ao navegar para outra conversa. Incluir CSS acessível e ajustar exibição no celular e notebook.
5. **Histórico e eventos**: salvar ID do fornecedor e tipo de mídia, reconciliar `messages.upsert` / `messages.update`, exibir foto/áudio no histórico, impedir duplicatas. A auditoria atual apontou ausência de campo de provider ID na tabela `messages`; criar migração aditiva após backup consistente, não sobrescrever mensagens existentes. Não guardar base64 sensível em logs.
6. **Segurança e armazenamento**: CSRF e cookies de sessão, limites de tamanho, isolamento de tenants, limpeza de arquivos temporários, proteção antimalware se arquivos forem persistidos, URL/armazenamento privados, controle de acesso, auditoria e LGPD.
7. **Homologação de ponta a ponta**: confirmar imagem e áudio reais enviados e recebidos, status, falha/reenvio, iOS Safari, Android, Windows/Mac, e conexão correta da linha 2 antes de testar outras linhas. O status HTTP 202 significa aceite pelo servidor/fornecedor, **não garante entrega ou leitura**.

## Observações da Evolution API

`sendMedia` é usado para imagens. `sendWhatsAppAudio` é usado para áudio/voz (não enviar áudio pelo endpoint de imagem). Algumas versões e canais diferem no suporte à transcodificação e no formato de mensagem de voz: testar com a versão da instância em uso antes de habilitar em larga escala.

A branch está intencionalmente separada de `main`; não divulgar áudio/imagem como recurso em produção antes da homologação.
