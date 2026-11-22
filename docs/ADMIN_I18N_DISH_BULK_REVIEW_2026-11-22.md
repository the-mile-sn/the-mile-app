# Aprovação em lote de nomes de Pratos — The Mile (22/11/2026)

## Âmbito
A Central de Traduções oferece o mesmo botão «Rever e aprovar em lote» para
**Pratos** e **Alimentos**, com «Selecionar 100» cumulativo, pesquisa,
seleção individual e confirmação expressa de revisão. Mantém os endpoints
administrativos existentes, sem novos esquemas nem acesso pelas apps.

Para Pratos, o único campo permitido é `dish/name_pt/en`.
Um prato pode ter:
- **`pending`**: proposta já guardada em `v2_content_translations`;
- **`legacy_review`**: inglês pré-existente em `v2_dish_library.name_en`,
  ainda não convertido em proposta aprovada.

O GET `/api/v2/admin/i18n/batch/preview?entity_kind=dish` mostra ambos
os estados PT/EN lado a lado e **não grava**. Sem parâmetro, mantém o
comportamento antigo de Alimentos (`food/display_name/en`).

## Aprovar após revisão humana
- A seleção inicia vazia. «Selecionar 100» acrescenta no máximo 100
  entradas visíveis por clique; a pesquisa restringe este atalho.
- É obrigatório marcar «Confirmei a revisão das traduções selecionadas».
  Alterar a seleção limpa a confirmação.
- O navegador transmite apenas IDs, caminho permitido e hashes de ambos
  os textos. O servidor relê o português e a proposta inglesa a partir da
  fonte canónica e exige sessão ativa de admin, CSRF e origem válida.
- Para propostas `pending`, aprova-se **apenas a versão revista**.
- Para inglês legado, cria-se uma proposta condicional e aprova-se
  **na mesma transação de 100**, registando ações `submitted` e `approved`
  no histórico. Nenhuma aprovação prévia pode ser substituída por esta ação.
- Um original, tradução inglesa ou estado alterado desde o preview provoca
  conflito. Todo o grupo afetado é revertido, incluindo auditoria; os
  grupos anteriores já confirmados mantêm-se.
- `missing`, `approved` e `outdated` não aparecem no lote.
- O original `v2_dish_library` não é modificado. A app dos jogadores/chefs,
  as bibliotecas e os planos não recebem traduções automaticamente.

## Testes
- WSGI: legacy/pending, GET sem escrita, hashes, alteração concorrente,
  histórico, rollback do grupo, CSRF/origem, tipos e campos indevidos.
- Playwright mock: desktop/mobile, seleção de 100, confirmação e ausência
  de aprovação automática. Registos reais não são usados nos testes.
