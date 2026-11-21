# Internacionalizacao PT/EN - fundacao isolada da app (21/11/2026)

## Ambito aprovado
- Objetivo desta fase: interfaces e conteudos apresentados nas apps de Jogadores e Chefs.
- O Backoffice permanece em portugues; no futuro tera ferramentas de proposta, revisao e aprovacao de traducoes.
- O percurso antigo de importacao de planos a partir de PDF e obsoleto; nao faz parte desta arquitetura.
- O portugues e a origem canonica. Planos, prescricoes, doses, macros, opcoes, associacoes e historico nunca sao alterados por uma traducao.

## Estado desta entrega
O ficheiro `content_translations_v2.py` implementa apenas uma base tecnica isolada. Nenhuma rota, API, app, bootstrap, tabela existente, publicacao ou interface faz chamadas ao modulo nesta fase. Nao ha migraçao nem deploy automaticos.

## Contrato da camada de apresentacao
1. Resolver sempre a fonte publicada e autorizada, incluindo permissao do utilizador e referencias a alimentos.
2. Calcular e preservar gramagens, equivalencias, `option_ref`, calorias e macronutrientes com os dados originais.
3. Apenas depois, traduzir campos de apresentacao atraves de `resolve`; a resposta em portugues e sempre a fonte original.
4. Quando nao houver traducao aprovada correspondente ao texto portugues atual, devolver esse portugues sem modificar a fonte. Os estados `missing`, `pending` e `outdated` sao diagnosticos, nao alteracoes da prescricao.
5. O codigo de apresentacao nao pode enviar textos traduzidos como IDs, opcoes selecionadas ou dados de consumo.

## Aprovacao e versoes
- A proposta e escrita isoladamente e fica pendente de revisao.
- A aprovacao requer a versao (SHA-256) atual do texto portugues original.
- Se a fonte mudar, uma aprovacao anterior nao e aplicada: sinalizacao `outdated` calculada sem escritas.
- Nova proposta revoga a aprovacao anterior ate nova revisao.
- O historico de propostas e aprovacoes e separado da prescricao original.
- O servidor devera ler o texto original da sua propria fonte canonica ao submeter ou aprovar; nunca confiar num texto de origem enviado pelo browser.
- Na futura API, as operacoes de proposta e aprovacao exigirao autenticacao e permissoes de administrador. O acesso aos dados sensiveis tem de seguir as permissoes existentes.

## Nao incluido e proximo passo
Ainda nao foi ligada a inicializacao do esquema, pois o acesso de leitura ao PostgreSQL de producao esta bloqueado. Antes de ativar, auditar a estrutura real com acesso autorizado, simular a migracao de forma aditiva e executar testes SQLite e PostgreSQL. Integrar a API de leituras em ambiente de teste, a preferencia persistente do jogador e o seletor PT/EN existente do Chef sem alterar os seus comportamentos. Depois construir ferramentas de traducao no Backoffice e validar um percurso completo para Alimentos e Pratos.

Nao traduzir o proprio Backoffice, ficheiros PDF independentes, nem funcionalidade obsoleta.
