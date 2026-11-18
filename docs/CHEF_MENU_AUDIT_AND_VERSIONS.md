# The Mile — Menus Chef: auditoria e futuras versões

**Estado:** decisão arquitetural documentada em 18/11/2026. O backoffice já mostra eventos reais; o versionamento recuperável descrito abaixo **não está implementado**.

## Fontes de verdade atuais

- `v2_weekly_menus`: menu planeado atual, consultado pelo backoffice e pelas experiências dos utilizadores (nas permissões aplicáveis).
- `v2_menu_history`: estado histórico por dia/refeição, sujeito a `UPSERT`; **não é** um arquivo de todas as versões.
- `v2_chef_menu_audit`: eventos de alteração/proposta com conteúdo anterior/novo, autor, data e estado de revisão. Cada alteração cria um novo evento; a revisão atualiza o estado do evento.
- `v2_chef_meal_execution`: cada registo de execução tem autor, data, estado, descrição, observações e snapshot do menu planeado. A app Chef lê a execução mais recente por dia/refeição, mas o histórico de registos continua na tabela.
- Os registos de consumo do jogador são independentes do menu servido.

## Regra de apresentação

No Planeamento, o jogador já está selecionado; não repetir o seu nome em cada evento. Em «Alterações e execução», os eventos surgem com filtros locais (Todos, Alterações de menu, Execuções e Por analisar). Cada evento é expansível e mostra autoria, momento, antes/depois ou planeado/servido e as ações reais de revisão, sem reconstruir dados inventados.

- `pending_review`: uma alteração ao menu já foi aplicada ao planeamento e aguarda análise; **não** afirmar que está por publicar/aprovar.
- `pending_validation`: nova proposta de prato; não integra o menu publicado do jogador até existir aprovação conforme a Biblioteca.
- `reviewed`: analisado, não equivale a aprovação nutricional.
- `recorded`: registado, não equivale a consumo ou publicação.
- «Menu definido»/«Menu alterado» são rótulos descritivos do evento, não estados jurídicos/clinicamente validados.
- Um Chef pode ser responsável por definir uma semana inteira; o sistema futuro terá de representar responsabilidade por período e não presumir validação sempre obrigatória pela The Mile.

## Integração futura com versões

Se avançarmos para versões recuperáveis, introduzir **identificadores imutáveis de versão de planeamento** por jogador, data e refeição e uma ligação explícita entre a versão e os eventos de auditoria. Uma versão deve conservar autor, origem (Chef/The Mile), instante, valores/dish IDs, versão anterior, responsabilidade na semana e decisão de revisão, quando aplicável. Na execução, gravar a referência à versão planeada em vigor no momento do registo, sem substituir o snapshot existente. O consumo do jogador permanece separado.

Não migrar retroativamente todos os `UPSERTs` de `v2_menu_history` para supostas revisões, pois a sequência integral anterior pode não ser reconstituível. Nunca escrever eventos fictícios nem alterar prescrições nutricionais. Definir regras de mudança de autoria/responsabilidade, de publicação, de restauração e de notificações antes de adicionar novas APIs ou interfaces de versões. A app dos jogadores deve mostrar apenas a transparência necessária, de forma subtil.
