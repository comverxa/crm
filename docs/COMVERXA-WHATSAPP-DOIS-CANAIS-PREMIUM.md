# COMVERXA Premium — 2 canais WhatsApp e interface sofisticada
Data: 30/10/2026

## Nova regra de produto
A versão Comercial isolada permite **exatamente 2 canais por empresa**:
1. **WhatsApp 1** — Evolution API (não oficial), autenticação por QR Code, uma instância por empresa.
2. **WhatsApp 2** — WhatsApp Business Platform / Meta Cloud API (oficial), Phone Number ID + token + webhook assinado.

A estrutura SQLite contém CHECK(slot IN (1,2)), a UI exibe somente dois cartões, a caixa de entrada filtra por canal e todo acesso empresarial filtra tenant_id. **Não há WhatsApp 3.** O CRM principal legado mantém a estrutura histórica intacta até migração autorizada e backup restaurado.

## Estado operacional real
- O backend não fabrica QR Codes, mensagens, status conectados ou IDs da Meta.
- Um gestor clica em "Conectar pelo QR Code": cria a instância isolada (apenas se a Evolution estiver configurada), consulta seu status e pede a imagem ao provedor, exibindo **somente** PNG real retornado no endpoint de conexão. Depois é necessário escanear com o celular e consultar o status.
- A API oficial valida o Phone Number ID mediante consulta autenticada ao Graph API. O token é cifrado em SQLite com AES-256-GCM; não é retornado no GET da interface.
- O usuário cadastra a URL e o verify token **no Meta Developers**, e o servidor valida assinatura X-Hub-Signature-256 nos POSTs. Após o webhook funcionar, as mensagens recebidas aparecem no inbox do piloto.
- Evolution recebe mensagens via webhook com segredo aleatório de 192 bits na URL, vinculado à instância. O servidor ignora mensagens enviadas pelo próprio número e grupos.
- Eventos recebidos são gravados de forma idempotente por empresa + canal + ID da mensagem. Há leitura das 100 mensagens recentes por canal. Não existe sincronização retroativa garantida do histórico do celular nem certificação de entrega.
- Não há disparos automáticos ou em massa e não são expostos segredos de provedores ao browser.
- Mídia recebida é identificada pelo tipo (imagem/áudio/documento), mas o conteúdo binário não é baixado nem sincronizado automaticamente nesta etapa.

## Segredos de servidor (Railway, nunca no GitHub)
- CVX_WA_ENCRYPTION_KEY: base64 de 32 bytes, distinta da chave de backups; guarde cópia em cofres seguros.
- CVX_WA_EVOLUTION_URL: endereço HTTPS da Evolution ou endereço HTTP privado Railway.
- CVX_WA_EVOLUTION_API_KEY: chave da Evolution; pode referenciar a variável existente no projeto.
- CVX_WA_META_APP_SECRET: App Secret da aplicação Meta. **Obrigatória** para habilitar a validação oficial e webhooks; não confundir com access token do número.
- CVX_WA_META_GRAPH_VERSION: versão da API Graph (configurável; padrão v23.0).
- Tokens de acesso de cada empresa à Meta são fornecidos na interface autenticada e cifrados no banco do piloto.

## Rotas
Autenticadas: GET /api/wa/channels, GET /api/wa/inbox?slot=1|2, POST /api/wa/qr/register, POST /api/wa/qr/connect, POST /api/wa/official/register, GET /api/wa/official/webhook-setup.
Webhooks com autenticação própria: POST /api/wa/qr/webhook/{opaque-secret}, GET e POST /api/wa/meta/{tenant}/webhook. QR e Meta são isolados por slot/tenant e não são a mesma API.

## Melhoria visual
- Folha de estilo premium externa, preservando Content Security Policy: identidade azul-noturno, gradientes sutis, tipografia e espaçamento contemporâneos, estados com feedback, painéis responsivos em laptop/tablet/celular.
- Painel executivo de funil e estado de conexão dos dois canais.
- Central de conexão com cartões separados, QR retornado pelo provedor, validação Meta, webhook, caixa de entrada por origem.
- Não utiliza imagens de estoque, font externa ou tracking.

## Homologação antes de anúncio comercial
- A conexão por QR depende de um gateway Evolution compatível: verificar manualmente a versão, criação da instância, o PNG real de QR, scan, reconexão, webhook, envio/recebimento e opt-out com números próprios.
- A API oficial depende de credenciais Meta e registro do webhook; testar confirmação HTTP GET, POST assinado, recepção, envio de templates autorizados, janela de atendimento e tarifação Meta.
- O status 'verified' confirma credenciais Meta, não recebimento/entrega de mensagens.
- Confirmar política do WhatsApp, LGPD, consentimento/base legal, retenção e regras de mensagens em massa.
- Para produção, conectar o CRM principal com backup **restaurado** e mapeamento de dados; a implementação do piloto não remove nem altera linhas/contatos existentes do banco legado.

Verificação: tests/commercial-premium-whatsapp.test.mjs (simulações de provedor e HTTP real do piloto), CI .github/workflows/commercial-premium.yml.
