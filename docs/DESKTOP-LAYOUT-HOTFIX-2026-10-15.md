# COMVERXA — Correção do layout do CRM em notebook (15/10/2026)

## Sintoma reproduzido
Na resolução 1365 px, a barra lateral fixa de 252 px era sobreposta à área principal. O CSS de marca reservava margem de 252 px no cabeçalho, mas não em `#app main`. Uma folha de estilos posterior anulava o espaço superior reservado ao logotipo. O teste anterior verificava apenas overflow horizontal e, portanto, não detectava conteúdo **encoberto**.

## Correção comprovada
- CSS versionado em `backend/desktop-layout.css`; ajuste aplicado somente acima de 1100 px.
- `#app main` deslocado para a direita em 252 px e largura reduzida ao espaço disponível.
- Barra lateral com espaçamento superior de 112 px para proteger o nome/logo.
- Em telas até 1100 px, permanece navegação horizontal e painel com largura completa.
- Regressão visual via `.github/workflows/desktop-layout-diagnostic.yml`: 390, 960, 1365 e 1440 px, verificando menu, primeiro item, dashboard, ausência de oclusão e de rolagem horizontal.
- Execução de validação real: https://github.com/comverxa/crm/actions/runs/38777245627 (aprovada).
- Aplicativo https://app.comverxa.com.br/ com deploy Railway SUCCESS, após validação da resposta HTML e do layout real, sem sessão de cliente e com indicadores sintéticos.

## Nota importante de publicação Railway Functions
A função atual embute a base original em `CVX_SOURCE_1..4`, e a linha de comando `./run.sh <fonte-base64>` fica próxima do limite de comprimento de um argumento Linux (~131 KB). Uma tentativa de embutir um CSS completo no próprio comando **falhou ao iniciar** por `Argument list too long`; ela foi revertida integralmente para uma implantação estável.

A implementação publicada mantém o CSS em `CVX_CSS` (variável de configuração do serviço, texto de estilo não sensível) e utiliza um interceptador extremamente curto, instalado na camada externa do servidor, para inserir um bloco `<style>` na resposta HTML. Esta alternativa preservou o comando de inicialização abaixo do limite e passou na verificação por navegador. O valor-fonte versionado está em `backend/desktop-layout.css`.

**Não** aumentar o comando da Function com módulos ou CSS extensos. Planejar migração para uma aplicação versionada em repositório privado e com build reproduzível. Novas alterações de interface devem ser verificadas em produção e não apenas pela existência do CSS na configuração. A correção **não** certifica a integração WhatsApp nem o isolamento multiempresa.

## Orientação ao usuário
No notebook, abrir https://app.comverxa.com.br/ e atualizar com `Ctrl+Shift+R`. Usar zoom 100% e verificar se os cartões e título estão inteiramente à direita do menu.
