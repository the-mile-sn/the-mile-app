# Backoffice PT/EN — entrega isolada para revisão (21/11/2026)

## Objetivo
Preparar **só o backoffice**, usando as duas tabelas de tradução já criadas em PostgreSQL na produção pela equipa, sem alterar as apps e sem refazer os editores aprovados.

## Conteúdo
- Serviço admin recebe uma rota privada /admin-translations e os seus CSS/JS, acessíveis só a administradores autenticados e com a flag MILE_BACKOFFICE_TRANSLATIONS_ENABLED=1. Sem flag, os endpoints devolvem 404.
- Centro: inventário Alimentos + Pratos, estados, pesquisa, paginação, comparação PT/EN, submissão de proposta, aprovação humana e histórico.
- Nomes legados em v2_dish_library.name_en são candidatos para rever, não entram diretamente em traduções aprovadas. A fonte original mantém-se nos próprios registos PT.
- Atalhos da biblioteca são mostrados só quando o endpoint administrativo está disponível; o código dos formulários existentes não é modificado.
- Novos endpoints APENAS em /api/v2/admin/i18n, sem rotas para jogadores ou chefs.
- Restantes bibliotecas aparecem como inventário de registos **não integrado**; não confundir com zero traduções.

## Segurança
- Nenhuma tabela é criada automaticamente pelo servidor. Em falta da estrutura, é devolvido erro 503.
- Operações de escrita exigem autenticação de administrador, CSRF, verificação de origem e versão dos textos original e inglês.
- Dados originais (alimentos, pratos, macros, quantidades, menus e planos) não são alterados.
- A própria UI do backoffice continua em português.
- Nenhum serviço ou variável de ambiente no Render foi modificado. O Backoffice de produção não mudou.
- A migração das duas tabelas foi anteriormente concluída no Shell interno do Render, confirmada pela equipa (0 traduções, 0 eventos).

## Critérios antes de publicar
1. Verificar a CI (inclui teste WSGI real com base descartável e um inventário do tamanho da produção: 700 alimentos, 277 pratos, 276 candidatos EN).
2. Confirmar visualmente os padrões do Guia Visual do Backoffice, desktop e mobile; nenhuma alteração aos componentes aprovados.
3. Validar cuidadosamente a instalação do ramo exclusivamente administrativo; não integrar a PR anterior, que inclui também infraestruturas futuras para as apps.
4. Deploy do serviço admin sujeito à validação final; a flag mantém-se OFF para dar uma oportunidade de rollback operacional.
5. Quando validado e explicitamente autorizado, ativar só MILE_BACKOFFICE_TRANSLATIONS_ENABLED; MILE_APP_TRANSLATIONS_ENABLED permanece 0.

## Fase seguinte
Revisão das traduções dos pratos com nomes ingleses existentes; geração de propostas sem aprovação automática; integração de Receitas, Categorias, Suplementos e notas clínicas por campo.
