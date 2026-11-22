# Aprovação em lote de nomes de Alimentos — The Mile

Estado: funcionalidade opt-in no backoffice. Não aprova nada por si, nem altera a app dos jogadores/chefs.

## Porque existe

Depois de importar 695 propostas de alimentos, o workflow anterior obrigava
a 695 aprovações manuais separadas. Esta alteração permite **revisão humana em
lote** mantendo o mesmo sistema de traduções, histórico e permissões.

## Fluxo no backoffice

1. Abrir **Traduções → Alimentos** e escolher **Rever e aprovar em lote**.
2. A Central carrega as propostas ainda pendentes, mostrando sempre o
   **português original lado a lado com o inglês proposto**. Não mostra
   notas alimentares internas, doses, prescrições ou dados de jogadores.
3. Percorrer as linhas. É possível pesquisar e selecionar apenas as
   traduções que estão corretas, ou usar **Selecionar todas** depois da
   revisão. A seleção começa sempre vazia.
4. Marcar **Confirmei a revisão das traduções selecionadas**. Qualquer
   alteração à seleção exige uma nova confirmação.
5. Clicar **Aprovar N selecionadas**. O servidor confirma a identidade da
   conta admin, origem/CSRF e os hashes do português e do inglês antes
   de atualizar cada uma. Não são aceites textos do navegador para editar.
6. O servidor executa no máximo **100 aprovações por transação**,
   todas auditadas. Ao aprovar 695, o navegador envia sete pedidos
   sequenciais com uma única confirmação explícita da pessoa revisora.

## Segurança e integridade

- **Escopo fixo:** somente `food/display_name/en`. Não incluir
  receitas, suplementos, bibliotecas de pratos ou planos neste piloto.
- Previsualização GET **nunca grava**; aprovação exige POST e CSRF.
- Admin autenticado e ativo revalidado em cada pedido; apenas o serviço
  administrativo pode consultar estas propostas.
- Não escreve nas bibliotecas originais de alimentos nem em tabelas
  nutricionais; atualiza unicamente `v2_content_translations` e insere
  um histórico em `v2_content_translation_history` para cada aprovação.
- Bloqueia pedidos com hashes desatualizados, propostas modificadas,
  falta de tradução, duplicações e mais de 100 itens.
- Se uma das propostas falhar, **todo o lote de 100 é revertido**.
  Lotes anteriores já confirmados permanecem aprovados com histórico.
  O navegador apresenta a contagem e convida a rever os restantes.
- Sem chamadas à OpenAI nem custos de API.
- Traduções aprovadas continuam **fora da app** até existir um lançamento
  independente que inclua o consumo por idioma.
- Se existirem mais de 1200 propostas pendentes, o pedido recusa; rever
  o desenho do fluxo em vez de aprovar invisivelmente um conjunto maior.

## Testes exigidos

- WSGI: preview sem escrita, hash do original e candidato, revalidação da
  sessão, CSRF/origem, aprovação de seleção parcial, histórico, rollback
  atómico, bloqueio de uma edição concorrente e limites de lote.
- Navegador (mock): desktop/mobile, nenhuma ação automática, seleção
  vazia por defeito, pesquisa, revisão e checkbox obrigatória, alteração
  da seleção invalida confirmação e utilização da credencial CSRF.
- Testes atuais da Central, navegação e importação continuam a passar.
