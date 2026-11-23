# Ligação de traduções aprovadas às apps — fase de leitura (23/11/2026)

## Estado
Ramo técnico, **sem publicação nem ativação**. O backoffice aprovou 4.149 campos no seu próprio serviço; isto **não prova** que o serviço público tenha acesso à mesma tabela. O Render indica serviços independentes, com ramos distintos (`main` para a app pública; `production/the-mile-admin` para o backoffice).

## Contrato já preparado
- `app_content_i18n_v2.py`: apresentação EN apenas quando `MILE_APP_TRANSLATIONS_ENABLED=1`, com tabela `v2_content_translations` acessível, `status='approved'`, `language='en'` e hash do texto original correspondente.
- As traduções dos planos são vinculadas a `pub:SHA256(draft_id + NUL + snapshot_json)` e a caminhos `meals/X/options/Y/...`; uma republicação nunca reutiliza silenciosamente traduções anteriores.
- Os nomes canónicos dos alimentos utilizam as traduções aprovadas da biblioteca pelo ID; nomes personalizados utilizam a chave versionada do plano.
- A tradução ocorre **apenas numa cópia da apresentação** após a autenticação e o filtro por atleta. Não altera snapshots, nutrientes, quantidades estruturadas, horários, grupos ou chaves dos momentos alimentares.
- Chef mantém a preferência existente PT/EN e atualiza a leitura do plano após mudança. O endpoint de planos dos jogadores aceita `language=pt|en` como infraestrutura preparatória, mas não há novo seletor de idioma nem ativação dos textos nativos.
- Sem tabela, tradução em falta, pendente ou desatualizada: apresenta o português.

## Bloqueios antes de lançar EN a jogadores ou chefs
1. **Confirmar ligação de dados**: os serviços Render `the-mile-admin` e `the-mile-app` devem ter uma fonte segura, consistente e autorizada para as traduções aprovadas. Nunca copiar dados clínicos ou transferir snapshots completos por um endpoint público.
2. **Escolha persistente de idioma dos jogadores**: criar modelo novo, sem reutilizar seletores protótipo; sincronizar resposta de planos, calendário, receitas e menus com a preferência do utilizador.
3. **Traduções nativas da interface**: inventariar strings visíveis em `static/jogador-v2.js`, `static/chef.js`, HTML e componentes auxiliares; aplicar dicionários PT-PT / EN-GB e fallback, testando os padrões visuais existentes.
4. **Cobertura funcional**: no jogador, Planos, Vista Dia/Semana, Menus, Receitas, Suplementos e pesquisa; no chef, Planos, seleção de pratos, menus e propostas. Apenas saída textual deve mudar.
5. **Integração real autenticada**: validar com contas de teste PT e EN, permissões isoladas por atleta, pré/pós-treino, peri-jogo, repúblicações, menus e nutrição idêntica antes de ligar a flag.
6. **Lançamento gradual**: opt-in de validação, plano de rollback imediato `MILE_APP_TRANSLATIONS_ENABLED=0`; ativação geral só depois de testes e revisão de privacidade.

## Limitações desta PR
A PR apenas prepara a leitura dos conteúdos aprovados dos Planos e nomes dos alimentos na app pública. Não traduz ainda todos os rótulos nativos, não implementa a preferência persistente dos jogadores e **não pode ser considerada uma publicação de inglês nas apps**. Não fazer merge sem os pontos de verificação acima.
