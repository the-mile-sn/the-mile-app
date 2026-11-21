# Fase B4 - Central de Traduções no Backoffice (ramo isolado)

Data: 2026-11-21

## Prioridade
Backoffice primeiro, apps depois. **Não** iniciar seletores PT/EN nas apps até existirem conteúdos revistos e aprovados no Backoffice.

## Entrega técnica
- Página administrativa autónoma e protegida por sessão: `/admin-translations`.
- Ficheiros novos: `static/admin-translations.html`, `static/admin-translations.js`, `static/admin-translations.css`. Estética construída com variáveis da paleta existente e classes exclusivas `i18n-*` para não alterar UI aprovada.
- Novo inventário apenas de leitura `app_translation_catalog_v2.py`: campos ativos de `Alimentos` (nome e notas não vazias) e `Pratos` (nome PT). Resumos de registos em Receitas, Categorias de receitas, Suplementos e Planos publicados, ainda **não integrados** como traduções.
- Resumo por estados, pesquisa e paginação limitadas, revisão PT/EN lado a lado, proposta, aprovação explícita e histórico.
- Os nomes ingleses antigos de `v2_dish_library.name_en` são identificados como **candidatos de revisão**, nunca aprovados nem migrados automaticamente.
- Novas APIs admin `GET /api/v2/admin/i18n/overview` e `GET /api/v2/admin/i18n/catalog` usam autorização admin.
- Atalhos discretos "Traduções" nas ferramentas de Alimentos e Pratos foram adicionados num script separado, sem tocar nos event handlers existentes. Só aparecem se o Backoffice estiver autenticado **e** o endpoint de inventário estiver ativo. Caso contrário, a UI anterior permanece intacta.
- O atalho abre a central já filtrada pela biblioteca correspondente.
- Todos os campos originais, dados alimentares, `dish_id`, prescrições, menus e registos são preservados.

## Duas opções de ativação independentes
- `MILE_BACKOFFICE_TRANSLATIONS_ENABLED=1` abre apenas a central e as APIs de revisão no backoffice, com autorização; valor padrão `0`.
- `MILE_APP_TRANSLATIONS_ENABLED=1` permitiria as APIs de idioma de jogadores/chefs; manter `0` nesta fase.
- NENHUMA das duas opções foi ativada em produção e NÃO houve migração nem deploy.

## O que ainda falta
- Confirmar conteúdo **real** no PostgreSQL de produção; a base de dados bloqueia ligações externas e não se alteram essas regras. Os totais nesta entrega só serão reais quando lidos em ambiente de teste/produção autorizado com migração validada.
- Atalhos por campo/linha dentro dos editores de Alimentos e Pratos ainda não foram adicionados. O acesso por biblioteca está preparado; a interação de cada campo requer revisão visual separada antes de alterar editores aprovados.
- Implementar tradução de Receitas, Categorias, Suplementos e campos de planos com revisão clínica e preservação de versões.
- Gerar automaticamente propostas PT/EN é um trabalho separado: esta primeira entrega suporta edição e revisão manual; não efetua pedidos a serviços de IA, nem aprova automaticamente.
- Validar esquema PostgreSQL real, preparar migração aditiva explícita e testar em ambiente descartável antes de qualquer ativação.

## Segurança
- Novos ativos HTML/JS/CSS requerem sessão ativa de administrador quando a opção está ligada; não são servidos como estáticos públicos antes da autenticação.
- A API mantém CSRF, validação de origem, autorização de role e lista fechada de tabelas/campos. Revisão utiliza hash do português e da proposta.
- O inglês legado fica apenas como sugestão para revisão. Não existe escrita em `name_en` nem nos dados originais.
- Os testes de CI usam apenas SQLite temporário e um PostgreSQL descartável (nos testes anteriores), sem contactar o Render.
