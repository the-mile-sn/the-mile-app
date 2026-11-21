# Fase B3: APIs PT/EN em ramo isolado (sem deploy)

## Âmbito nesta entrega
Foram introduzidos novos percursos, guardados por `MILE_APP_TRANSLATIONS_ENABLED=1`. Por defeito a opção está **desligada** e devolve HTTP 404. Nenhuma rota anterior foi substituída. A aplicação não importa o módulo novo fora destes percursos. Nenhum esquema é criado automaticamente pelo servidor; sem migração previamente aprovada e testada o acesso devolve HTTP 503.

### Rotas (ainda não ativas em produção)
- `GET /api/v2/player/language`: língua persistente da conta autenticada; `pt` por defeito.
- `PUT /api/v2/player/language`: grava apenas a língua do próprio jogador. JSON estrito `{"language":"pt"|"en"}`.
- `GET /api/v2/chef/language`: lê o idioma do chef da associação existente. Não há nova rota de escrita: o endpoint atual `PUT /api/v2/chef/preferences` permanece a única gravação.
- `GET /api/v2/admin/i18n`: revisão do campo original e tradução candidata, apenas para admins.
- `GET /api/v2/admin/i18n/history`: histórico de propostas e aprovações do campo original, apenas admins.
- `POST /api/v2/admin/i18n/propose`: registo de tradução pendente, sujeito ao hash do original, apenas admins.
- `POST /api/v2/admin/i18n/approve`: aprovação sujeita simultaneamente ao hash do original e ao hash da proposta, apenas admins.

### Segurança
As rotas integram-se após os mecanismos existentes de sessão, papel do utilizador, segregação por `MILE_SITE_ROLE`, verificação de origem e token CSRF nas escritas. O módulo confirma novamente permissões por utilizador na base de dados, não aceita IDs de outras contas na gravação de idioma, nem utiliza texto original ou ID de autor fornecido pelo navegador. As traduções só operam sobre campos explicitamente autorizados de alimentos e pratos ativos.

A preferência de jogadores e de chefs é independente. A infraestrutura de Chef aproveita o campo na associação ao chef; o seletor visual antigo NÃO é considerado aprovado e será redesenhado separadamente.

### Proteções clínicas
A tradução não modifica o texto canónico de alimentos ou pratos, menus, prescrições, quantidades, cálculos, nomes internos de refeições, `option_ref` ou histórico. O português é o fallback quando não há aprovação válida. Os endpoints novos ainda **não** são consumidos pela app, e a tradução de planos/consumos ainda não está ligada.

### Antes de disponibilizar
- Validar migração de schema numa base de dados de testes equivalente a produção; o teste PostgreSQL atual usa apenas instância descartável.
- Validar as rotas numa cópia de ambiente sem dados clínicos reais, com sessão e CSRF reais.
- Preparar o seletor em Perfil nos dois Guias Visuais; não reutilizar o seletor visual do Chef antigo.
- Ligar apresentação aprovada aos endpoints da app, com estratégia de revalidação de registos de consumo.
- Rever e aprovar antes de qualquer merge para ramos de produção ou alteração de variáveis Render.
