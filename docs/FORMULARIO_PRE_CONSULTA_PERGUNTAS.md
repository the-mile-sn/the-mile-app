# Formulário pré-consulta — todas as perguntas

Gerado a partir de `consult_forms_v2.py` (a mesma definição que a página e o backoffice usam). Tem todas as perguntas do «Formulário The Mile» (Google Forms), organizadas em ecrãs curtos, pela ordem em que o cliente as vê.

Legenda: **\*** obrigatória · *(várias)* pode escolher várias · *mostra-se se…* pergunta condicional.

## Sobre ti

### Ecrã 1: Vamos começar
_Primeiro, para quem é a consulta._

- Para quem é esta consulta? **\***
  - Opções: Para mim · Para outra pessoa
- Nome completo de quem vai à consulta **\*** — *mostra-se se «Para quem é esta consulta?» = Para outra pessoa*
  - Texto
- A tua relação com essa pessoa — *mostra-se se «Para quem é esta consulta?» = Para outra pessoa*
  - Texto
- Data de nascimento **\***
  - Data

### Ecrã 2: Um pouco sobre ti
_Ajuda-nos a perceber o teu dia a dia._

- Profissão
  - Texto
- Onde vives? Cidade e país
  - Texto
- Com quem vives? *(várias)*
  - Opções: Sozinho/a · Companheiro/a · Filho/a · Pais ou outros familiares · Colegas · Outra (com campo «Outra:» para escrever)
- Onde ouviste falar sobre nós?
  - Opções: Um amigo ou colega · Outro profissional de saúde · Clube / Equipa · Instagram · Facebook · Web · Parceiro · Ginásio / Estúdio de treino / Personal Trainer · Outra (com campo «Outra:» para escrever)
- NIF (Número de Identificação Fiscal)
  - Texto

## Saúde

### Ecrã 3: O teu corpo
_Valores aproximados chegam. Na consulta medimos tudo._

- Sexo **\***
  - Opções: Feminino · Masculino
- Quanto medes? **\***
  - Número em cm (100–230)
- Qual o teu peso atual? **\***
  - Número em kg (25–250)
- Tens o hábito de te pesar diariamente? **\***
  - Opções: Sim · Não

### Ecrã 4: A tua saúde
_Deixa em branco o que não se aplica._

- Patologias (hipertensão, diabetes, colesterol, outras)
  - Texto
- Medicação
  - Texto
- Alergias
  - Texto
- Intolerâncias alimentares ou alimentos com que sintas desconforto gastrointestinal
  - Texto
- Fumas? **\***
  - Opções: Não · Sim (1–10 cigarros/semana) · Sim (11–20 cigarros/semana) · Sim (> 20 cigarros/semana)

### Ecrã 5: Sono

- Quantas horas dormes, em média, por dia? **\***
  - Opções: 1 · 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10
- Como é a qualidade do teu sono? **\***
  - Opções: 1 · 2 · 3 · 4 · 5  (Muito má → Excelente)

### Ecrã 6: Objetivos
_O que queres alcançar connosco._

- Qual(ais) o(s) teu(s) objetivo(s)? **\*** *(várias)*
  - Opções: Emagrecimento · Aumento de massa muscular · Maximização do rendimento desportivo · Otimização de saúde · Recuperação de lesão · Outra (com campo «Outra:» para escrever)
- Já tiveste algum acompanhamento nutricional antes? **\***
  - Opções: Sim · Não

## Saúde feminina
*Secção mostrada só se «Sexo» = Feminino.*

### Ecrã 7: Ciclo menstrual

- Ciclo menstrual **\***
  - Opções: Amenorreia (sem menstruação) · Regular (28–32 dias) · Irregular · Não sei
- Desde quando? — *mostra-se se «Ciclo menstrual» = Amenorreia (sem menstruação)*
  - Texto
- Primeiro dia da última menstruação
  - _Se não sabes, deixa em branco._
  - Data
- Tens fluxo intenso com frequência?
  - Opções: Sim · Não · Não tenho a certeza

### Ecrã 8: Ciclo e treino

- Se és atleta ou treinas, sentes alguma mudança na tua performance durante o teu período menstrual?
  - Opções: Sim · Não · Não tenho a certeza
