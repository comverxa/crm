# Homologação da importação de leads — COMVERXA Professional

## Escopo da versão
- Importação CSV/TXT e colagem de registros; não afirmar suporte a XLSX antes da implementação.
- Prévia e confirmação obrigatória; atribuição ao vendedor autenticado.
- Lotes de até 20 enviados por requisição, limite de 500 registros na interface.
- Servidor verifica duplicados por telefone **ou** e-mail dentro do tenant.
- Nenhum envio automático de mensagens é executado pela importação.

## Testes de aceite antes de implantação
1. Entrar no Professional com uma conta individual de teste; confirmar ausência do menu ADM Master.
2. Colar texto com Nome, Telefone, E-mail; revisar prévia e importar.
3. Importar CSV UTF-8 com cabeçalho `Nome,Telefone,Email`; verificar DDD extraído.
4. Reimportar os mesmos dados; duplicados não devem ser criados.
5. Importar contato com mesmo e-mail e telefone diferente; deve contar como duplicado.
6. Colar mais de 500 contatos; o sistema deve avisar sem importar parcialmente.
7. Testar mais de 20 contatos; verificar total criado e contabilização.
8. Verificar isolamento entre dois usuários/tenants de teste.
9. Interromper a importação entre lotes; informar que alguns lotes podem ter sido criados, sem alegar rollback total.
10. Garantir que os leads existentes, usuários, sessões e históricos foram preservados.
11. Realizar teste em ambiente não produtivo e registrar evidências antes do merge.
12. Conferir o deploy e o HTTPS em `profissional.comverxa.com.br` após publicação autorizada.

## Limitações conhecidas
- XLSX/XLS não é aceito diretamente. Exportar CSV UTF-8 no Excel.
- CSV com aspas e campos contendo quebras de linha exige validação adicional.
- E-mails sem rótulos claros podem exigir revisão manual.
- O sistema não importa anexos de e-mail automaticamente.
- Importações são em lotes; não são uma transação atômica de ponta a ponta.
- A verificação de duplicidade não substitui restrição UNIQUE transacional em situação de concorrência: testar duas importações simultâneas antes de alta escala.

## Publicação
Não misturar a implantação dessa função com a ativação do Control Center. Fazer backup verificado, revisar diff, executar testes, publicar somente o serviço Professional e realizar smoke test. Preservar a implantação anterior para rollback. Não migrar bancos ou alterar usuários sem necessidade.
