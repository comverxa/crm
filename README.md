# Conecta CRM — site comercial

Site comercial de apresentação do **Conecta CRM SaaS**, para profissionais autônomos, MEIs e empresas.

**Entrar no CRM:** https://conecta-crm-saas-production.up.railway.app/

**Site GitHub Pages (após ativação):** https://joaobotelho-executivo.github.io/conecta-crm-site/

## Como funciona

- Este repositório contém apenas HTML e CSS **públicos** do site comercial.
- O aplicativo CRM com cadastro, senha, leads, equipe e banco SQLite continua hospedado na **Railway**.
- **Não há dados reais de clientes neste repositório.** Não envie senhas, tokens Meta, chaves de API, bancos de dados, arquivos de configuração com segredos ou informações de clientes para este repositório.
- O site está em `site/` e o fluxo de publicação em `.github/workflows/pages.yml`.
- Para ativar GitHub Pages: em **Settings > Pages > Build and deployment**, selecione **GitHub Actions**. A ação `Publicar Conecta CRM no GitHub Pages` pode ser executada automaticamente a cada push ou manualmente em Actions.
- GitHub Pages é hospedagem de arquivos estáticos. Não executa o aplicativo com autenticação e dados.

## Comercialização

O SaaS da Railway inclui cadastro separado por contratante, login individual e período de teste. Cobrança automática, integração Meta por WhatsApp e validação final de segurança dependem de configurações adicionais; não anuncie essas integrações como ativas sem verificar.

## Arquivos

```text
site/
  index.html
  assets/style.css
  .nojekyll
.github/workflows/pages.yml
README.md
```
