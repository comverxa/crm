# COMVERXA — Piloto Comercial isolado (29/10/2026)

## Situação
Novo serviço Railway **comverxa-comercial-piloto** criado e mantido separado da função `conecta-crm-saas`.
- Domínio: https://comverxa-comercial-piloto-production.up.railway.app/login
- Projeto Railway: `Conecta CRM SaaS`, ambiente production (serviço distinto)
- Código: branch `feature/comverxa-premium-comercial-v1`, fixado ao commit de liberação
- Dados: volume **comverxa-comercial-piloto-dados**, 500 MB, em `/data`
- Banco: SQLite `CVX_COM_DB_PATH=/data/commercial-pilot.sqlite`, isolado de `saas-dados`
- Conta inicial: definida em variáveis seguras do serviço, sem senha padrão publicada em repositório
- HTTP: /healthz e /login; session cookie HttpOnly / Secure / SameSite=Strict
- O código só cria o usuário bootstrap caso ainda não exista. Troca de senha invalida sessões.

## Operação inicial
1. Abrir /login com usuário/senha inicial configurados no Railway.
2. **Trocar a senha em Minha conta** imediatamente. Ela não é armazenada em texto puro no banco.
3. Em Metas e Comissão, registrar as regras da empresa (faixas, bônus, taxas e objetivo coletivo).
4. Em Usuários, cadastrar operadores/gerentes; copiar o identificador da conta gerada; comunicar credenciais por canal privado.
5. Em Vendas, registrar vendas e confirmar se os valores aparecem no dashboard por competência.
6. Em Renovações, cadastrar vigência, consultar alertas 10/15/30 dias. **O sistema não envia mensagens**.
7. Na Equipe, verificar metas individuais, ranking, exportação CSV; em Metas, abrir demonstrativo para imprimir/salvar PDF.

## Controles
- As contas de empresa ficam isoladas por tenant e as rotas consultam tenant da sessão no servidor.
- Operadores não podem alterar comissão para efetiva nem editar registros de vendas fechadas.
- Criação de usuários restrita a admin/master, consulta de equipe a manager/admin/master.
- Senhas são derivadas com scrypt e salt aleatório; sessões são hash SHA-256 e CSRF aleatório.
- POST exige CSRF + origem compatível; relatórios comerciais exigem sessão.
- O serviço usa branch pinada para impedir deploy automático de novas alterações.

## Limitações e requisitos de comercialização
**Este é um piloto funcional, NÃO homologado para vender como produto completo.**
- É um banco separado do COMVERXA principal; não importa clientes, licenças ou WhatsApp existentes.
- O CRM principal no Railway continua sem os novos módulos integrados.
- A UI não inclui importação de leads/DDD, anexos, envio WhatsApp, IA nem cobrança recorrente nesse piloto.
- O demonstrativo PDF é HTML imprimível; não há fechamento contábil, conciliação de pagamento ou emissão de PDF servidor.
- Não há backup restaurado/offsite do novo volume, monitoramento formal, recertificação LGPD nem política de retenção implementada.
- Integração com carteira real requer migração testada, checagem de autorização A/B no CRM principal, backup verificado e rollback.
- A criação de serviço/volume adicionais pode gerar cobranças de hospedagem na conta Railway. Verificar fatura e orçamento no painel.

## Critérios antes de divulgar ao mercado
Backup/restauração em ambiente separado, autenticação e controle de acesso testados na produção principal, termo/DPA revisados, monitoramento, testes reais de WhatsApp, cobrança e relatórios, além de ensaio ponta a ponta no iPhone/Android/desktop. Piloto pode ser usado com dados fictícios e controlados até aprovação desses gates.