- Que sintomas tens? *(várias)* — *mostra-se se «Se és atleta ou treinas, sentes alguma mudança na tua performance durante o teu período menstrual?» = Sim*
  - Opções: Fadiga · Cãimbras · Fraqueza · Dor muscular · Outra (com campo «Outra:» para escrever)
- Costumas ter algum sintoma pré-menstrual?
  - _Exemplo: mudanças de humor, cãimbras, enxaquecas ou dores de cabeça._
  - Opções: Sim · Não · Não tenho a certeza
- Tomas a pílula?
  - Opções: Sim · Não
- Qual? — *mostra-se se «Tomas a pílula?» = Sim*
  - Texto

## Treino

### Ecrã 9: Atividade física

- Praticas algum tipo de atividade física ou desporto? **\***
  - _Exemplo: futebol, musculação, corrida._
  - Opções: Nunca (0 dias) · Às vezes (1–2 dias) · Frequentemente (3–4 dias) · Quase todos os dias (5–6 dias) · Todos os dias
- Qual(ais) destes desportos praticas? *(várias)* — *mostra-se se pratica atividade física (não «Nunca»)*
  - Opções: Futebol · Futsal · Ciclismo · Natação · Voleibol · Andebol · Basquetebol · Ténis · Desportos de combate · Atletismo · Corrida · CrossFit / Cross training · Musculação · Outra (com campo «Outra:» para escrever)
- De forma recreativa ou profissional? — *mostra-se se pratica atividade física (não «Nunca»)*
  - Opções: Recreativa · Semiprofissional · Profissional

### Ecrã 10: A tua semana de treino

- Descreve-nos a tua rotina de treinos e de jogos, caso se aplique, numa semana típica. — *mostra-se se pratica atividade física (não «Nunca»)*
  - Texto longo
- Usas algum aparelho de monitorização de sono/treino? *(várias)*
  - Opções: Apple Watch, Garmin, Fitbit (ou semelhantes) · WHOOP · Oura · Não uso · Outra (com campo «Outra:» para escrever)
- Fazes alguma estratégia de recuperação?
  - _Ex.: ice baths, pressoterapia, foam roll, massagem desportiva._
  - Opções: Sim · Não

## Alimentação

### Ecrã 11: Como comes

- Padrão alimentar **\***
  - Opções: Omnívoro (come carne e peixe) · Pescetariano (não come carne, mas come peixe) · Ovolactovegetariano (não come carne nem peixe, mas laticínios sim) · Vegetariano · Vegan
- Alimentos preferidos
  - Texto longo
- Alimentos de que não gostas
  - Texto

### Ecrã 12: Compras e cozinha

- Quem vai às compras? **\***
  - Opções: Eu · A/o companheira/o · Outros familiares · Outra (com campo «Outra:» para escrever)
- Em que supermercados? **\*** *(várias)*
  - Opções: Continente · Pingo Doce · Mercadona · Lidl · Aldi · Intermarché · Não sei · Outra (com campo «Outra:» para escrever)
- Quem cozinha a maior parte das vezes? **\***
  - Opções: Eu · A/o companheira/o · Outros familiares · Outra (com campo «Outra:» para escrever)
- Pesas a comida? **\***
  - Opções: Nunca · Às vezes · Frequentemente · Quase todos os dias · Todos os dias

### Ecrã 13: Bebidas

- Que quantidade de água costumas beber por dia? **\***
  - _Além da que bebes durante os treinos, se for o caso._
  - Opções: < 0,5 L · 0,5 – 1,0 L · 1,0 – 2,0 L · > 2,0 L
- Qual a cor da tua primeira urina do dia? **\***
  - _1 é a mais clara e 7 a mais escura._
  - Opções: 1 · 2 · 3 · 4 · 5 · 6 · 7 · Não sei
- Cafés por dia **\***
  - Opções: 0 · 1–2 · 2–3 · 3–4 · > 4
- Bebidas alcoólicas por semana **\***
  - Opções: 0 · 1 · 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10
- O que bebes ao almoço e ao jantar? **\*** *(várias)*
  - Opções: Água · Água com gás · Chá · Refrigerante · Refrigerante zero · Sumos de fruta · Vinho / cerveja · Nada · Outra (com campo «Outra:» para escrever)

