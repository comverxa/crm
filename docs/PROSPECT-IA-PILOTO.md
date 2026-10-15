# COMVERXA Prospect IA — Entrega técnica de piloto, 14/10/2026

## Escopo implementado neste branch

- Dashboard premium responsivo para **ADM Master autenticado** no caminho **/prospect-ia**, quando a extensão estiver implantada no SaaS Railway.
- Cadastro de oportunidades, importação simples CSV (lotes de até 300 registros), deduplicação por telefone, origem, produto, cidade e UF.
- Temperatura e escore automático por regras determinísticas; IA generativa apenas quando a chave externa estiver configurada.
- Registro explícito de autorização, evidência de consentimento, opt-out, trilha básica de auditoria.
- Campanhas de templates aprovados do WhatsApp Cloud API, fila somente de contatos autorizados, lotes limitados de até 8 e confirmação manual do operador, sem integração não oficial de disparo.
- Banco separado de piloto: /data/comverxa-prospect-ia.sqlite. Nenhum banco preexistente é substituído.
- Testes de sintaxe e invariantes em tests/prospect-ia.test.mjs.

## Configuração opcional no Railway — não salvar valores no GitHub

- OPENAI_API_KEY: habilita orientação comercial com IA via API (custo externo conforme consumo).
- OPENAI_MODEL: modelo aprovado para uso na conta, default gpt-4.1-mini.
- META_ACCESS_TOKEN e META_PHONE_NUMBER_ID: habilitam envio de templates aprovados pela API Oficial da Meta, sujeito a autorização válida, disponibilidade, custos, limites e qualidade do número.

**Não acrescentar nem divulgar credenciais neste repositório.** Uma variável de ambiente configurada não equivale a homologação de envio.

## O que NÃO está pronto

- Acesso aos módulos por cada empresa cliente e isolamento entre tenants: módulo atualmente **somente do proprietário (ADM Master)**.
- Captação automática de leads em Google Maps, Instagram, CNPJ ou grupos de WhatsApp: não implementada. Preferir fontes licenciadas, termos de uso, direitos e base legal.
- IA autônoma com conversa bidirecional e funil acionado por mensagens: não implementada.
- Envio programado em segundo plano, taxas globais, webhooks de entrega, monitoramento de opt-out recebido pelo WhatsApp: não implementados.
- Cotação, emissão, FIPE e integrações com seguradoras: não implementados neste módulo.
- Cobrança recorrente e planos multiempresa prontos para comercialização: **pendentes**, conforme docs/PRODUCAO-HOMOLOGACAO-COMVERXA.md.
- Evidência de homologação de segurança, restaurabilidade de backup e testes ponta a ponta autenticados.

## Verificação de implantação

1. Conferir deploy SUCCESS e /healthz, sem erros de startup.
2. Autenticar no /admin; abrir /prospect-ia (sem sessão deve responder 401).
3. Cadastrar lead **fictício**, opt-in falso; confirmar que não entra na campanha.
4. Cadastrar outro lead de teste com autorização de demonstração e comprovante fictício (nunca enviar a número real sem autorização).
5. Executar reclassificação; conferir total e temperaturas.
6. Criar campanha fictícia; verificar a fila. **Não executar envio real em homologação sem número de teste Meta e permissão.**
7. Revogar autorização; validar cancelamento dos envios pendentes.
8. Verificar acessibilidade, limites, observabilidade e auditoria antes de lançar clientes.

## Implantação no SaaS atual

O runtime atual do COMVERXA é uma Railway Bun Function com código original reconstruído via variáveis CVX_SOURCE_1..4. Esta extensão é instalada **antes da importação final do aplicativo original**, por meio de um wrapper de Bun.serve. Por prudência, não publicar automaticamente a extensão a partir do GitHub sem verificar a versão ativa e os testes. O código já possui limitações arquiteturais que requerem migração para repositório privado e pipeline versionado.

## Uso responsável

API oficial exige destinatários autorizados, templates aprovados em mensagens iniciadas pela empresa, tratamento de opt-outs, respeito aos limites de envio e às políticas da Meta. Importar telefones de terceiros não fornece autorização para disparo. Observação: uma ferramenta via QR Code ou integração não oficial não é alternativa recomendada para campanhas em escala.
