# Traducoes PT/EN: fase B1, apresentacao isolada

Objetivo: projetar traducoes aprovadas de alimentos e pratos nas apps de jogadores e chefs, sem alterar os dados originais. A importacao antiga de planos por PDF e obsoleta e fica fora do ambito.

## Entrega
- Novo modulo de apresentacao, por enquanto NAO ligado a `app.py`, interfaces, rotas ou inicializacao.
- Fonte original e permissão de leitura ja resolvidas pelo chamador.
- Funcoes `present_food`, `present_dish` e `present_menu` apenas acrescentam `presentation` a uma copia do registo, sem substituir campos.
- Para menus, traduzir nomes apenas quando `dish_id` coincidir com o ID do prato autorizado. Menus sem ID e texto livre continuam sem traducao automatica.
- `name_en` legado nao e aceite como aprovacao por si so.
- O sistema retorna o original em falta de traducao aprovada ou quando o portugues foi modificado.
- O codigo nao deve guardar `presentation` em prescricoes, opcoes, registos de consumo ou menus.

## Validacao
Os testes isolados usam SQLite em memoria e valores ficticios: preservacao de nutrientes, menu e ID, conteudos pendentes e desatualizados, rejeicao de combinacoes incorretas e preservacao do hash de opcoes.

## Proximo passo
Sem permissoes de acesso direto a base de dados de producao, nao executar migracoes. Validar PostgreSQL em ambiente descartavel, preparar endpoints com autorizacao e validacao server-side de fontes, depois integrar a leitura com preferencia PT/EN apenas em ambiente de testes. Esta entrega NAO altera experiencia atual de utilizadores.
