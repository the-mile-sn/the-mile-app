# The Mile — Planos: ficheiro CSV para traduzir e importar (23/11/2026)

## Necessidade
Depois da auditoria dos Planos, a equipa pediu o mesmo fluxo usado nas bibliotecas:
descarregar um CSV, preparar o inglês britânico fora do backoffice e importar
propostas para revisão humana, em vez de traduzir centenas de expressões à mão.

## Exportação
Na Central > Traduções > Planos > Traduções comuns, o botão
«Descarregar CSV dos textos comuns» gera diretamente no navegador um CSV
com BOM UTF-8 e colunas separadas por ponto e vírgula. Contém:
- `group_id`, `source_hash`, `expected_group_hash`, `expected_stage_hash`;
- `field_kind`, `meal_context`, `source_text`, `occurrences`;
- `translated_text` (a única coluna a preencher/modificar).

O ficheiro só contém títulos de opções **repetidos no mesmo contexto de
refeição** e unidades de apresentação estruturalmente simples. Não inclui
IDs de jogador, versões completas, notas individuais, prescrições, alternativas
personalizadas ou etiquetas de suplementos. Títulos são texto livre:
o administrador deve **confirmar que não contêm dados pessoais ou clínicos**
antes de enviar o CSV para ferramentas externas.

## Importação
- Selecionar CSV, «Verificar importação», «Importar propostas»;
- até 2500 linhas e 1 MB; lote de 100 expressões por pedido;
- validação de `group_id`, hash da fonte, composição/versionamento do
  grupo e hash da proposta já guardada, sem confiar no CSV para obter
  texto português canónico;
- português, contexto de refeição e presença de tradução são verificados;
- números e unidades preservados, e conflitos são rejeitados;
- grava **apenas** `entity_kind=plan_common`, `field_path=text`,
  com estado `pending` e histórico; não cria nem aprova diretamente
  traduções nas publicações;
- update de proposta pendente com comparação/condição de concorrência;
  proposta previamente aprovada não pode ser alterada através deste CSV;
- grupos de 100 são transacionais e devolvem contagem de propostas
  importadas e mantidas.

## Aprovação explícita
Depois da importação, os grupos indicam «CSV importado por rever».
O administrador pode confirmar a revisão e aprovar até 100 expressões
importadas por ação, processadas em grupos atómicos de no máximo
100 ocorrências por expressão. O sistema só aplica a cada publicação
a tradução aprovada correspondente ao mesmo `group_id`, à mesma
origem/contexto e à mesma versão publicada, e grava histórico individual.
Os grupos anteriores mantêm-se aprovados se um lote posterior falhar;
o painel explica a conclusão parcial.

Nada é aprovado por um upload, nem pelo deploy, nem por navegar na
Central. O inglês não é automaticamente ligado às apps.

## Testes e publicação
- SQLite descartável: importação pendente, CSRF/admin, versão, hashes,
  revisão, conflito, números/unidades, impossibilidade de modificar notas
  clínicas/alternativas, separação das publicações e proteção de traduções
  comuns já aprovadas.
- Browser mock desktop/mobile: descarregar CSV, reimportar, verificar
  propostas, garantir zero aprovações no upload, confirmar e aprovar.
- Deploy apenas de `the-mile-admin`, após CI. Sem migrações, flags nas
  apps, exportação de dados clínicos, ou alteração dos planos portugueses.
