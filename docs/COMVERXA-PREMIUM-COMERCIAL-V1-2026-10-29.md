# COMVERXA Premium Comercial — desenvolvimento iniciado em 29/10/2026

## Pedido e escopo
Adicionar ao COMVERXA os recursos VISÍVEIS nas telas compartilhadas do Vendly, em implementação própria, mais sofisticada, responsiva e multiempresa, sem copiar marca, identidade ou código de terceiros. Recursos do Vendly não visualizados ou protegidos por login não foram auditados.

### Referências funcionais
1. Dashboard mensal: realizado, metas em faixas, faltantes, percentual, progresso, ganhos, produtividade diária e projeções.
2. Financeiro Comercial: salário fixo de referência, comissão por venda, ativação e recorrência, bônus progressivos, valores retidos e demonstrativo PDF.
3. Vendas e leads: data, origem, UF, produto, valor, status, negociação, perda, cancelamento, ativação e registro vinculado ao vendedor.
4. Seguros/proteção veicular: vigências, veículo por referência interna, contrato, renovação, vencidos, até 30, 15 e 10 dias.
5. Perfil e planos: preparação para vincular ao login real, papéis e ADM Master; não duplicar cadastro de CPF/CNPJ nem serviços de pagamento Pix existentes.
6. Experiência premium: identidade original COMVERXA, menu móvel, cartões, tabelas, acessibilidade, filtros por mês e impressão PDF.

## Entregue no ramo feature/comverxa-premium-comercial-v1
| Componente | Situação técnica | Ainda necessário |
|---|---|---|
| backend/commercial-premium-core.mjs | Regras e cálculos determinísticos de metas, salários de referência, comissões, bônus, dias úteis, projeções e renovação | Configurações por vendedor/contrato e processamento real |
| backend/commercial-premium-store.mjs | Tabelas SQLite separadas por tenant e registros de vendas/políticas, escopo por sessão, auditoria | Migração real do banco, associação aos registros existentes e backup/restauração |
| backend/commercial-premium-http.mjs | Endpoints /api/commercial/* com sessão no servidor e CSRF, desativados por padrão | Conectar ao login/cookies reais e feature flag por empresa |
| site/comverxa-premium-comercial.html | Interface funcional DEMONSTRATIVA com registros temporários, dashboard, leads, metas, comissões, renovações, perfil, assinatura e impressão/salvar PDF | Conectar views reais à API autenticada e persistência |
| tests/commercial-premium.test.mjs | Testes de isolamento A/B, permissões vendedor/gestor, comissões, dias úteis, renovação e endpoints | Integração autenticada e testes reais em homologação |
| .github/workflows/commercial-premium.yml | Validação automatizada em Node 22 | Validar conclusão do CI antes de merge |

## Regras e riscos importantes
- Valor monetário é calculado em centavos inteiros, com taxas em pontos-base; salário é referência configurável e, no cálculo atual, só entra no total do perfil operador. A remuneração real depende do contrato e da apuração do financeiro.
- O cálculo de bônus utiliza a maior faixa atingida e não acumula todos os bônus de faixas. As faixas devem ser estritamente crescentes.
- O próximo bônus não é remuneração adquirida; é exibido separadamente como potencial.
- A próxima ação de renovação é somente sugestão visual/estruturada, não é disparo automático de mensagem. 30/15/10 são janelas de alerta. Automação futura precisa registrar deduplicação, opt-out, fila e auditoria.
- Dados de placas completas, chassi, CPF, dados bancários e credenciais não devem ir para protótipo público ou logs; conexão real deve utilizar entidade do CRM existente com autorização, LGPD, retenção e criptografia adequadas.
- A interface do protótipo usa dados fictícios e memória temporária. A impressão PDF usa o navegador (não é certificado de folha de pagamento nem exportação de backend).
- Os endpoints são módulos de implementação, não estão montados no Railway. Qualquer teste usando acesso real depende de conta de homologação, credenciais seguras e ambiente com backup restaurável.
- O esquema atual é v1 isolado: não executar migração nem criar tabelas em produção antes de conhecer estrutura atual, testar reversibilidade e validar tenant + papéis em uma cópia.
- Não alteramos licenças vitalícias, dados antigos, configurações de WhatsApp, cobrança real nem o deploy Railway.
- No ambiente de produção atual, não alegar que os recursos do Vendly já estejam implementados ou homologados.

## Integração com o COMVERXA principal — próximos gates
1. Inventariar e versionar com segurança código de produção injetado em CVX_SOURCE_1..4 no Railway, sem publicar segredos.
2. Criar backup SQLite consistente + restauração em cópia isolada e obter schema real dos dados existentes.
3. Fazer integração das entidades leads/vendas/políticas via chaves internas e sem duplicar dados.
4. Ligar createCommercialStore e createCommercialHttpHandler ao middleware real de sessão e CSRF em uma aplicação protegida. Manter enabled=false por padrão.
5. Integrar a interface premium (componentes do protótipo) ao layout real, com tela por perfil, sem expor dados fora de tenant.
6. Vincular comissão/salário por vendedor, políticas de bônus, recebimentos liquidados, metas individuais, metas de equipe e regras específicas por empresa. Adicionar trilha imutável de revisão.
7. Criar agendador de alertas de renovação com deduplicação, base legal, opt-out, preferências e monitoramento.
8. Produzir relatórios PDF no servidor por vendedor/equipe, com autenticação, período, auditoria e reconciliação financeira.
9. Testar ponta a ponta em iOS, Android e desktop: vendas, QR/Meta WhatsApp, mídia, renovações, relatórios, isolamento A/B, escalabilidade e backup/restauração.
10. Liberar por feature flag para empresa piloto antes de disponibilização comercial ampla; registrar rollback e monitoramento.

## Protocolo de aceitação
- CI passa; não é equivalente à homologação de produção.
- Dois tenants de teste e papéis reais: nenhum identificador de cliente/lead/contrato de A pode ser acessado por B.
- Cada soma de comissão tem memória de cálculo, regra aplicada, responsável e status de liberação.
- Nenhum lembrete disparado duas vezes em caso de reinício, falha de webhook ou erro de rede.
- PDFs respeitam autorização e não exibem dados de outra empresa ou outro vendedor.
- A usabilidade móvel e desktop é validada com contas autenticadas e dados fictícios.
