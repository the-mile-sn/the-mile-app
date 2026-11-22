# Planos — tradução de textos comuns por grupo (22/11/2026)

## Observação da Central
A auditoria mostrou 1.272 textos próprios, 156 ocorrências repetidas de títulos,
2.289 referências a alimentos já traduzidos, 246 sugestões simples de unidades,
354 notas individuais e 2 alternativas personalizadas. Estas contagens são
de tipos diferentes e não se devem somar ou subtrair indiscriminadamente.

## Fluxo seguro implementado
Na Central de Traduções > Planos, aparece a nova secção
**«Traduções comuns · revisão por expressão»**:
- lista títulos de opção **com o mesmo português e o mesmo nome de refeição**;
- lista apenas quantidades que correspondam integralmente a uma expressão
  estruturada de unidades simples, por exemplo «2 un / 120 g»;
- distingue total de ocorrências, pendentes e posições ainda sem proposta;
- permite pesquisa, revisão do par PT/EN e confirmação explícita;
- uma confirmação humana aprova até 100 posições iguais no mesmo grupo;
- na operação seguinte é necessário um novo token de pré-visualização.

## Proteções
- Não reutiliza nomes pela semelhança, nem trata alternativas de alimentos
  como alimentos canónicos.
- Notas clínicas/individuais, apresentação livre de alimentos, etiquetas de
  suplementos e quantidades não reconhecidas ficam fora deste lote.
- Agrupar pelo nome exato da refeição previne misturar títulos iguais
  provenientes de refeições diferentes.
- A aprovação grava propostas e aprovações com histórico individual para
  cada posição de uma publicação identificada por hash da versão.
- O servidor recalcula o grupo antes de escrever, compara a lista de posições
  elegíveis com o token recebido, confirma cada publicação e cada origem,
  preserva números e unidades e rejeita valores divergentes.
- Uma posição que já tenha proposta pendente, tradução aprovada ou estado
  desatualizado **nunca é sobrescrita**.
- É exigido administrador autenticado, sessão, origem e CSRF válidos.
- POST é atómico por grupo de até 100. Um conflito reverte todo o grupo
  afetado e não reverte aprovações anteriores.
- Sem exportações de planos nem serviços externos, sem acesso nas apps,
  sem mudanças aos originais, agendamentos, macros, doses ou prescrições.
- Nenhuma tradução é aprovada automaticamente pelo deploy.

## Próxima fase
A integração com as apps de jogadores e chefs deve resolver as referências
por ID às bibliotecas já aprovadas, os títulos versionados e os nomes fixos
de interface com fallback para português. Continua a ser uma mudança
separada e testada de apresentação.
