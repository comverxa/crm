# COMVERXA Professional e Enterprise — implantação independente

## Estado e segurança

Este documento prepara **dois serviços Railway e dois bancos separados**. A branch de desenvolvimento **não** migra clientes do COMVERXA Comercial piloto, nem modifica a aplicação principal `app.comverxa.com.br`.

- **Professional**: `CVX_COM_PORTAL_MODE=individual`; acesso exclusivo em `/profissional/login`. Para executivos e corretores; carteira individual; cada tenant individual tem um único usuário.
- **Enterprise**: `CVX_COM_PORTAL_MODE=enterprise`; acesso exclusivo em `/empresa/login`. Empresa, diretoria, gerência, supervisão e equipe, com isolamento por tenant e atribuição de responsáveis.
- `CVX_COM_PORTAL_MODE=both` é compatibilidade do serviço piloto atual; não significa separação física.
- No modo independente, endpoints do outro produto e as rotas legadas de login retornam 404; arquivos estáticos, `/healthz` e webhooks validados pelo provedor permanecem acessíveis.
- A criação de tenants de produto incompatível é recusada; o bootstrap impede reaproveitar um banco com tenant inicial do produto errado.

## Preparação de infraestrutura (dois serviços novos)

1. Manter o serviço `comverxa-comercial-piloto` e seu volume `/data` sem modificações.
2. Criar um serviço **comverxa-professional** conectado à branch revisada, usando `Dockerfile.commercial`, com volume persistente **exclusivo** em `/data`.
3. Criar um serviço **comverxa-enterprise** separado, igualmente com `Dockerfile.commercial` e outro volume em `/data`.
4. Para cada serviço, configurar suas variáveis **secretas diretamente no Railway** (nunca no GitHub), domínio HTTPS, `/healthz` como health check, backup offsite separado e monitoramento.

| Variável | Professional | Enterprise |
| --- | --- | --- |
| `CVX_COM_PORTAL_MODE` | `individual` | `enterprise` |
| `CVX_COM_DB_PATH` | `/data/professional.sqlite` | `/data/enterprise.sqlite` |
| `CVX_COM_TENANT` | `bootstrap-professional` | `bootstrap-enterprise` |
| `CVX_COM_PUBLIC_ORIGIN` | HTTPS exclusivo do Professional | HTTPS exclusivo do Enterprise |
| `CVX_COM_ADMIN_EMAIL` | administrador inicial do serviço | administrador inicial do serviço |
| `CVX_COM_ADMIN_PASSWORD` | senha forte individual (mínimo 12 caracteres) | senha forte empresarial (mínimo 12 caracteres) |
| `CVX_COM_ENABLE_MASTER` | `1` somente para administrador autorizado | `1` somente para administrador autorizado |

**Nunca** apontar `CVX_COM_DB_PATH` para banco, volume ou credenciais do serviço legado. Cada implantação deve ter segredos de sessão/WhatsApp, configurações de Resend e backup segregados. Os cadastros anteriores permanecem no legado até migração expressamente planejada e testada; **nenhuma migração automática**.

## Critérios antes da comercialização

- `node --test tests/commercial-separate-services.test.mjs tests/commercial-products-access.test.mjs` sem falhas.
- Testar login/logout e recuperação de senha reais em **cada** domínio, sem sessão cruzada.
- Confirmar que executivo/corretor não vê dados de outro usuário/empresa; que supervisor vê apenas vendedores atribuídos; que gerente/diretor não acessa outro tenant.
- Testar criação/importação real de leads, vendas, histórico, metas, dashboard, imagens/áudios, menus e responsividade mobile/desktop.
- Homologar WhatsApp QR e Meta API em cada serviço, incluindo webhooks com autenticação e sincronização de conversas.
- Executar backup offsite criptografado e simulação documentada de restore independente em cada base.
- Verificar cobrança em modo de testes; só ativar cobrança real após comprovar contratos, pagamentos, bloqueios e contas vitalícias no ambiente correto.

**Status:** o código da branch oferece a opção de isolamento por serviço; implantação física, contas reais, integrações e operação comercial são etapas a validar. Um deploy `SUCCESS` sozinho não certifica todas as funcionalidades.
