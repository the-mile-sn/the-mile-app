# Formulário pré-consulta

Formulário próprio (substitui o Google Forms) que o cliente preenche antes da primeira consulta.

## Onde vive

- Página pública: `https://themile.pt/apps/the-mile-booking/formulario?t=<código>`.
  Passa pelo app proxy Shopify já instalado (**The Mile Booking**), que assina cada pedido.
  O backend só responde com assinatura válida (`verify_proxy_signature`). A página não abre no admin nem na app dos jogadores.
- Não fica indexada (`noindex`) e só abre com o código do link (aleatório, 43 caracteres).
- O link fica válido 120 dias. Se expirar, voltar a copiar o link no backoffice renova o prazo (o código mantém-se).

## Backoffice

- **Consultas → ficha do cliente → Formulário pré-consulta**: estado (link ainda não criado / por preencher / recebido), **Copiar link** e **Ver respostas**.
- **Modo consulta → passo Formulário** (só primeiras consultas, e é o passo inicial): respostas por secção, frequências alimentares e dia típico.
- **Nota → A ter em conta**: alergias, intolerâncias, medicação, problemas de saúde e gravidez, vindos do formulário, mais as notas do perfil.

## Dados

- Tabela `consult_forms` (aditiva): um formulário por cliente, `answers_json`, estado `pending`/`submitted`, data do consentimento.
- As perguntas estão definidas uma só vez em `consult_forms_v2.STEPS` (página e backoffice usam a mesma definição).
- Ao enviar, preenche no perfil **apenas os campos vazios**: data de nascimento, sexo e altura. Nunca substitui o que a equipa registou nem altera nomes, marcações ou pagamentos.
- Depois de enviado, o cliente pode rever e alterar as respostas pelo mesmo link; não pode retirar o consentimento.

## Ainda por fazer

- Incluir o link nos emails de marcação (hoje copia-se no backoffice e envia-se por email/WhatsApp).
- Versão em inglês.
- Porções com fotografias no «dia típico».
