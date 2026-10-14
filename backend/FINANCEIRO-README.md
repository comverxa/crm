# COMVERXA — Módulo Financeiro e Contratos (ADM Master)

Escopo da primeira versão: registro manual de contratos comerciais, mensalidades, pagamentos confirmados e histórico de auditoria para contas Pessoa Física, MEI e Pessoa Jurídica. Acessado em `/admin/finance` apenas por sessão autenticada de proprietário da plataforma.

- Os dados financeiros ficam no volume privado persistente do Railway, em um banco SQLite independente: `/data/comverxa-finance.sqlite`.
- Os registros são vinculados ao ID imutável da empresa já cadastrada no CRM. Não há compartilhamento entre empresas usuárias.
- Não armazena números de cartão nem dados fiscais completos. CPF/CNPJ e documentos legais precisam de política de tratamento e confirmação posterior.
- Gravar um pagamento no financeiro **não** constitui integração com banco nem comprovação automática de pagamento. A liberação de acesso continua uma ação separada no ADM Master.
- Registros de pagamentos não são excluídos. Estornos administrativos precisam ser feitos com justificativa e trilha de auditoria.
- A renovação é assistida; gateway recorrente, geração de nota fiscal, envio de boleto e conciliação bancária ainda **não** estão integrados.
- Exportações contêm informações comerciais; armazene em local seguro. Recomendável backup externo criptografado com teste de restauração.
- A regra de autorização reutiliza a sessão válida de `/api/master/me` antes de qualquer leitura ou gravação.

## Aceitação mínima

1. Sem sessão administrativa, `/admin/finance` não mostra dados financeiros e `/api/master/finance/*` retorna 401 ou 403.
2. A lista de clientes deve corresponder a `/api/master/overview` sem criar contas fictícias.
3. Contrato permite registrar plano, valor mensal e próximo vencimento sem modificar imediatamente o status do CRM.
4. Pagamento confirmado exige valor, competência, data e meio de pagamento.
5. Auditoria registra criação/alteração de contratos e inclusão de pagamentos, sem guardar cookies, senhas ou tokens.
6. Exportação CSV só funciona para sessão administrativa válida.

## Segurança de implantação

O projeto público GitHub Pages contém apenas o site institucional; o backend comercial roda na Function privada do Railway. Não publique o banco SQLite, tokens de produção, links mágicos, e-mails pessoais ou dados dos clientes no repositório público.
