# COMVERXA Prospect IA — Estado verificado em 15/10/2026

## Implementado e testado

- Painel premium administrativo com acesso autenticado em aplicação standalone, cadastro e importação de leads, classificação por regras, deduplicação e observações.
- Captação própria em \`/captar\` por formulário com manifestação expressa de interesse e aceite de contato pelo WhatsApp para a COMVERXA; não faz scraping de terceiros.
- Modelo de permissões de contato (opt-in com evidência, opt-out que cancela campanhas pendentes).
- Campanha na API Oficial da Meta por templates previamente aprovados. Envio manual em lotes limitados, proteção de concorrência para não duplicar solicitação; sem credenciais externas nenhuma mensagem é transmitida.
- IA generativa opcional via chave OpenAI no servidor. Sem chave, o sistema mostra uma indisponibilidade explícita e a pontuação por regras permanece.
- Banco SQLite próprio, caminho \`PROSPECT_DATA_DIR\` ou \`/data\`. Preparação de Docker e Railway para implantação isolada sem substituir o CRM anterior.

## Testes realizados

- GitHub Actions \`COMVERXA Prospect IA QA\`: aprovado em execução de 15/10/2026.
- GitHub Actions \`COMVERXA Prospect IA Integration\`: aprovado em execução de 15/10/2026 com Bun real, login, lead público autorizado, criação, pontuação, deduplicação, filtro de campanhas, descadastro, ausência de Meta/OpenAI e controles de acesso.
- O teste não comprova homologação de produção, segurança multiempresa nem disponibilidade contínua.

## Bloqueio de hospedagem confirmado

A chamada de criação de nova Railway Function em \`Conecta CRM SaaS\` foi negada pelo provedor com \`Free plan resource provision limit exceeded. Please upgrade to provision more resources!\`.

Por esse motivo, NÃO há endereço de serviço publicado para o Prospect IA standalone. A função principal existente permaneceu inalterada. Mesmo após respostas afirmativas de atualização e commit no conector Railway, a releitura do código implantado não mostrou a nova extensão; portanto, não considerar o endpoint \`/prospect-ia\` ativo no domínio principal.

**Ação necessária do responsável pela conta:** habilitar capacidade suficiente no Railway para um novo serviço e volume persistente, conferindo custo e forma de cobrança. Não excluir serviços existentes que contenham dados ou integrem WhatsApp.

## Preparação para futura publicação

- Serviço isolado: \`backend/prospect-standalone.ts\`
- Contêiner: \`Dockerfile.prospect\`
- Configuração sugerida: \`railway.prospect.toml\`
- Volume dedicado montado em \`/data\`.
- Configurar via gerenciador de secrets: \`PROSPECT_ADMIN_EMAIL\`, \`PROSPECT_ADMIN_PASSWORD_SCRYPT\` (scrypt 16384/8/1 com salt hex de 16 bytes), \`PROSPECT_SESSION_SECRET\`.
- Para funcionalidades optativas: \`OPENAI_API_KEY\`, \`OPENAI_MODEL\`, \`META_ACCESS_TOKEN\`, \`META_PHONE_NUMBER_ID\`.
- **Jamais gravar senhas/tokens no repositório**. Usar credenciais distintas das contas do CRM original.
- Após ativação: testes de login remoto e captura, DNS, HTTPS, 401 sem sessão, troca de senhas, backup e restauração externa, monitoramento, hardening, consentimentos, canais Meta de teste e carga.

## Ainda não implementado / não comercializar como disponível

- Multiempresa, permissões de operador/vendedor e isolamento completo entre locatários;
- extração automática de Google Maps ou Instagram e prospecção de contatos sem consentimento;
- recebimento de STOP e eventos Meta por webhook de entrega, fila assíncrona e políticas de reenvio;
- envio automático de mensagens em escala e gestão avançada de taxas e horários;
- cotação e emissão de apólices por seguradoras, cálculo atuarial, FIPE e API de proteção veicular;
- gestão de contratos em larga escala, gateway recorrente, backups externos homologados e SLA;
- revisão jurídica da LGPD, documentos assinados e teste independente de segurança.

### Uso responsável

WhatsApp Business Messaging Policy exige opt-in válido, templates aprovados em conversas iniciadas pela empresa e remoção de contatos que optarem por sair. Ver https://business.whatsapp.com/policy/preview?lang=pt_BR. Dados Google Maps Places não podem ser indiscriminadamente exportados/armazenados para listas de prospecção; consultar as condições do provedor.

Esta é uma entrega técnica verificável em piloto, **não uma certificação de prontidão comercial**.
