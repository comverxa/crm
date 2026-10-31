# COMVERXA Control Center — implantação isolada

**Status:** implementação inicial; não pronta para comercialização. Não conectar bases de clientes sem autorização e testes de segregação.

## Modelo de implantação
- Criar um **terceiro serviço Railway** a partir da branch revisada, sem volumes/bancos dos serviços Professional e Enterprise.
- Dockerfile: `Dockerfile.owner-control-center`.
- Domínio pretendido: `admin.comverxa.com.br`. Não adicionar CNAME sem usar o alvo exibido no serviço Railway.
- Rota de acesso: `/owner`. Healthcheck: `/healthz`.
- Sem integração de dados de clientes nessa primeira versão; os cards são explicitamente informativos.

## Configurações necessárias (segredos apenas no Railway)
- `CVX_OWNER_EMAIL`: e-mail exclusivo do titular.
- `CVX_OWNER_PASSWORD_HASH`: sal hexadecimal de 16 bytes + ':' + hash scrypt hexadecimal de 64 bytes.
- `CVX_OWNER_ORIGIN`: `https://admin.comverxa.com.br`.
- `PORT`: porta de aplicação, geralmente 3000.

Gerar o hash em ambiente local privado, **nunca compartilhando a senha aqui ou no GitHub**:

```bash
node -e 'const c=require("node:crypto");const p=process.env.OWNER_PASSWORD;if(!p||p.length<16)throw Error("Use OWNER_PASSWORD longo");const salt=c.randomBytes(16);console.log(salt.toString("hex")+":"+c.scryptSync(p,salt,64).toString("hex"))'
```

Forneça OWNER_PASSWORD no terminal privado antes de executar. Não registre esse valor em arquivos ou logs.

## Aprovação obrigatória antes de produção
1. GitHub Actions com testes de isolamento e login aprovados.
2. HTTPS válido e configuração de DNS verificada.
3. Confirmar que nenhum endpoint administrativo está disponível nos domínios de clientes.
4. Simular tentativas inválidas, perda de sessão, login e logout.
5. Revisar política de bloqueio e persistência de sessão (em memória: reinicialização encerra sessões).
6. Adicionar MFA, recuperação de acesso segura, logs de auditoria e integração segregada com dados comerciais antes de operar com clientes reais.
7. Testar backup, recuperação, observabilidade e políticas de atualização.

**Não** reutilizar senha, cookie, banco SQLite ou volume dos serviços de clientes.
