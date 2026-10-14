# COMVERXA CRM — Critérios de homologação para comercialização
**Data: 14/10/2026 | Situação: PILOTO CONTROLADO / NÃO HOMOLOGADO PARA ESCALA**

O CRM está online e o ADM Master funciona; o laboratório financeiro é fictício. Este documento define evidências mínimas para comercialização profissional de um software SaaS multiempresa. **Um HTTP 200 ou deployment SUCCESS não prova segurança ponta a ponta.**

## Evidências já verificadas (14/10/2026)
- [x] Domínio `app.comverxa.com.br` conectado ao Railway, serviço online com 1 réplica e healthcheck `/healthz` OK.
- [x] CRM administrativo via `/admin` já acessado com sucesso pelo titular.
- [x] Acesso anônimo às APIs `/api/master/me`, `/api/master/overview`, `/api/master/finance/overview`, `/api/master/billing-lab/overview` recusado (HTTP 401).
- [x] Testes automatizados de laboratório com autenticação simulada e CSRF, sem transações financeiras reais.
- [x] Criação e pagamento de cobrança fictícia confirmados em navegador móvel.
- [x] Site comercial e páginas públicas `privacidade.html` e `termos.html` acessíveis.
- [x] Pipeline CI para smoke test público sem autenticação (`.github/workflows/commercial-readiness.yml`).
- [ ] Versão do laboratório de renovação/inadimplência **em revisão para publicação**; preparada e com testes CI, ainda não em produção.

## P0 — bloqueiam comercialização em escala

### 1. Autorização multiempresa (tenant isolation)
Criar duas empresas fictícias A/B e usuários comuns com papéis diferentes. Adicionar lead na empresa A. Verificar por rede HTTP que B não pode ler, editar, excluir, exportar ou contar dados de A mesmo alterando identificadores (IDs) nas rotas. Repetir para funil, propostas, canais WhatsApp, relatórios e configurações. **Aceite:** nenhuma fuga, 401/403/404 sem dados e log de incidente. Não usar dados reais de clientes no teste.

### 2. Autenticação e papéis
Homologar login normal, redefinição de senha, expiração/revogação de sessão, logout, proteção CSRF, regras ADM Master vs gerente vs operador, limites por usuário e ataques de força bruta. **Aceite:** nenhuma permissão indevida e resets invalidados após uso; cookies Secure/HttpOnly/SameSite.

### 3. Backup e restauração
Volume `/data` é persistente, mas **não é cópia de segurança por si só**. Definir backup SQLite consistente (API de backup/SQLite VACUUM INTO ou snapshot compatível), periodicidade, criptografia, armazenamento externo, retenção e controle de acesso. Executar RESTAURAÇÃO em ambiente separado e documentar tempo/perda máxima aceitáveis (RTO/RPO). Incluir bancos principal, financeiro e laboratório apenas conforme necessidade de negócio. **Aceite:** arquivo de backup testado, inventário e relatório de restauração. **Nunca** excluir/formatar `saas-dados` para teste.

### 4. Continuidade de hospedagem e custos
Railway encontrava-se em período TRIAL na tela do titular em 14/10/2026; confirmar método de pagamento, limite de uso, faturamento, recursos, volume, domínio e alertas antes de vender planos mensais. Ajustar capacidade com carga de teste. **Aceite:** infraestrutura de produção sustentada com contrato e monitoramento de orçamento. O volume atualmente tem tamanho configurado de 500 MB na tela do titular; reavaliar para mídia/mensagens conforme escala.

### 5. LGPD e contratos
Identificar formalmente fornecedor (nome/razão social, CPF/CNPJ, endereço), política de retenção e suboperadores; revisar avisos, termos, DPA e contrato por advogado habilitado. Implementar direitos de titulares, exportação/eliminação por conta e resposta a incidentes. **Aceite:** documentos finais, assinaturas, responsáveis e procedimento de exclusão e acesso aos dados.

### 6. Recursos anunciados no plano
Homologar um a um: cadastro PF/MEI/PJ; trial de 14 dias; limites reais de usuários/leads/canais; gestão de assinaturas, vencimentos e bloqueios; recuperação de senha; WhatsApp por QR e Meta API (se oferecidos); mensagens e histórico sincronizados no CRM; funil e propostas; relatório de vendas e perdas; métricas de tráfego pago por estado/região. **Aceite:** evidência em contas isoladas, sem divulgar integração externa não configurada.

## P1 — antes de ampliar vendas
- Observabilidade com alertas de erros 5xx, implantação, falha de login, consumo de disco e indisponibilidade.
- Auditoria persistente de mudanças por usuário: data/hora, organização, entidade, campo alterado, antes/depois com mascaramento apropriado.
- Política de senha/segredo, rotação, contas de serviço e não exposição de tokens em URLs ou logs.
- Gestão de planos centralizada no ADM Master, registros de aceite dos termos, suspensão com carência, histórico comercial e suporte.
- Rate limit em login, envio de e-mails, links mágicos, cadastro, exportações e APIs sensíveis.
- Refatorar publicação do backend para repositório privado/versionado e pipeline previsível. **Código fonte hoje depende de variáveis `CVX_SOURCE_1..4` e comando de inicialização longo**, o que aumenta risco operacional e dificulta auditoria e rollback.
- Testes automatizados com usuário autenticado em ambiente de homologação e backup de base fictícia.
- Verificar HSTS e X-Content-Type-Options em respostas administrativas; smoke público encontrou avisos, não falhas críticas.

## P2 — premium e escala
- UI design system do CRM com tipografia consistente, acessibilidade (teclado, labels, contraste, estados de erro), modo mobile e layouts de tabela.
- Onboarding guiado com checklist de primeiro acesso, convite de usuários e seleção de plano sem fricção.
- Painel do titular: MRR, ARR, inadimplência, churn, LTV, trials convertidos, clientes por plano, auditoria e eventos financeiros.
- Cobrança recorrente com gateway homologado, assinatura idempotente, webhooks assinados, reconciliação e estornos. Não habilitar cobrança real sem aceite expresso.
- Mensuração de funil e paid traffic com origem/campanha/UTM e separação por empresa.

## Roteiro mínimo para um cliente piloto
1. Validar cadastro e e-mail, confirmar natureza PF/MEI/PJ.
2. Aceitar termos/aviso de privacidade e registrar contrato individual revisado.
3. Escolher plano **sob consulta**, registrar pagamento real somente após comprová-lo e ativar a conta explicitamente.
4. Criar usuário, lead e proposta fictícios, operar uma semana sob supervisão.
5. Testar exportação e recuperação de acesso; anotar erros e tempos de resposta.
6. Auditar acesso entre empresas e confirmar processo de suporte antes de ampliar.

**Decisão de lançamento:** Liberar **piloto assistido e limitado** apenas após atender P0 relacionados ao uso real do piloto. O site pode captar interessados. Não anunciar “100% seguro”, “LGPD certificado”, “SLA garantido”, “cobrança automática” ou “WhatsApp sincronizado” sem comprovação.
