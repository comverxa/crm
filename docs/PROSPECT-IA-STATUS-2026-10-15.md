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
em 15/10/2026 às 14:25 UTC; há uma instância online com volume persistente
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


## Entrega de 15/10/2026 — direitos dos titulares e saúde da base

- **Exportação individual de dados do lead (administrador):** `GET /api/master/prospect/leads/:id/export`, com JSON e histórico de campanhas relacionadas. Não há acesso sem sessão autenticada.
- **Eliminação individual na base ativa:** `POST /api/master/prospect/leads/:id/erase`, com justificativa selecionada, token de proteção do painel e confirmação literal `EXCLUIR :id`. Elimina registros associados da fila de campanhas e registra auditoria mínima. Não apaga conteúdo de terceiros nem backups já transferidos.
- Controles de acesso, CSRF, confirmação e tratamento de registros inexistentes aprovados no [teste de integração](https://github.com/comverxa/crm/actions/runs/38750653354).
- O `/healthz` consulta a tabela `prospect_leads` e retorna **503** se o banco falhar, em vez de responder falsamente saudável. Testes de integração e do contêiner aprovados no commit `4b79d04`.
- O Railway confirmou implantação **SUCCESS** do commit `4b79d04` às 14:25 UTC, sem substituição do volume `/data`.
- O site comercial informa a finalidade e as condições da captação voluntária no seu aviso de privacidade, com revisão técnica ainda sujeita à identificação jurídica e ao contrato final.
- **Limitações:** os recursos não constituem procedimento integral de atendimento à LGPD; pedidos em bases externas, cópias locais, contratos e provedores parceiros exigem tratamento próprio. O CRM principal continua independente, e a integração de contatos não foi implementada.


## Gestão comercial do Prospect IA — 15/10/2026

O módulo independente de prospecção ganhou um funil de oportunidades com as etapas **Novo → Contato → Qualificação → Negociação → Proposta → Ganho/Perdido**. No painel autenticado o operador administrador registra a etapa de um lead usando seu ID, custo de tráfego em R$, valor fechado em R$, nome de campanha e motivo de perda (obrigatório para oportunidades perdidas). A grade de contatos mostra ID e etapa.

- O relatório de desempenho consulta o SQLite real, contabiliza ganhos, perdas, propostas, custos e receita de negócios fechados. Também agrupa contatos/ganhos/perdas por UF. A conversão é calculada sobre o total de contatos; não é a mesma coisa que ROI contábil.
- Os custos de mídia são **informados manualmente** por lead; não há API ativa de Meta Ads ou Google Ads, conciliação de campanhas ou garantia de atribuição publicitária.
- O formulário público conserva `utm_source`, `utm_medium` e `utm_campaign` vindos da URL em campos ocultos escapados. Só há registro de lead após o aceite do próprio formulário; nenhuma coleta de contatos externos é feita.
- A primeira origem conhecida do lead é preservada em atualizações posteriores, enquanto alterações intencionais na campanha pelo administrador são permitidas.
- Migrações SQLite são aditivas e preservam registros anteriores. O teste integrado executa transições, autenticação, rejeição de solicitações anônimas, proteção do formulário, receitas, perdas e custos.
- Teste CI de integração final: [GitHub Actions](https://github.com/comverxa/crm/actions/runs/38770814761), aprovado. O código está na branch `main`, commit `db6e133a`.
- **Limitações não resolvidas:** isso não move contatos automaticamente para o CRM principal, não valida o WhatsApp conectado e não implementa hospedagem multiempresa no módulo de prospecção. Não anunciar essas integrações como concluídas.

