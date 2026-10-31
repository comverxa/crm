# COMVERXA Professional & Enterprise — validação para uso real

Data da revisão: 31/10/2026. Esta documentação não autoriza ativar cobrança real, importar dados do legado ou declarar recursos externos homologados sem seus próprios testes.

## Ambientes independentes
| Produto | Railway | Portal | Volume | Dados |
| --- | --- | --- | --- | --- |
| Professional | `comverxa-professional` | `https://comverxa-professional-production.up.railway.app/profissional/login` | `comverxa-professional-dados` em `/data` | `/data/professional.sqlite` |
| Enterprise | `comverxa-enterprise` | `https://comverxa-enterprise-production.up.railway.app/empresa/login` | `comverxa-enterprise-dados` em `/data` | `/data/enterprise.sqlite` |

Nenhum banco ou volume do COMVERXA principal ou do antigo piloto foi reutilizado. A implantação da branch `feature/comverxa-servicos-independentes` foi realizada em serviços novos. Volumes persistentes e buckets de backup separados por produto.

## Testes realizados
- [x] Testes automatizados locais de isolamento por tenant, autenticação, papéis, comissões, cobrança em sandbox e recuperação de senha
- [x] Smoke externo em GitHub Actions nos dois domínios Railway: `/`, `/healthz`, rotas de login, acesso não autenticado, APIs cruzadas, ativos estáticos, incluindo metas premium
- [x] Teste de regras de metas individuais sem meta coletiva, quatro faixas com bônus cumulativos e proibição de acessar vendas de outros corretores
- [x] Primeiro backup externo criptografado gerado e verificado por serviço (comprovação nos logs Railway)
- [x] Domínio `comverxa.com.br` verificado no provedor de e-mail, chaves de envio de e-mail referenciadas pela configuração Railway
- [ ] Testar entrega real de e-mail de recuperação e utilização do token no Professional e Enterprise
- [ ] Teste de login/logout com contas reais em ambos os serviços e troca obrigatória da senha inicial
- [ ] Testes de venda, lead, comissão, vigência, renovação, perfil profissional, PDF, menus e iOS/Android em sessão real
- [x] Recuperação técnica: em 31/10/2026, 02h22 UTC, cada serviço baixou o backup criptografado de seu bucket, abriu SQLite temporário restaurado e concluiu PRAGMA integrity_check com sucesso (logs Railway: restoredToTemporaryDatabase=true)
- [ ] Simulação operacional completa de desastre em ambiente independente, incluindo autenticação, procedimento, responsáveis e tempo de recuperação documentados

- [x] Correção de retorno do Stripe Checkout para a rota individual /profissional/app ou empresarial /empresa/app, com testes automatizados
- [x] Página Minha conta inclui diagnóstico administrativo de homologação, sem afirmar liberação comercial prematura

## Integrações
- **QR Evolution:** configuração de servidor habilitada por referência a credenciais de infraestrutura já existente. NÃO significa que um número foi escaneado/conectado. É necessário criar instância pelo painel e escanear QR em cada ambiente.
- **Meta Cloud API:** ainda requer app secret do Meta Developers, identificação do número, token de acesso, webhook e teste real de envio/recebimento. Não declarar online sem validação.
- **Resend:** domínio verificado e configuração referenciada nos dois serviços; entrega de recuperação necessita teste real.
- **Stripe:** pagamento real deve permanecer desativado até autorização explícita do proprietário, conexão de conta/credenciais, validação de preços, contratos e teste de eventos assinados. Planos e cobranças simuladas não comprovam vendas reais.
- **DNS:** ambos subdomínios oficiais `profissional.comverxa.com.br` e `empresa.comverxa.com.br` aguardam CNAME e TXT de verificação no Registro.br e emissão de certificado. Os domínios Railway estão disponíveis para testes.

## Portões para venda comercial
1. Usuário real consegue entrar, trocar senha, salvar perfil, cadastrar lead/venda, consultar próprio dashboard e gerar demonstrativo sem erro.
2. Empresa cadastra diretor, gerente, supervisor e corretor; cada papel acessa apenas suas informações autorizadas.
3. Integrações WhatsApp e Webhook com provedores são homologadas em números reais; respeitar as políticas dos provedores e a LGPD para mensagens e captação.
4. Subdomínios com HTTPS verificado, termos e política de privacidade publicados, suporte e recuperação de conta operacionais.
5. Backup restaurável testado; monitoramento e alertas de indisponibilidade; plano de contingência para e-mail e mensageria.
6. Cobrança real somente depois de contrato e fluxo de pagamento aprovados, preços/regras de licenças conferidos, e autorização explícita.

**Regra de comunicação:** status `SUCCESS` de deploy e smoke HTTP não são sinônimos de homologação comercial ponta a ponta. Nunca afirmar que números Meta/QR estão sincronizados ou que cobrança real está ativa sem testes reais.
