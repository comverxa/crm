# COMVERXA CRM

**Cada conversa, uma oportunidade.**

Site oficial de apresentação e comercialização da **COMVERXA**, plataforma de gestão comercial na nuvem para profissionais, MEIs, equipes e empresas.

- **Site comercial (GitHub Pages):** https://comverxa.github.io/crm/
- **Acesso e cadastro no CRM:** https://app.comverxa.com.br/
- **Repositório:** https://github.com/comverxa/crm

## Experiência do site comercial

A página de vendas apresenta benefícios e recursos da COMVERXA, exemplos **ilustrativos** do dashboard e do funil de vendas, comparação entre trabalho manual e gestão centralizada, planos Essencial/Profissional/Empresarial, perguntas frequentes, e um **simulador interativo de compatibilidade de planos**.

O simulador utiliza apenas valores informados no navegador para comparar os limites publicados:

| Plano | Usuários | Leads | Linhas WhatsApp |
| --- | ---: | ---: | ---: |
| Essencial | até 2 | até 500 | 1 |
| Profissional | até 10 | até 10.000 | até 3 |
| Empresarial | até 40 | até 100.000 | até 3 |

O simulador não envia informações pessoais nem contrata planos. A contratação e o preço são **sob consulta**. A integração WhatsApp (QR/Evolution ou Meta Cloud API) depende da configuração de cada canal e da disponibilidade de serviços externos. O cadastro no app permite teste de 14 dias e não inicia cobrança automática.

## COMVERXA Prospect IA — módulo de prospecção em piloto (15/10/2026)

Foi desenvolvido um módulo independente de captação e qualificação, com interface premium, cadastro e importação de leads, formulário de consentimento, pontuação por regras, exclusão de listas de campanha, fila protegida contra envios paralelos, suporte condicional à API Oficial Meta e orientação de IA opcional.

- Código da aplicação: [backend/prospect-standalone.ts](./backend/prospect-standalone.ts)
- Formulário de captação (após implantação): `/captar`
- Painel administrativo (após implantação e login independente): `/prospect-ia`
- Testes automatizados e preparação Docker/Railway: [status verificado](./docs/PROSPECT-IA-STATUS-2026-10-15.md)

**Este módulo ainda NÃO está implantado nem disponível no domínio COMVERXA.** O Railway negou a criação de novo serviço por `Free plan resource provision limit exceeded`. A aplicação anterior foi preservada. Testes de integração aprovados no GitHub Actions não substituem a homologação da plataforma hospedada nem a integração de credenciais Meta/OpenAI. O módulo é restrito a um administrador e **não** oferece ainda isolamento multiempresa ou operação comercial em escala.

## Prontidão comercial (outubro/2026)

A COMVERXA dispõe de site comercial, domínio do CRM, painel ADM Master e módulo financeiro de registros manuais. O laboratório de cobranças é **simulação sem movimentação de dinheiro**. **O produto não deve ser descrito como totalmente homologado para vendas em escala até a conclusão dos requisitos P0.**

- [Matriz de produção e critérios P0/P1/P2](./docs/PRODUCAO-HOMOLOGACAO-COMVERXA.md)
- [Modelo de contrato SaaS para PF, MEI e PJ](./docs/comercial/CONTRATO-SaaS-COMVERXA-MODELO.md)
- [Anexo LGPD/DPA — minuta](./docs/comercial/ANEXO-LGPD-DPA-MODELO.md)
- [Aviso de privacidade público](./site/privacidade.html)
- [Termos públicos de uso](./site/termos.html)
- [Teste automático de prontidão pública](./tests/commercial-readiness.mjs)
- [CI — homologação pública](./.github/workflows/commercial-readiness.yml)

**Limitações importantes:** sem evidência de teste autenticado de isolamento multiempresa nem teste de restauração; pagamento recorrente real não ativado; integrações WhatsApp precisam ser homologadas individualmente; minutas exigem identificação formal do fornecedor e revisão jurídica. O Railway deve ter faturamento e continuidade confirmados antes de contratos mensais.

## Arquitetura

Este repositório contém o **site público estático**, demonstração local, minutas e testes auxiliares, além de módulos experimentais de suporte em `backend/`. O CRM completo continua implantado no Railway, e sua implementação original não é substituída pelos exemplos do repositório. Nenhuma credencial, banco ou dado real deve ser publicado aqui.

- `site/index.html`: página comercial principal, conteúdo, simulador e interações simples.
- `site/assets/style.css`: identidade visual responsiva.
- `site/.nojekyll`: compatibilidade do GitHub Pages.
- `.github/workflows/pages.yml`: publicação automática do diretório `site/` a cada push na branch `main`.
- `app.html`: demonstração local independente, **não** é o aplicativo de produção.
- Aplicativo de produção hospedado no **Railway**, com armazenamento e autenticação próprios.

### Como atualizar o site

Altere `site/index.html` e/ou `site/assets/style.css` e faça commit na branch `main`. O workflow GitHub Actions publica `site/`. Confira a conclusão em https://github.com/comverxa/crm/actions.

A página comercial não possui endpoint próprio de captura de leads. Para receber solicitações de contato sem exigir uma nova conta no CRM, é necessário configurar um canal comercial oficial e um endpoint/formulário com tratamento de dados e consentimento apropriados. Não anuncie essa função como existente antes de implementá-la.

## Administração da plataforma (titular)

- **Área protegida do proprietário:** https://app.comverxa.com.br/admin
- O acesso é distinto do cadastro comum do CRM e exige autenticação própria; conhecer o endereço ou informar um e-mail não garante acesso.
- O cadastro de empresas já diferencia **Pessoa Física, MEI e Pessoa Jurídica** e mantém dados e limites por cliente.
- O backend possui gerenciamento administrativo de planos (teste, ativo, suspenso) e solicitações de contratação. Só marcar o status `active` após confirmação efetiva do pagamento.
- A comercialização com renovação e pagamentos recorrentes automatizados depende de integração financeira. Não anunciar cobrança automática como disponível antes da validação.
- Logs completos de login, alteração por usuário e relatórios de faturamento devem ser testados especificamente antes de oferecê-los como recursos contratados.
- Nunca salvar chave de administração, token de acesso ou e-mail privado do titular no GitHub Pages nem neste repositório.

## Segurança e conteúdo

**Nunca** envie para este repositório credenciais, tokens Meta, chaves API, dados reais de clientes, arquivos SQLite ou variáveis secretas. Evite usar depoimentos, resultados ou números de performance sem comprovação. Os números exibidos na prévia do sistema são fictícios, utilizados exclusivamente para ilustrar a interface.

© 2026 COMVERXA.
