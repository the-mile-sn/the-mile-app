# The Mile – Proteção das sugestões PT → EN (21/11/2026)

## Estado: NUNCA ATIVAR SEM APROVAÇÃO

Esta funcionalidade é opcional, isolada no PR #334, dependente do PR #333.
Não há chaves de API reais no repositório, nem alterações publicadas no Render.
Não modifica as apps, dados de jogadores, prescrições ou traduções aprovadas.

## Controlos financeiros a verificar manualmente na OpenAI

1. Criar um projeto API exclusivo para The Mile — Traduções.
2. Criar chave de projeto/conta de serviço com permissões restritas apenas
   à API Responses. Não usar chave de administrador de organização.
3. Limitar os modelos disponíveis ao gpt-5.4-mini-2026-03-17.
4. Configurar no projeto: **limite rígido de $5/mês**, com a opção
   **Enforce a hard limit** ligada. Orçamento sem esta opção é apenas alerta.
5. Configurar alertas de despesa de $1, $3 e $4 e o alerta final de $5.
6. Carregar inicialmente $5 se necessário e **desativar Use auto-reload**,
   que pode estar ativado por predefinição.
7. Rever o limite rígido da organização sem prejudicar outros projetos.
8. Restringir os administradores, usar MFA, monitorizar a utilização e
   revogar/rodar a chave se houver suspeita de fuga.
9. Confirmar as condições de tratamento de dados do fornecedor e RGPD
   com o responsável; store:false não significa retenção zero.

A OpenAI pode demorar algum tempo a bloquear após atingir um limite rígido;
pode haver ligeiro excesso. O saldo pré-pago também não é um teto instantâneo.
O código não consegue verificar o painel de faturação: a confirmação é manual.

Fontes:
https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform
https://help.openai.com/en/articles/8264644-setting-up-and-managing-prepaid-api-billing
https://developers.openai.com/api/docs/models/gpt-5.4-mini

## Proteções implementadas no código

- Exclusivo do serviço administrativo e de utilizador admin autenticado.
- CSRF obrigatório, origem HTTP exata e HTTPS (admin.themile.pt ou
  the-mile-admin.onrender.com). Sem permissões dos jogadores/chefs.
- Flag de funcionalidades desligada por defeito e uma segunda confirmação
  explícita de que os controlos financeiros na OpenAI foram ativados.
- Identificador do projeto da OpenAI e chave secreta do servidor obrigatórios;
  chave nunca incluída no JavaScript, respostas, GitHub ou logs.
- Modelo fixo: gpt-5.4-mini-2026-03-17.
- PostgreSQL partilhado obrigatório; nunca efetuar chamadas pagas num
  fallback de SQLite local/efémero.
- Contadores persistentes e atómicos na base de dados:
  máximo 5 chamadas por admin/10 minutos, 20 por admin/dia,
  12 globais/10 minutos, 40 globais/dia e 200 globais/mês (UTC).
  São limites de chamadas, não garantia financeira.
- Reserva registada ANTES da chamada à API. Se houver erro externo, a
  reserva conta para a quota; não existem tentativas automáticas.
- Falha fechada sem tabela, credenciais, projeto, configuração ou modelo válido.
- Apenas textos canónicos das bibliotecas. Exclui notas internas de alimentos,
  notas de receitas, doses, instruções e prescrições de suplementação.
- Filtro adicional para e-mails, URLs e sequências semelhantes a telefones;
  o filtro não garante detetar todos os dados pessoais.
- Máximo de 1800 caracteres de entrada, 350 tokens de resposta,
  10 segundos e 30 KB de resposta por pedido.
- HTTPS e verificação do certificado, sem redirects com credenciais,
  sem proxies herdados, sem agentes e sem chamadas de ferramentas.
- Dados enviados apenas quando o administrador solicita uma sugestão,
  com store:false. Não guarda, propõe ou aprova automaticamente.
- Inglês existente é preferido; propostas pendentes/aprovadas não são
  substituídas e inconsistências numéricas bloqueiam a sugestão.

## Migração manual necessária — ainda NÃO executada

A nova tabela v2_translation_suggestion_quota não é criada no arranque.
Executar apenas depois de confirmar a BD, backup e autorização específica.

No Shell INTERNO do serviço Render the-mile-admin, com as variáveis
MILE_SITE_ROLE=admin e DATABASE_URL PostgreSQL previamente verificadas:

    MILE_MANUAL_QUOTA_MIGRATION_APPROVED=YES python migrate_translation_suggestion_quota_v2.py --apply

Sem o comando exato, aprovação, admin role ou PostgreSQL, é recusada.
Nunca abrir o acesso externo da base de dados para esta operação.
A migração é aditiva: não modifica as tabelas nutricionais ou traduções.

## Configuração Render para eventual ativação (NÃO EXECUTAR AGORA)

No serviço the-mile-admin, exclusivamente:

- MILE_BACKOFFICE_TRANSLATIONS_ENABLED=1
- MILE_TRANSLATION_SUGGESTIONS_ENABLED=1
- MILE_TRANSLATION_SPEND_CONTROLS_CONFIRMED=1 (após verificação manual)
- MILE_TRANSLATION_SUGGESTION_PROJECT_ID=proj_... (projeto exclusivo)
- MILE_TRANSLATION_SUGGESTION_API_KEY=... (segredo exclusivamente no Render)
- MILE_TRANSLATION_SUGGESTION_MODEL=gpt-5.4-mini-2026-03-17 (opcional)
- DATABASE_URL=... (PostgreSQL existente, sem alteração)

A falta de um único pré-requisito bloqueia chamadas pagas.

## Validação e publicação

- CI: testes WSGI e simulação de fornecedor; nenhuma chave real.
- Browser mock desktop/mobile: sugestão aparece mas não é guardada.
- Validar falha fechada sem DB/tabela/flag/projeto e limites concorrentes.
- Rever RGPD e orçamento e testar migração apenas com backup.
- Só após aprovação expressa: integrar PR #333 e #334 ordenadamente,
  ativar exclusivamente o serviço the-mile-admin e acompanhar utilização.
- Nunca fundir integralmente main com production/the-mile-admin.

## Limitações conhecidas

O controlo financeiro mais importante continua no projeto OpenAI.
Os limites locais não impedem um atacante de usar uma chave roubada
diretamente fora da The Mile. A aplicação não verifica o limite externo.
Os padrões de dados pessoais são uma defesa complementar, não perfeita.
O orçamento de $5 depende de configuração humana efetiva e da latência
de contabilização do fornecedor. Não há importação em lote nesta fase.