### Ecrã 14: Com que frequência comes…
_Um toque por alimento: quantos dias por semana, numa semana normal. Se for todos os dias, dizes-nos quantas vezes._

- Com que frequência incluis… **\***
  - _Por semana ou por dia. Escolhe a opção mais próxima de uma semana normal._
  - Para cada alimento: Nunca · 1–2 · 3–4 · 5–6 dias por semana · Todos os dias; em «Todos» pergunta quantas vezes por dia quando o Google Forms tinha essa escolha.
    - Sopa: Nunca · Às vezes (1–2 dias) · Frequentemente (3–4 dias) · Quase todos os dias (5–6 dias) · Todos os dias (1×/dia) · Todos os dias (2×/dia)
    - Legumes no prato: Nunca · Às vezes (1–2 dias) · Frequentemente (3–4 dias) · Quase todos os dias (5–6 dias) · Todos os dias (1×/dia) · Todos os dias (2×/dia)
    - Fruta: Nunca · Às vezes (1–2 dias) · Frequentemente (3–4 dias) · Quase todos os dias (5–6 dias) · Todos os dias (1×/dia) · Todos os dias (2–3×/dia) · Todos os dias (3–5×/dia) · Todos os dias (>5×/dia)
    - Leguminosas (feijão, grão, lentilhas, ervilhas…): Nunca · Às vezes (1–2 dias) · Frequentemente (3–4 dias) · Quase todos os dias (5–6 dias) · Todos os dias (1×/dia) · Todos os dias (2×/dia)
    - Peixe: Nunca · Às vezes (1–2 dias) · Frequentemente (3–4 dias) · Quase todos os dias (5–6 dias) · Todos os dias (1×/dia) · Todos os dias (2×/dia)
    - Peixe gordo (salmão, sardinha, cavala…): Nunca · Às vezes (1–2 dias) · Frequentemente (3–4 dias) · Quase todos os dias (5–6 dias) · Todos os dias (1×/dia) · Todos os dias (2×/dia)
    - Carne vermelha: Nunca · Às vezes (1–2 dias) · Frequentemente (3–4 dias) · Quase todos os dias (5–6 dias) · Todos os dias (1×/dia) · Todos os dias (2×/dia)
    - Laticínios (leite, iogurtes, queijo…): Nunca · Às vezes (1–2 dias) · Frequentemente (3–4 dias) · Quase todos os dias (5–6 dias) · Todos os dias (1×/dia) · Todos os dias (2–3×/dia) · Todos os dias (3–5×/dia) · Todos os dias (>5×/dia)
    - Frutos gordos (nozes, amêndoas, avelãs, cajus): Nunca · Às vezes (1–2 dias) · Frequentemente (3–4 dias) · Quase todos os dias (5–6 dias) · Todos os dias
    - Refeições fora, take-away ou encomendadas: Nunca · Às vezes (1–2 dias) · Frequentemente (3–4 dias) · Quase todos os dias (5–6 dias) · Todos os dias (1×/dia) · Todos os dias (2×/dia)
    - Fritos (rissóis, croquetes, batatas fritas…): Nunca · Às vezes (1–2 dias) · Frequentemente (3–4 dias) · Quase todos os dias (5–6 dias) · Todos os dias
    - Doces (bolos de pastelaria, bolachas, chocolates, gomas…): Nunca · Às vezes (1–2 dias) · Frequentemente (3–4 dias) · Quase todos os dias (5–6 dias) · Todos os dias

## Diário alimentar

### Ecrã 15: Um dia típico
_Conta-nos o que comes num dia normal._

- Descreve um dia alimentar típico
  - _Indica a hora e o que comes. Ex.: 8h00, pão com queijo magro e leite com café. Se não fazes alguma das refeições, deixa em branco._
  - Hora + texto para: Pequeno-almoço · Lanche da manhã · Almoço · Lanche da tarde · Jantar · Ceia · Outra refeição importante (ex.: pós-treino)

### Ecrã 16: Porções

- Qual é a porção de proteína que comes nas refeições principais? **\***
  - _Exemplo: carne, peixe, alternativas vegetais._
  - Opções: 80 g · 100 g · 120 g · 125 g · 160 g · 180 g · 200 g · 220 g
