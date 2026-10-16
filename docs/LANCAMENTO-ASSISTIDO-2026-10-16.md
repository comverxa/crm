# COMVERXA — Entrega de lançamento assistido | 16/10/2026

## Decisão técnica (15/10/2026 à noite, Brasil)
**Situação: OPERACIONAL PARA USO INTERNO E DEMONSTRAÇÃO; VENDA EM ESCALA E OPERAÇÃO AUTÔNOMA MULTICLIENTE AINDA NÃO HOMOLOGADAS.**
Esta nota não substitui a validação de segurança, restauração e documentos jurídicos. Nenhuma confirmação de cobrança real ou integração de pagamentos foi produzida.

## Links oficiais para operar amanhã
- CRM e cadastro/login: https://app.comverxa.com.br/
- Site comercial: https://comverxa.github.io/crm/
- Portal do cliente: https://comverxa.github.io/crm/acesso.html
- ADM Master: https://app.comverxa.com.br/admin
- Contratos/financeiro manual: https://app.comverxa.com.br/admin/finance
- Termos: https://comverxa.github.io/crm/termos.html
- Privacidade: https://comverxa.github.io/crm/privacidade.html
- Evidências do QA público: https://github.com/comverxa/crm/actions/runs/38839488873

## Evidências técnicas atuais
- Seis serviços Railway online (SaaS, Prospect IA, CRM de conector, Evolution API, Postgres, Redis). Sem incidentes ou falhas 5xx na janela observada de duas horas na data da auditoria.
- Domínio app.comverxa.com.br verificado; DNS apontando para o serviço correto, certificado TLS válido.
- Teste de aceitação pública em GitHub Actions: aprovado com 0 falhas e 3 avisos de cabeçalhos. Proteção anônima de CRM/ADM, página comercial, termos, LGPD, QR/custos e fila assistida.
- Testes autenticados cruzando duas empresas diferentes ainda não realizados; backups externos/restauração não comprovados; pagamentos automáticos reais não configurados.
- O envio por QR confirmado anteriormente foi individual. Disparo em lote com botão de enviar até 10 foi testado apenas por API simulada; **não entrou em produção**. Não anunciar envio automático em massa disponível.

## Operação interna/demonstração
1. Entrar no CRM com a conta existente, conferir nome da empresa, plano e linha conectada antes de compartilhar telas.
2. Trabalhar com leads próprios ou sintéticos; verificar funil, propostas e atendimento individual na Caixa de entrada.
3. Para campanhas QR, usar Simular custo de disparos, selecionar contatos, validar consentimento, preparar atendimento e enviar individualmente após revisão. A tarifa da API oficial da Meta é R$ 0,00 neste método, não incluindo custos de ferramentas/servidor.
4. Acompanhar respostas, registrar propostas e conversões no CRM.
5. Antes de cadastrar informações de terceiros, validar base legal e que o acesso daquela organização está isolado.

## Comercialização responsável a partir de 16/10
**Pode iniciar:** demonstração, captação de interessados, proposta comercial, negociação de preços e pré-contratação condicionada à homologação. Preços do site são sob consulta. Não prometer recursos inexistentes.
**Não anunciar como entregue:** automação massiva de WhatsApp QR, cobrança automática, IA generativa/Meta Cloud não configuradas, backup/restauração testados ou isolamento multiempresa garantido.
**Se oferecer piloto pago e supervisionado:** somente após assinatura de instrumentos finalizados com identificação do fornecedor, consentimento de tratamento de dados e confirmação dos controles mínimos específicos, incluindo isolamento e backup. Sem isso, limitar a demonstrações com dados fictícios e pré-vendas sem coleta de dados operacionais.
**Documentos existentes:** docs/comercial/CONTRATO-SaaS-COMVERXA-MODELO.md e docs/comercial/ANEXO-LGPD-DPA-MODELO.md; ainda são minutas e precisam de revisão e identificação jurídica.

## Condições ainda necessárias para GO de clientes reais
- [ ] Testar o acesso de duas organizações fictícias A e B, incluindo leitura, alteração e exportação cruzadas, chat, relatórios e permissões.
- [ ] Executar backup externo criptografado e restaurar em ambiente isolado sem tocar no volume de produção.
- [ ] Confirmar faturamento ativo do Railway, orçamento e renovação de infraestrutura.
- [ ] Finalizar identificação do fornecedor (razão social/CPF-CNPJ/endereço), contrato, DPA, privacidade, suporte e política de retenção.
- [ ] Testar de ponta a ponta cadastro, login, convites, permissões, esqueci minha senha, cancelamento e acesso aos dados.
- [ ] Corrigir/avaliar avisos de HTTP security headers nas rotas administrativas.
- [ ] Verificar individualmente cada linha QR e consentimento dos destinatários antes de mensagens reais.

## Registro de integridade
Não excluir, formatar, substituir ou restaurar o volume Railway de produção sem backup consistente verificado e autorização. Testes citados usaram dados sintéticos sem gravação em registros de clientes.

## Decisão
**GO** para CRM interno, demonstração e prospecção comercial. **NO-GO** para comercialização SaaS em escala com dados reais de empresas independentes até homologação dos requisitos pendentes. Uma proposta pode ser emitida amanhã, mas entrega operacional ao cliente depende do aceite acima.

## Segurança e publicação — verificação adicional 16/10, 02:22 UTC
- ADM Master: HSTS max-age=31536000 e X-Content-Type-Options nosniff implantados no Railway sem alterar banco/volume. Implantação concluída com SUCCESS.
- Homologação pública com cabeçalhos reforçados: https://github.com/comverxa/crm/actions/runs/38840151562 — concluída com sucesso.
- Continuam pendentes testes de isolamento autenticado entre duas empresas e restauração independente do backup. Não registrar GO de venda SaaS multiempresa em escala por causa dessas evidências não coletadas.

### Habilitar backup no painel do proprietário (ação manual obrigatória)
1. Abra Railway → projeto de produção do SaaS → serviço conecta-crm-saas → aba Backups.
2. No volume saas-dados, habilite agenda Daily e crie um backup manual inicial. Não clique em Restore nem formate o volume.
3. Faça o mesmo para comverxa-prospect-ia-dados e, no projeto do conector, para os volumes Postgres/Redis conforme criticidade.
4. Confirme no painel o horário e status da cópia. Railway não possui ação disponível nesta integração para criar ou configurar backups de volumes; não afirmar que já estão ativos.
5. A restauração real deve ser testada num ambiente seguro, sem remover o volume em uso. O restore Railway cria volume substituto para revisão e só toma efeito após o deploy, portanto requer cuidado. Não realizar em produção sem plano e autorização.
Referência oficial: https://docs.railway.com/volumes/backups

### Informações necessárias do titular para contratos e faturamento
- Cadastro de fornecedor e natureza jurídica (PF/MEI/PJ), endereço contratual e canal de suporte.
- Situação do plano Railway e orçamento/faturamento ativo, que não é acessível por esta integração.
- Aceite jurídico dos modelos de contrato e DPA; o software não pode assinar ou conferir dados fiscais do fornecedor sozinho.
