# COMVERXA Prospect IA — Estado verificado em 15/10/2026

## Implementado e testado

- Painel premium administrativo com acesso autenticado em aplicação standalone, cadastro e importação de leads, classificação por regras, deduplicação e observações.
- Captação própria em \`/captar\` por formulário com manifestação expressa de interesse e aceite de contato pelo WhatsApp para a COMVERXA; não faz scraping de terceiros.
- Modelo de permissões de contato (opt-in com evidência, opt-out que cancela campanhas pendentes).
- **Aprovação adicional obrigatória pelo proprietário** para liberar um contato em campanhas: cadastrar ou marcar consentimento no formulário não é suficiente; o operador registra como verificou a autorização e o número. Leads antigos são migrados como não aprovados.
- **Webhook oficial da Meta** em `/webhooks/meta`: desafio de verificação, validação HMAC `x-hub-signature-256`, recepção de contatos que iniciam conversa, classificação por regras sem opt-in automático e reconhecimento de mensagens de descadastro; exige ambiente Meta válido.
- Campanha na API Oficial da Meta por templates previamente aprovados. Envio manual em lotes limitados, proteção de concorrência para não duplicar solicitação; sem credenciais externas nenhuma mensagem é transmitida.
- IA generativa opcional via chave OpenAI no servidor. Sem chave, o sistema mostra uma indisponibilidade explícita e a pontuação por regras permanece.
- Banco SQLite próprio, caminho \`PROSPECT_DATA_DIR\` ou \`/data\`. Preparação de Docker e Railway para implantação isolada sem substituir o CRM anterior.

## Testes realizados

- GitHub Actions \`COMVERXA Prospect IA QA\`: aprovado em execução de 15/10/2026.
- GitHub Actions \`COMVERXA Prospect IA Integration\`: aprovado em execução de 15/10/2026 com Bun real, login, lead público autorizado, criação, pontuação, deduplicação, filtro de campanhas, descadastro, ausência de Meta/OpenAI e controles de acesso.
- O teste não comprova homologação de produção, segurança multiempresa nem disponibilidade contínua.

## Implantação no Railway confirmada em 15/10/2026

O bloqueio anterior de recursos foi superado. O **COMVERXA Prospect IA** está publicado
como serviço independente `comverxa-prospect-ia`, conectado ao repositório
`comverxa/crm` (branch `main`). O deploy mais recente foi concluído com sucesso
em 15/10/2026 às 11:07 UTC; há uma instância online com volume persistente
`/data` de 500 MB.

- Painel de login: https://comverxa-prospect-ia-production.up.railway.app/login
- Formulário público (a submissão depende da configuração de captação): https://comverxa-prospect-ia-production.up.railway.app/captar
- Integração **não implementada** com o banco de dados e sessões do CRM principal.
- Credenciais de Meta Cloud API/OpenAI ainda não verificadas como configuradas; nenhum disparo ou análise por IA generativa deve ser anunciado como disponível.
- A disponibilidade das páginas e do serviço não substitui testes autenticados de negócio, isolamento de dados ou cópia/restauração externa.

O monitor de produção não destrutivo roda a cada seis horas ou manualmente:
[`COMVERXA - Monitor de producao`](../.github/workflows/production-monitor.yml).
Confere saúde HTTP e bloqueios anônimos do CRM, do Prospect IA e dos documentos comerciais. **Não confirma integração WhatsApp ou prontidão de vendas em escala.**

## Configuração e próximos passos da publicação

- Serviço isolado: \`backend/prospect-standalone.ts\`
- Contêiner: \`Dockerfile.prospect\`
- Configuração sugerida: \`railway.prospect.toml\`
- Volume dedicado montado em \`/data\`.
- Configurar via gerenciador de secrets: \`PROSPECT_ADMIN_EMAIL\`, \`PROSPECT_ADMIN_PASSWORD_SCRYPT\` (scrypt 16384/8/1 com salt hex de 16 bytes), \`PROSPECT_SESSION_SECRET\`.
- Para funcionalidades optativas: \`OPENAI_API_KEY\`, \`OPENAI_MODEL\`, \`META_ACCESS_TOKEN\`, \`META_PHONE_NUMBER_ID\`.
- **Jamais gravar senhas/tokens no repositório**. Usar credenciais distintas das contas do CRM original.
- Após ativação: testes de login remoto, revogação de sessões, aprovação individual e captura, DNS, HTTPS, 401 sem sessão, troca de senhas, backup e restauração externa, monitoramento, hardening, consentimentos, canais Meta de teste e carga.

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

## Segurança adicionada na revisão de 15/10/2026

- Sessões com identificadores aleatórios por acesso e expiração de 8 horas; `/logout` revoga o ID no processo, impedindo reutilização do cookie. Isso é próprio de um piloto de **uma réplica**: múltiplas réplicas exigem armazenamento de sessão compartilhado.
- Tentativas de login limitadas por cliente na aplicação, além de proteções que devem ser configuradas no provedor de borda (WAF/rate limiting real).
- Campanhas não recebem leads públicos automaticamente; só contatos com consentimento registrado, sem descadastro e com aprovação administrativa.
- Webhook Meta verifica assinatura antes de qualquer alteração; novos leads inbound não entram automaticamente em listas de marketing.
- A captura por formulário e o processamento de mensagens precisam de aviso LGPD, política de retenção, direitos dos titulares e teste com ambiente de homologação.
- A Meta pode exigir revisão do aplicativo, permissões apropriadas e templates aprovados para utilizar os recursos de produção.

## Atualização operacional — 15/10/2026

- O serviço `comverxa-prospect-ia` passou a seguir a branch `main` do repositório `comverxa/crm`, sem pin de commit antigo. Deploy de produção do commit `198791b4` concluído com sucesso no Railway em 15/10/2026; armazenamento persistente `/data` mantido.
- Foi adicionado ao painel autenticado um botão para **download manual de backup SQLite** do Prospect IA. O servidor usa `VACUUM INTO`, confirma `PRAGMA integrity_check = ok`, gera nome de arquivo local e rejeita downloads sem autenticação ou proteção de requisição. Teste de integração com restauração em banco isolado passou no [GitHub Actions](https://github.com/comverxa/crm/actions/runs/38745416688).
- O arquivo contém dados pessoais e deve ser armazenado pelo administrador fora do Railway, com proteção e controle de acesso. **Não é backup automático externo**: operação humana de download, retenção, criptografia, frequência e teste de restauração real em produção continuam pendentes.
- O Prospect IA continua **separado** da autenticação e do banco do CRM principal. Não declarar integração de leads ou disparos Meta/OpenAI em produção sem testes autenticados e credenciais externas verificadas.