- Qual é a porção de hidratos que comes nas refeições principais? **\***
  - _Exemplo: arroz, massa, batata, quinoa._
  - Opções: 50 g · 75 g · 100 g · 125 g · 150 g · 175 g · 200 g · 220 g · 250 g

## Mudanças

### Ecrã 17: Mudanças na tua alimentação
_Já estás quase!_

- Seleciona as opções que gostas ou que estarias disposto/a a experimentar. *(várias)*
  - Opções: Ovos mexidos com pão e fruta · Tosta mista com iogurte e fruta · Pão com queijo fresco e compota/doce · Tosta de abacate e ovo · Tosta de salmão fumado e queijo creme · Bowl de iogurte · Papas de aveia · Overnight oats · Panquecas com whey na massa · Panquecas com topping de iogurte · Bolo de caneca · Batido proteico · Smoothie bowl · Leite proteico com cereais · Iogurte proteico com bolachas de arroz e fruta · Outra (com campo «Outra:» para escrever)
- Qual a tua motivação para aderir a mudanças na tua alimentação? **\***
  - Opções: 0 · 1 · 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10  (Nenhuma → Total)

## Suplementação

### Ecrã 18: Suplementação

- Que suplementos fazes? **\*** *(várias)*
  - Opções: Não faço · Creatina · Beta-alanina · Ómega-3 · Tart Cherry · Multivitamínico · Vitamina D · Vitamina B12 · Proteína whey · Outra (com campo «Outra:» para escrever)
- Diz-nos a marca e a dose dos suplementos que tomas. — *mostra-se se escolheu algum suplemento*
  - Texto longo
- És atleta ou tens jogos ou competições?
  - Opções: Sim · Não

## Dia de jogo
*Secção mostrada só se «És atleta ou tens jogos ou competições?» = Sim.*

### Ecrã 19: Antes do jogo

- No dia anterior ao jogo/competição costumas alterar algo na tua alimentação?
  - Opções: Sim · Não
- O quê? **\*** — *mostra-se se «No dia anterior ao jogo/competição costumas alterar algo na tua alimentação?» = Sim*
  - Texto
- No dia de jogo/competição costumas alterar algo na tua alimentação? **\***
  - Opções: Sim · Não
- O quê? — *mostra-se se «No dia de jogo/competição costumas alterar algo na tua alimentação?» = Sim*
  - Texto

### Ecrã 20: No jogo

- Comes ou bebes alguma coisa antes do jogo/competição? **\*** *(várias)*
  - _Exemplo: no balneário ou no aquecimento._
  - Opções: Bolacha tipo Maria · Redbull · Bebida desportiva · Banana · Gel desportivo · Barra desportiva · Nada · Outra (com campo «Outra:» para escrever)
- Comes ou bebes alguma coisa durante o jogo/competição? **\*** *(várias)*
  - _Exemplo: no balneário, no intervalo._
  - Opções: Bolacha tipo Maria · Redbull · Bebida desportiva · Banana · Gel desportivo · Barra desportiva · Nada · Outra (com campo «Outra:» para escrever)

## Notas

### Ecrã 21: Último passo
_Obrigada pelo tempo que dedicaste a isto._

- Adiciona alguma nota, comentário ou dúvida que consideres relevante.
  - Texto longo
- ☐ Autorizo a The Mile a tratar os dados de saúde deste formulário para preparar e acompanhar as consultas de nutrição. **\***

## Diferenças em relação ao Google Forms

- **Nome, email e telefone** não se pedem: já vêm da marcação. Quando a consulta é para outra pessoa, pede-se o nome dela e a relação.
- **Serviço adquirido** não se pede: já se sabe pela marcação.
- **Altura em cm** e **peso em kg** escritos pelo cliente, em vez das listas longas.
- **Cor da urina**: escala de 1 a 7 com círculos de cor aproximados; no Google Forms havia uma imagem.
- **Ainda por fazer:** envio da fotografia; fotografias das porções (proteína e hidratos aparecem só em gramas); versão em inglês.

Total: 65 perguntas, mais o consentimento, em 21 ecrãs (alguns só aparecem quando se aplicam).
