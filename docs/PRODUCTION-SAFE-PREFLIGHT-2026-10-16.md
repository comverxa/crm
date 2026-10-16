# COMVERXA: verificação inicial sem dados pessoais — 16/10/2026

Script: `backend/production-safe-preflight.js`.

Ao iniciar o serviço, faz UMA consulta SQLite `SELECT` às vagas vitalícias e UMA consulta GET a `/instance/fetchInstances` da Evolution API. Escreve em log **somente contagens e estados**. Nunca registra e-mail, telefone, número WhatsApp, credencial, nome de empresa ou leads. Não altera a base, não envia mensagens e não reconfigura instâncias.

Logs de referência (apenas nomes de eventos): `CVX_READINESS_LICENSE` e `CVX_READINESS_WHATSAPP`.

Os resultados dos slots 1/2 indicam se está ativo ou reservado e o plano vigente; `slot1Business` indica plano Empresarial da primeira licença. A contagem de instâncias `open` confirma somente estado relatado pelo provedor, **não** entrega de mensagens, atribuição de canais no CRM, isolamento de empresas ou legalidade de disparos.

**Não declarar prontidão comercial integral** até restauração segura, teste A/B de duas empresas, pagamentos e contratos revisados.