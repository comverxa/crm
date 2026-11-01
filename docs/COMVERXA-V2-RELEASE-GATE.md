# COMVERXA V2 — critérios para publicação real

Data: 2026-11-01. Branch isolada para não modificar produção existente.

## Infraestrutura verificada
- Railway project: COMVERXA Next - Reconstrucao (ambiente development).
- Serviços V2 Professional, Enterprise e Control Center: staged-create, sem source, domínio ou deployment.
- Serviços antigos Professional e Enterprise: Railway online, mas sem validação funcional dos logins ou WhatsApp.
- Central de controle antiga: offline, última implantação falhou.

## Bloqueadores P0 de produção
- [ ] Commitar implementação V2 no GitHub (frontend e backend). Código local não está publicado.
- [ ] Autenticação real por usuário com sessão, recuperação de senha, hash, autorização por perfil e organização (não usar token administrativo compartilhado no navegador).
- [ ] Isolamento multiempresa em tabelas e consultas e teste de acesso cruzado.
- [ ] Banco de dados provisionado, migrações reversíveis e restauração de backup comprovada.
- [ ] Deploy HTTPS em domínio Railway, health e readiness, frontend ligado ao backend.
- [ ] Teste de gravação, leitura e atualização de leads/vendas entre sessões reais.
- [ ] WhatsApp Oficial: credenciais em secrets Railway, assinatura de webhook, recebimento e envio real e estados da mensagem comprovados.
- [ ] Coexistence: comprovar elegibilidade e sincronização com aparelho no número real escolhido.
- [ ] WhatsApp QR não oficial: conector separado, persistência e reconexão de sessão; comunicar risco de bloqueio e ausência de suporte oficial.
- [ ] Logs sem dados sensíveis, trilha de auditoria, limites de envio e requisitos LGPD.
- [ ] Teste real de login, cadastro, envio, resposta e sincronização pelo usuário antes da liberação.

## Regra de lançamento
Não anunciar produção V2, comercialização ou WhatsApp operacional enquanto qualquer P0 relevante estiver sem evidência. Não migrar/apagar projetos antigos sem inventário e aprovação explícita. Não ativar cobrança.

## Fluxo de trabalho
1. Desenvolver e revisar nesta branch.
2. Implantar a branch num ambiente de desenvolvimento isolado.
3. Testar no endereço HTTPS gerado pelo Railway.
4. Promover somente após checklist P0 comprovado.
