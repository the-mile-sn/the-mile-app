# Backoffice PT/EN - sugestões de tradução (piloto isolado)

Data: 2026-11-21

## Âmbito e dependência

Esta funcionalidade é uma **extensão opcional** da Central de Traduções existente em
`admin.themile.pt/admin-translations`. Depende do código e testes do PR #333
(estados agrupados e proteção contra respostas atrasadas).
**Este ramo e PR não devem ser integrados/publicados automaticamente.**

## Comportamento

- Na revisão de um campo elegível ainda sem proposta, o administrador pode clicar
  **Sugerir tradução**.
- A sugestão é devolvida ao navegador e inserida no campo de inglês **sem escrever
  na base de dados**. O botão **Guardar proposta** continua obrigatório.
- Uma proposta guardada continua no estado pendente até à aprovação humana.
- Traduções inglesas preexistentes dos pratos são reutilizadas, não reenviadas ao
  fornecedor. Propostas e traduções já aprovadas não são substituídas pelo botão.
- A integração nas apps de jogadores/chefs **não faz parte desta fase**.
- Não há geração em lote, jobs automáticos ou qualquer execução em segundo plano.

## Privacidade, limites e segurança

- O endpoint `POST /api/v2/admin/i18n/suggest` reutiliza o acesso administrativo
  existente, CSRF, controlo de origem e fonte canónica validada no servidor.
- Apenas texto PT de bibliotecas é enviado ao fornecedor; sem IDs de clientes,
  sessões, cookies, planos individuais, notas internas de alimentos ou imagens.
- **Exclusões do piloto externo:** notas de receitas, doses/instruções/prescrições
  de suplementação (apenas o nome de suplemento é elegível).
- A resposta utiliza `store: false`, mas as condições de tratamento e retenção
  do fornecedor devem ser verificadas antes de ativar a integração.
- O modelo é configurável. A API fica restrita a um endereço fixo e usa timeout
  de 15 s, resposta limitada, verificação de números e um limite por administrador
  por processo de 10 pedidos/10 minutos. Este limite não é distribuído entre
  instâncias e não substitui políticas de orçamento/custos do fornecedor.
- Nunca ligar a produção sem revisão da proteção de dados, autorização, limites
  de custo e testes com conta administrativa real.

## Variáveis Render (não configuradas pelo código)

**Não ativar na produção sem aprovação explícita**:

- `MILE_BACKOFFICE_TRANSLATIONS_ENABLED=1` (controla a Central; já existente).
- `MILE_TRANSLATION_SUGGESTIONS_ENABLED=1` (controlo adicional, OFF por defeito).
- `MILE_TRANSLATION_SUGGESTION_API_KEY` (segredo só no Render, nunca no GitHub).
- `MILE_TRANSLATION_SUGGESTION_MODEL` (opcional; por defeito `gpt-5.4-mini`).

Se não houver flag ou chave, a capacidade anuncia `suggestions_enabled=false`,
o botão não aparece e os pedidos diretos são rejeitados. Não existe fallback
que finja ter gerado uma tradução.

## Validação

- Testes HTTP WSGI em SQLite descartável: autenticação, CSRF, origem, flag,
  restrições de campos, fontes alteradas, textos existentes, indisponibilidade
  do fornecedor e ausência de gravações/efeitos secundários.
- Teste de navegador com dados simulados: proposta no textarea, sem chamada
  automática a `/propose` ou `/approve`.
- `urllib.request.urlopen` é sempre substituído por mock nos testes.
- Não realizar testes que contactem o modelo com conteúdo real nem migrar dados
  da base PostgreSQL de produção nesta fase.

## Trabalho posterior

Avaliar glossário nutricional aprovado, geração em lote por conjuntos pequenos,
limites de orçamento e proteção adicional de termos clínicos. A revisão de
prescrições e conteúdos potencialmente individualizados requer decisão separada.
