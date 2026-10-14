# COMVERXA CRM — Entrega de versão comercial assistida
**Versão:** v1.0 RC1 (candidata à liberação comercial)  
**Data:** 14/10/2026  
**Status:** Aplicação online, portal do cliente e ADM Master publicados; **homologação de segurança e continuidade em aberto para escala**.

## 1. Endereços oficiais
- Comercial: https://comverxa.github.io/crm/
- Área do Cliente: https://comverxa.github.io/crm/acesso.html
- CRM (login/cadastro): https://app.comverxa.com.br/
- ADM Master: https://app.comverxa.com.br/admin
- Financeiro e contratos: https://app.comverxa.com.br/admin/finance
- Laboratório de Cobranças **SIMULADAS**: https://app.comverxa.com.br/admin/billing-lab
- Aviso de privacidade: https://comverxa.github.io/crm/privacidade.html
- Termos: https://comverxa.github.io/crm/termos.html

## 2. Recursos implantados e verificados tecnicamente
- CRM comercial com login no domínio próprio, área administrativa, funil, leads, propostas, vendas e integração de canais conforme as configurações da conta.
- Nova interface premium responsiva (14/10): cartões do painel em uma coluna no iPhone, duas colunas em tablet e quatro em desktop, navegação horizontal por abas e botão que se adapta à contagem de leads.
- Portal de cliente com entrada no CRM oficial, sem captura adicional de senha no GitHub Pages.
- Financeiro manual do ADM Master: contratos, mensalidades e recebimentos lançados manualmente, com histórico de auditoria.
- Laboratório de cobranças sem gateway real: criação, pagamento simulado, cancelamento, alertas de vencimento, inadimplência por faixa, renovação fictícia e lembrete interno.
- Site comercial com conteúdo de planos, call to actions, demonstração via e-mail, transparência sobre integrações pendentes, privacidade e termos.
- Teste público de aceite `.github/workflows/crm-launch-acceptance.yml`: CRM e documentos publicados, APIs privadas protegidas sem sessão, novos endpoints de renovação/lembrete sem acesso anônimo.
- Testes visuais com Chrome para iPhone e desktop, com dados **sintéticos** em vez de dados de clientes.
- Serviço Railway: 1 réplica em produção, healthcheck OK na publicação.

## 3. O que NÃO está homologado / não prometer
- Teste de isolamento entre DUAS empresas diferentes com usuários reais de teste, em todas as rotas e exportações.
- Teste de restauração de um backup externo íntegro, com RTO e RPO definidos.
- Revisão de segurança independente, varredura de vulnerabilidades, testes de carga e políticas de continuidade em nuvem.
- Cobrança real automática (nenhum gateway de pagamento contratado nem integrado).
- Integração WhatsApp/Meta sincronizada para todos os clientes: validar cada canal e plano antes de anunciá-la.
- Auditoria e titularidade de dados em todos os módulos: validar com sessões autenticadas.
- Revisão e assinatura dos modelos jurídicos com identidade formal da COMVERXA (fornecedor PF/MEI/PJ, CPF/CNPJ, endereço), suporte/SLA, responsabilidades e DPA.

## 4. Procedimento de venda inicial — piloto assistido
1. Receber a solicitação de demonstração do interessado por e-mail do site comercial.
2. Identificar a natureza da contratação (PF, MEI ou PJ) e escopo: usuários, limites, volume e canais.
3. Demonstrar apenas funcionalidades verificadas, sem prometer WhatsApp sincronizado sem integração testada.
4. Formalizar preço, prazo, identificação das partes e contrato **revisado**.
5. Criar a conta da organização no CRM e testar login do usuário responsável.
6. No ADM Master, confirmar o pagamento real manualmente quando aplicável, então ativar o plano.
7. Fazer onboarding com leads fictícios e verificar permissões e limites antes de importações reais.
8. Registrar suporte e acompanhar o piloto, com procedimento acordado de exportação e cancelamento.
9. Recolher aceite dos termos e do anexo LGPD/DPA com base legal compatível.

## 5. Pendências impeditivas para venda em escala (P0)
1. **Backup e restauração externa:** não confiar apenas na persistência do volume Railway; estabelecer cópias criptografadas fora do projeto e provar restauração.
2. **Segurança multiempresa:** duas contas de teste, permissão cruzada em leads, chats, propostas, relatórios, exportações, templates e configurações. Bloquear qualquer vazamento de tenants.
3. **Infraestrutura sustentável:** confirmar faturamento do Railway, volume, orçamento e alertas de indisponibilidade.
4. **Instrumentação e LGPD:** finalizar identidade jurídica, medidas de tratamento de dados, retenção, eliminação, incidentes, DPA e contrato com assessoria profissional.
5. **Teste de negócio ponta a ponta:** assinatura, convite de usuário, login, recuperação de senha, ativação/suspensão, funcionalidades anunciadas, cancelamento.

## 6. Documentos e testes
- `docs/PRODUCAO-HOMOLOGACAO-COMVERXA.md`
- `docs/comercial/CONTRATO-SaaS-COMVERXA-MODELO.md`
- `docs/comercial/ANEXO-LGPD-DPA-MODELO.md`
- `tests/premium-live-browser.mjs`
- `tests/premium-crm-browser.mjs`
- `tests/billing-lab-auth.test.mjs`
- `tests/commercial-readiness.mjs`

**Atenção:** Não usar o termo “certificado LGPD”, “100% seguro” ou “pronto para vendas em larga escala” enquanto os itens P0 permanecerem sem evidência. O SaaS pode ser demonstrado e usado internamente. Pilotos comerciais devem ser supervisionados e condicionados às homologações aplicáveis.
