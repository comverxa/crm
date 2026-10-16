# COMVERXA — Porta de liberação comercial segura (16/10/2026)

Este pacote NÃO declara o CRM homologado. Seu objetivo é diferenciar **publicação bem-sucedida** de **prontidão real para clientes pagantes**.

## Incluído nesta alteração
- Teste não destrutivo do domínio e saúde, interface QR, página administrativa, proteção das APIs anônimas, Prospect IA, política de privacidade e termos.
- Workflow GitHub com validação básica automática no pull request e modo estrito manual.
- O modo estrito retorna **NO_GO** enquanto não houver teste autenticado A/B, restauração independente, comprovação de canais, licenças, faturamento e instrumentos jurídicos.

## Cuidados
- Nenhum login de cliente, alteração de registros, disparo WhatsApp, manipulação de volume ou acesso a segredos.
- A avaliação A/B exige dados sintéticos e ambiente seguro; não testar leitura de dados reais de terceiros.
- Não oferecer WhatsApp QR em massa como envio garantido, sem controles de consentimento e homologação.
- O monitor público sozinho é insuficiente para liberar SaaS multiempresa.

## Execução
`node tests/commercial-release-gate.mjs`: smoke não destrutivo.
`node tests/commercial-release-gate.mjs --strict`: bloqueia liberação se falta a homologação.
