# Tradução de Planos — segunda exportação: títulos únicos (23/11/2026)

## Objetivo
Depois da revisão dos títulos repetidos e unidades simples, permitir traduzir
os **títulos de opção sem repetição no mesmo contexto de refeição** sem
obrigar a abrir os planos de cada jogador. A integração de conteúdos nas
apps continua uma fase separada.

## Dados incluídos e excluídos
- Exportação: apenas `field_kind=option_title`, texto próprio,
  `occurrences=1`, associado à versão publicada por
  `group_id`, `source_hash`, `expected_group_hash` e contexto de refeição.
- Mantém **as nove colunas exatas** do CSV comum já existente:
  `group_id;source_hash;expected_group_hash;expected_stage_hash;field_kind;
  meal_context;source_text;occurrences;translated_text`.
- Não inclui nomes/IDs dos atletas como campos, snapshots completos, notas
  individuais, nomes personalizados/alternativas, dosagens ou rótulos clínicos.
- Filtro conservador exclui títulos muito longos, caracteres de controlo,
  e alguns padrões explícitos de identificação e instrução clínica. Este filtro
  **não garante a ausência** de dados pessoais incorporados em títulos livres.
- **Antes do download:** na UI privada, o administrador expande uma
  pré-visualização de todos os títulos únicos candidatos, pode desmarcar
  individualmente os que não devem ser partilhados e assinala
  «Revisei os títulos selecionados e confirmei que podem ser exportados».
  Sem seleção e confirmação o botão de download permanece desativado.
- Ficheiro gerado localmente no browser após essa confirmação, sem enviar a
  pré-visualização para um serviço externo. Recomenda-se revisão antes de o
  enviar ao assistente de tradução.

## Importação e aprovação
Reutiliza sem mudanças os endpoints privados e o processo já testado
dos textos comuns:
1. CSV UTF-8, cabeçalho fixo, `translated_text` editável.
2. «Verificar importação» compara os identificadores, hash do português,
   contexto, token de versão publicada e candidato armazenado.
3. «Importar propostas» grava em `plan_common` com estado `pending`,
   histórico de revisão e proteção contra sobrescrita.
4. **Só após a aprovação humana explícita** o texto é aplicado na tabela
   `v2_content_translations` à versão publicada correspondente, com
   histórico por ocorrência. Números e unidades não podem mudar.
5. Se o plano for republicado, o token muda e o importador rejeita o CSV
   obsoleto. A tradução aprovada da versão antiga não é copiada
   automaticamente para uma versão nova.

## O que fica de fora
- Notas individuais e clínicas: 354 ocorrências na auditoria apresentada,
  sujeitos a revisão privada e circuito separado.
- Nomes e alternativas alimentares personalizados: sem correspondências
  automáticas por semelhança com a biblioteca.
- Rótulos de suplementos em planos e outras instruções individualizadas.
- Não ativa automaticamente inglês nas apps de jogadores/chefs, nem mexe
  no plano português, horários, prescrições ou cálculos nutricionais.

## Testes
- Backend: título único elegível, importação pendente, aprovação explícita,
  mesma versão canónica e snapshot inalterado; rejeição de títulos com
  indicação clínica/identificador evidente, notes excluídas.
- Browser desktop/mobile: pré-visualização privada, seleção/desmarcação,
  confirmação, download separado de títulos únicos, sem nomes dos jogadores
  ou notas clínicas, e preservação do CSV comum.
