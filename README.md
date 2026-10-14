# COMVERXA CRM

**Cada conversa, uma oportunidade.**

Site oficial de apresentação e comercialização da **COMVERXA**, plataforma de gestão comercial na nuvem para profissionais, MEIs, equipes e empresas.

- **Site comercial (GitHub Pages):** https://comverxa.github.io/crm/
- **Acesso e cadastro no CRM:** https://conecta-crm-saas-production.up.railway.app/
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

## Arquitetura

Este repositório contém somente o **site público, estático** e um painel demonstrativo local. Não armazena nem executa as contas e os dados do CRM de produção.

- `site/index.html`: página comercial principal, conteúdo, simulador e interações simples.
- `site/assets/style.css`: identidade visual responsiva.
- `site/.nojekyll`: compatibilidade do GitHub Pages.
- `.github/workflows/pages.yml`: publicação automática do diretório `site/` a cada push na branch `main`.
- `app.html`: demonstração local independente, **não** é o aplicativo de produção.
- Aplicativo de produção hospedado no **Railway**, com armazenamento e autenticação próprios.

### Como atualizar o site

Altere `site/index.html` e/ou `site/assets/style.css` e faça commit na branch `main`. O workflow GitHub Actions publica `site/`. Confira a conclusão em https://github.com/comverxa/crm/actions.

A página comercial não possui endpoint próprio de captura de leads. Para receber solicitações de contato sem exigir uma nova conta no CRM, é necessário configurar um canal comercial oficial e um endpoint/formulário com tratamento de dados e consentimento apropriados. Não anuncie essa função como existente antes de implementá-la.

## Segurança e conteúdo

**Nunca** envie para este repositório credenciais, tokens Meta, chaves API, dados reais de clientes, arquivos SQLite ou variáveis secretas. Evite usar depoimentos, resultados ou números de performance sem comprovação. Os números exibidos na prévia do sistema são fictícios, utilizados exclusivamente para ilustrar a interface.

© 2026 COMVERXA.
