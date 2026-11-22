# Traduções dos Planos — fase 1, revisão privada por publicação (22/11/2026)

## Objetivo
Depois de aprovar as bibliotecas de Alimentos, Pratos, Receitas,
Categorias e Suplementação, iniciar a tradução de Planos **sem modificar**
as prescrições ou ligar prematuramente o inglês às apps.

## Fonte e identidade da versão
A fonte canónica é exclusivamente
`v2_food_plan_editor_publications.snapshot_json` para publicações
`published` ou `transitional`. Rascunhos não entram no circuito.

A chave da proposta na estrutura já existente de `v2_content_translations`:
- `entity_kind = plan`;
- `entity_id = pub:<SHA256(draft_id + NUL + snapshot_json)>`;
- `field_path = meals/i/options/j/{title,notes/k,foods/l/{display_name,display_quantity,label}}`;
- `language = en`, `source_hash = SHA256(texto PT)`.

A versão é congelada no identificador. Uma nova publicação com snapshot
diferente recebe outra chave; traduções aprovadas da versão anterior
nunca são aplicadas automaticamente à nova. Os históricos anteriores
permanecem disponíveis internamente, sem reaprovação silenciosa.

## Separação de origens
- Alimentos com ID canónico são contados como reutilizáveis e **não**
  criam tradução de plano quando o `display_name` coincide com a fonte.
- Nomes personalizados diferentes da biblioteca, títulos de opção,
  notas livres, textos de quantidades e labels de suplementos são campos
  próprios e versionados do plano.
- `name` e `player_name` do plano não são propostos para tradução,
  pois contêm identidade. `meal.name`, `plan_type`, `applies_to`,
  `order`, `timing_splits`, `timing_groups` e os códigos de calendário
  não são traduzidos nem modificados.
- Dicionário PT/EN da interface e resolução das traduções aprovadas
  pelas apps são entregas posteriores, com testes de integração separados.

## Segurança e privacidade
- GET de inventário expõe apenas aos administradores ativos, sob sessão
  autenticada, nomes de identificação na UI privada, tipos de plano,
  contagens de estados e referência opaca da versão. Não expõe
  athlete_id, player_id nem o snapshot completo.
- GET de detalhe expõe **apenas textos visíveis elegíveis** para revisão
  privada. Notas e quantidades são assinaladas como sensíveis.
- Sem exportação CSV dos Planos, sem API OpenAI, tradução automática,
  partilha externa ou envio para as apps. Não se deve utilizar o
  modelo CSV genérico das bibliotecas com planos.
- POST de proposta e aprovação verifica novamente a publicação,
  o campo canónico, hash do original e hash da proposta. Alterar
  números na tradução gera erro e impede gravação.
- Todas as decisões passam pelo histórico existente com auditoria do autor.
  A tabela original de Planos, macros, horários, dosagens e JSON
  continuam inalterados.
- A interface agrupa os campos por refeição e opção; a aprovação exige
  confirmação explícita em cada texto.

## Testes e lançamento
Testes WSGI em SQLite descartável: autenticação, CSRF, ausência da flag,
revisão e aprovação, histórico, rejeição de campos internos e
quantidades divergentes, re-publicação invalida chave anterior,
nenhum snapshot ou ID do atleta devolvido.

Teste Chromium com dados fictícios em desktop e mobile, na Central
integrada do Admin, incluindo proposta, confirmação e aprovação.
Publicação limitada ao serviço `the-mile-admin`. Flag de tradução
nas apps mantém-se desligada.

## Limite desta fase
Ainda não constitui uma tradução integral dos Planos: o dicionário
dos rótulos fixos e o consumo das traduções pelas apps dos jogadores
e dos chefs exigem fase própria de integração. O editor dos planos
é privado e manual para evitar exportação de conteúdo clínico.
