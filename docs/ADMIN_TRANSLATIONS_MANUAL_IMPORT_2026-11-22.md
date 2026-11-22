# Central PT/EN — gestão sem API (22/11/2026)

## Objetivo

O backoffice é o centro de gestão das traduções; jogadores e chefs não recebem
qualquer alteração de idioma nesta fase. **Não é necessária uma chave OpenAI
para traduzir manualmente ou importar propostas.**

## Bibliotecas integradas

- Alimentos: apenas o nome visível, sem notas internas.
- Pratos: nome PT e inglês legado existente apresentado para revisão.
- Receitas: nome, texto visível das secções, ingredientes e preparação;
  os dados numéricos e a receita original não se alteram.
- Categorias de receitas: nome.
- Suplementação: apenas textos explicitamente incluídos no inventário
  visível, sem alterar doses, regras ou prescrições originais.

## Três formas de trabalhar

### 1. Tradução manual — já existente

Selecionar biblioteca, abrir registo, escolher campo, escrever inglês e
Guardar proposta. Só fica disponível para utilização futura depois da
aprovação explícita de um administrador.

### 2. Importação CSV — sem API

1. Abrir a Central de Traduções, selecionar a biblioteca pretendida.
2. Clicar Descarregar modelo CSV. Apenas campos **sem tradução** são
   exportados; nomes ingleses existentes nos pratos são preservados.
3. Abrir o ficheiro UTF-8 num editor/folha de cálculo, preencher apenas
   `translated_text` e **não alterar os identificadores nem o português**.
4. Regressar à Central, escolher CSV e clicar Verificar importação.
   A verificação não grava nada e mostra conflitos com os registos atuais.
5. Clicar Importar propostas. São criadas propostas **pendentes**,
   nunca aprovações automáticas.
6. Rever e aprovar no mesmo painel onde já se trabalha manualmente.

As colunas CSV, separadas por ponto e vírgula, são:
`entity_kind;entity_id;field_path;source_text;translated_text`.
São aceites também CSV com separador vírgula e aspas RFC compatíveis.

O ficheiro tem limite de 1 MB e 2500 linhas preenchíveis. Cada pedido
envia no máximo 100 propostas, validando todos os campos antes de qualquer
escrita. Se um lote falhar, os lotes **anteriores** já importados permanecem
pendentes; deve-se voltar a exportar o modelo atualizado.

Um CSV apenas com propostas externas ou preparadas noutro serviço não
recebe privilégios de aprovação. Qualquer fonte portuguesa alterada,
campo interno, nome inglês já existente ou tradução pendente/aprovada
faz a importação recusar esse lote.

### 3. Sugestões por API — futuras

O PR #334 prepara uma integração opcional mas permanece em rascunho,
independente desta entrega e desativada. Não requer que o projeto OpenAI,
a chave, a tabela de quotas ou a configuração financeira estejam prontos
para a Central manual/importação funcionar.

## Segurança e publicação

- Sessão ativa de administrador, CSRF e controlo de origem.
- Sem acesso de jogadores/chefs a estes endpoints.
- Sem migrações, chamadas externas, tarefas de fundo ou alterações à
  base de dados original de bibliotecas.
- Grava exclusivamente na estrutura já existente de traduções e histórico;
  cada importação cria apenas entradas em estado `pending`.
- Não apaga, não substitui nem aprova traduções previamente guardadas.
- Operações de lote atómicas: em caso de conflito, rejeita o lote.
- Importação e exportação não implicam qualquer custo de API.

### Antes de colocar em produção

Executar a CI dedicada e a validação mock desktop/mobile; rever o PR
contra `fix/backoffice-translations-qa-20261121`, verificar o serviço
administrativo e publicar apenas o ramo de backoffice.
Não fundir `main` com o ramo de produção do admin neste trabalho.
