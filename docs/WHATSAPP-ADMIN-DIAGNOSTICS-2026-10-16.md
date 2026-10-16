# COMVERXA — diagnóstico das linhas Evolution (16/10/2026)

O addon `backend/evolution-owner-diagnostics.js` cria `/admin/whatsapp-health` e `GET /api/master/whatsapp-health` na Bun Function do SaaS. A autenticação é delegada a `/api/master/me`. Leitura apenas: não envia, não cria e não reinicia instâncias.

**Atenção de segurança:** versões Evolution v2.3.7 podem devolver token no endpoint de listagem, por isso a resposta ao navegador é uma lista nova com *somente nome sanitizado e estado*. Não retornar o JSON original.

Não valida que as duas linhas do CRM estão atribuídas ao mesmo tenant nem confirma entrega ou recebimento real. Conexão `open` exige teste ponta a ponta com conta autorizada. Não utilizar sem backup da produção e sem controle de acesso ADM.

Credenciais lidas das variáveis atuais `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`, não publicadas no GitHub ou no navegador. Teste de fixture verifica duas conexões, recusa anônima e ausência de tokens.
