"""Formulário pré-consulta: respostas do cliente antes da primeira consulta.

Aditivo: só cria a tabela ``consult_forms``. Cada cliente de consulta tem no
máximo um formulário, aberto por um link com um código aleatório. A página
pública vive em themile.pt (app proxy Shopify, assinado) e nunca no admin.

Ao enviar, preenche no perfil apenas os campos ainda vazios (data de
nascimento, sexo, altura). Não altera marcações, pagamentos nem nomes.
"""
import json
import os
import re
import secrets
import time
import uuid
from datetime import date

from appointments_catalog_v2 import ORG_ID
import consult_clients_v2 as clients

TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{30,60}$")
LINK_DAYS = 120
ANSWERS_LIMIT = 60000

YES_NO = [["yes", "Sim"], ["no", "Não"]]
UNSURE = [["yes", "Sim"], ["no", "Não"], ["unsure", "Não tenho a certeza"]]
OTHER = ["other", "Outra"]
# Frequências como no Google Forms (cada alimento tem a sua escala).
F_BASE = [["never", "Nunca"], ["d1_2", "Às vezes (1–2 dias)"], ["d3_4", "Frequentemente (3–4 dias)"],
          ["d5_6", "Quase todos os dias (5–6 dias)"]]
F_DAY2 = F_BASE + [["x1", "Todos os dias (1×/dia)"], ["x2", "Todos os dias (2×/dia)"]]
F_DAY5 = F_BASE + [["x1", "Todos os dias (1×/dia)"], ["x2_3", "Todos os dias (2–3×/dia)"],
                   ["x3_5", "Todos os dias (3–5×/dia)"], ["x5", "Todos os dias (>5×/dia)"]]
F_DAILY = F_BASE + [["daily", "Todos os dias"]]
WHO = [["me", "Eu"], ["partner", "A/o companheira/o"], ["family", "Outros familiares"], OTHER]
GAME_FOOD = [["maria", "Bolacha tipo Maria"], ["redbull", "Redbull"], ["sports_drink", "Bebida desportiva"],
             ["banana", "Banana"], ["gel", "Gel desportivo"], ["bar", "Barra desportiva"], ["nothing", "Nada"], OTHER]


def _scale(lo, hi):
    return [[str(n), str(n)] for n in range(lo, hi + 1)]


# Uma só definição de perguntas para a página do cliente e para o backoffice.
# Segue o «Formulário The Mile» (Google Forms), secção a secção.
# Tipos: choice, multi, text, textarea, date, number, check, freq (frequências), meals.
# «other: True» acrescenta um campo de texto «<id>_other» quando se escolhe «Outra».
STEPS = [
    {"id": "about", "title": "Sobre ti", "fields": [
        {"id": "for_whom", "short": "Para quem", "type": "choice", "label": "Para quem é esta consulta?", "required": True,
         "options": [["self", "Para mim"], ["other", "Para outra pessoa"]]},
        {"id": "attendee_name", "short": "Nome de quem vai", "type": "text", "label": "Nome completo de quem vai à consulta",
         "required": True, "when": {"for_whom": "other"}, "max": 120},
        {"id": "relation", "short": "Relação", "type": "text", "label": "A tua relação com essa pessoa",
         "placeholder": "Ex.: mãe, pai, treinador", "when": {"for_whom": "other"}, "max": 80},
        {"id": "birth_date", "type": "date", "label": "Data de nascimento", "required": True,
         "hint_other": "Da pessoa que vai à consulta."},
        {"id": "nif", "short": "NIF", "type": "text", "label": "NIF (Número de Identificação Fiscal)", "max": 20},
        {"id": "occupation", "short": "Profissão", "type": "text", "label": "Profissão", "max": 120},
        {"id": "city", "short": "Onde vive", "type": "text", "label": "Onde vives? Cidade e país",
         "placeholder": "Ex.: Porto, Portugal", "max": 120},
        {"id": "lives_with", "short": "Vive com", "type": "multi", "label": "Com quem vives?", "other": True,
         "options": [["alone", "Sozinho/a"], ["partner", "Companheiro/a"], ["children", "Filho/a"],
                     ["family", "Pais ou outros familiares"], ["colleagues", "Colegas"], OTHER]},
        {"id": "heard_from", "short": "Conheceu-nos por", "type": "choice", "label": "Onde ouviste falar sobre nós?", "other": True,
         "options": [["friend", "Um amigo ou colega"], ["health_pro", "Outro profissional de saúde"],
                     ["club", "Clube / Equipa"], ["instagram", "Instagram"], ["facebook", "Facebook"], ["web", "Web"],
                     ["partner", "Parceiro"], ["gym", "Ginásio / Estúdio de treino / Personal Trainer"], OTHER]},
    ]},
    {"id": "health", "title": "Dados antropométricos, clínicos e de saúde", "fields": [
        {"id": "sex", "type": "choice", "label": "Sexo", "required": True,
         "options": [["F", "Feminino"], ["M", "Masculino"]]},
        {"id": "height_cm", "short": "Altura", "type": "number", "label": "Quanto medes?", "unit": "cm", "required": True,
         "min": 100, "max": 230, "step": 1},
        {"id": "weight_kg", "short": "Peso atual", "type": "number", "label": "Qual o teu peso atual?", "unit": "kg",
         "required": True, "min": 25, "max": 250, "step": 0.1},
        {"id": "weighs_daily", "short": "Pesa-se diariamente", "type": "choice", "required": True,
         "label": "Tens o hábito de te pesar diariamente?", "options": YES_NO},
        {"id": "conditions", "short": "Patologias", "type": "text", "max": 500,
         "label": "Patologias (hipertensão, diabetes, colesterol, outras)"},
        {"id": "medication", "short": "Medicação", "type": "text", "label": "Medicação", "max": 500},
        {"id": "allergies", "short": "Alergias", "type": "text", "label": "Alergias", "max": 300},
        {"id": "intolerances", "short": "Intolerâncias", "type": "text", "max": 300,
         "label": "Intolerâncias alimentares ou alimentos com que sintas desconforto gastrointestinal"},
        {"id": "previous_nutrition", "short": "Acompanhamento nutricional anterior", "type": "choice", "required": True,
         "label": "Já tiveste algum acompanhamento nutricional antes?", "options": YES_NO},
        {"id": "goals", "short": "Objetivos", "type": "multi", "label": "Qual(ais) o(s) teu(s) objetivo(s)?",
         "required": True, "other": True,
         "options": [["weight_loss", "Emagrecimento"], ["muscle", "Aumento de massa muscular"],
                     ["performance", "Maximização do rendimento desportivo"], ["health", "Otimização de saúde"],
                     ["injury", "Recuperação de lesão"], OTHER]},
        {"id": "smoking", "short": "Fuma", "type": "choice", "label": "Fumas?", "required": True,
         "options": [["no", "Não"], ["s1_10", "Sim (1–10 cigarros/semana)"], ["s11_20", "Sim (11–20 cigarros/semana)"],
                     ["s20", "Sim (> 20 cigarros/semana)"]]},
        {"id": "sleep_hours", "short": "Horas de sono", "type": "choice", "compact": True, "unit": "horas",
         "label": "Quantas horas dormes, em média, por dia?", "required": True, "options": _scale(1, 10)},
        {"id": "sleep_quality", "short": "Qualidade do sono", "type": "choice", "compact": True,
         "label": "Como é a qualidade do teu sono?", "required": True, "ends": ["Muito má", "Excelente"],
         "options": _scale(1, 5)},
    ]},
    {"id": "female", "title": "Saúde feminina", "when": {"sex": "F"}, "fields": [
        {"id": "cycle", "short": "Ciclo menstrual", "type": "choice", "label": "Ciclo menstrual", "required": True,
         "options": [["absent", "Amenorreia (sem menstruação)"], ["regular", "Regular (28–32 dias)"],
                     ["irregular", "Irregular"], ["unknown", "Não sei"]]},
        {"id": "amenorrhea_since", "short": "Amenorreia desde", "type": "text", "label": "Desde quando?",
         "when": {"cycle": "absent"}, "max": 120},
        {"id": "last_period", "short": "Última menstruação", "type": "date",
         "label": "Primeiro dia da última menstruação", "hint": "Se não sabes, deixa em branco."},
        {"id": "heavy_flow", "short": "Fluxo intenso frequente", "type": "choice",
         "label": "Tens fluxo intenso com frequência?", "options": UNSURE},
        {"id": "cycle_performance", "short": "Muda a performance no período", "type": "choice", "options": UNSURE,
         "label": "Se és atleta ou treinas, sentes alguma mudança na tua performance durante o teu período menstrual?"},
        {"id": "cycle_symptoms", "short": "Sintomas no período", "type": "multi", "label": "Que sintomas tens?",
         "when": {"cycle_performance": "yes"}, "other": True,
         "options": [["fatigue", "Fadiga"], ["cramps", "Cãimbras"], ["weakness", "Fraqueza"],
                     ["muscle_pain", "Dor muscular"], OTHER]},
        {"id": "pms", "short": "Sintomas pré-menstruais", "type": "choice", "options": UNSURE,
         "label": "Costumas ter algum sintoma pré-menstrual?",
         "hint": "Exemplo: mudanças de humor, cãimbras, enxaquecas ou dores de cabeça."},
        {"id": "pill", "short": "Pílula", "type": "choice", "label": "Tomas a pílula?", "options": YES_NO},
        {"id": "pill_which", "short": "Qual pílula", "type": "text", "label": "Qual?", "when": {"pill": "yes"}, "max": 120},
    ]},
    {"id": "training", "title": "Rotina de treinos", "fields": [
        {"id": "activity", "short": "Atividade física", "type": "choice", "required": True,
         "label": "Praticas algum tipo de atividade física ou desporto?",
         "hint": "Exemplo: futebol, musculação, corrida.",
         "options": [["never", "Nunca (0 dias)"], ["d1_2", "Às vezes (1–2 dias)"], ["d3_4", "Frequentemente (3–4 dias)"],
                     ["d5_6", "Quase todos os dias (5–6 dias)"], ["daily", "Todos os dias"]]},
        {"id": "sports", "short": "Desportos", "type": "multi", "label": "Qual(ais) destes desportos praticas?",
         "when_not": {"activity": ["never", None]}, "other": True,
         "options": [["football", "Futebol"], ["futsal", "Futsal"], ["cycling", "Ciclismo"], ["swimming", "Natação"],
                     ["volleyball", "Voleibol"], ["handball", "Andebol"], ["basketball", "Basquetebol"],
                     ["tennis", "Ténis"], ["combat", "Desportos de combate"], ["athletics", "Atletismo"],
                     ["running", "Corrida"], ["crossfit", "CrossFit / Cross training"], ["weights", "Musculação"], OTHER]},
        {"id": "sport_level", "short": "Nível", "type": "choice", "label": "De forma recreativa ou profissional?",
         "when_not": {"activity": ["never", None]},
         "options": [["recreational", "Recreativa"], ["semi", "Semiprofissional"], ["pro", "Profissional"]]},
        {"id": "weekly_routine", "short": "Rotina semanal", "type": "textarea", "max": 2000,
         "when_not": {"activity": ["never", None]},
         "label": "Descreve-nos a tua rotina de treinos e de jogos, caso se aplique, numa semana típica.",
         "placeholder": "Ex.: Segunda-feira: treino de futebol às 10h30 e ginásio às 14h00."},
        {"id": "devices", "short": "Monitorização", "type": "multi", "other": True,
         "label": "Usas algum aparelho de monitorização de sono/treino?",
         "options": [["watch", "Apple Watch, Garmin, Fitbit (ou semelhantes)"], ["whoop", "WHOOP"], ["oura", "Oura"],
                     ["none", "Não uso"], OTHER]},
        {"id": "recovery", "short": "Estratégias de recuperação", "type": "choice", "options": YES_NO,
         "label": "Fazes alguma estratégia de recuperação?",
         "hint": "Ex.: ice baths, pressoterapia, foam roll, massagem desportiva."},
    ]},
    {"id": "habits", "title": "Hábitos e preferências alimentares", "fields": [
        {"id": "diet_pattern", "short": "Padrão alimentar", "type": "choice", "label": "Padrão alimentar", "required": True,
         "options": [["omnivore", "Omnívoro (come carne e peixe)"],
                     ["pescetarian", "Pescetariano (não come carne, mas come peixe)"],
                     ["ovolacto", "Ovolactovegetariano (não come carne nem peixe, mas laticínios sim)"],
                     ["vegetarian", "Vegetariano"], ["vegan", "Vegan"]]},
        {"id": "favorite_foods", "short": "Alimentos preferidos", "type": "textarea", "label": "Alimentos preferidos", "max": 1000},
        {"id": "disliked_foods", "short": "Alimentos de que não gosta", "type": "text", "label": "Alimentos de que não gostas", "max": 500},
        {"id": "shopping", "short": "Quem faz as compras", "type": "choice", "label": "Quem vai às compras?",
         "required": True, "other": True, "options": WHO},
        {"id": "supermarkets", "short": "Supermercados", "type": "multi", "label": "Em que supermercados?",
         "required": True, "other": True,
         "options": [["continente", "Continente"], ["pingo_doce", "Pingo Doce"], ["mercadona", "Mercadona"],
                     ["lidl", "Lidl"], ["aldi", "Aldi"], ["intermarche", "Intermarché"], ["unknown", "Não sei"], OTHER]},
        {"id": "cooking", "short": "Quem cozinha", "type": "choice", "label": "Quem cozinha a maior parte das vezes?",
         "required": True, "other": True, "options": WHO},
        {"id": "weighs_food", "short": "Pesa a comida", "type": "choice", "label": "Pesas a comida?", "required": True,
         "options": [["never", "Nunca"], ["sometimes", "Às vezes"], ["often", "Frequentemente"],
                     ["almost_daily", "Quase todos os dias"], ["daily", "Todos os dias"]]},
        {"id": "water", "short": "Água por dia", "type": "choice", "required": True,
         "label": "Que quantidade de água costumas beber por dia?",
         "hint": "Além da que bebes durante os treinos, se for o caso.",
         "options": [["lt05", "< 0,5 L"], ["05_1", "0,5 – 1,0 L"], ["1_2", "1,0 – 2,0 L"], ["gt2", "> 2,0 L"]]},
        {"id": "urine_color", "short": "Cor da urina (1–7)", "type": "choice", "compact": True, "swatches": True,
         "label": "Qual a cor da tua primeira urina do dia?", "required": True,
         "hint": "1 é a mais clara e 7 a mais escura.",
         "options": _scale(1, 7) + [["unknown", "Não sei"]]},
        {"id": "coffee", "short": "Cafés por dia", "type": "choice", "compact": True, "label": "Cafés por dia",
         "required": True, "options": [["0", "0"], ["1_2", "1–2"], ["2_3", "2–3"], ["3_4", "3–4"], ["gt4", "> 4"]]},
        {"id": "alcohol", "short": "Bebidas alcoólicas/semana", "type": "choice", "compact": True, "unit": "copos/bebidas",
         "label": "Bebidas alcoólicas por semana", "required": True, "options": _scale(0, 10)},
        {"id": "frequency", "type": "freq", "label": "Com que frequência incluis…", "required": True,
         "hint": "Numa semana normal, em quantos dias comes cada alimento?", "rows": [
             ["soup", "Sopa", "", F_DAY2], ["vegetables", "Legumes no prato", "", F_DAY2],
             ["fruit", "Fruta", "", F_DAY5],
             ["legumes", "Leguminosas", "feijão, grão, lentilhas, ervilhas…", F_DAY2],
             ["fish", "Peixe", "", F_DAY2], ["fatty_fish", "Peixe gordo", "salmão, sardinha, cavala…", F_DAY2],
             ["red_meat", "Carne vermelha", "", F_DAY2],
             ["dairy", "Laticínios", "leite, iogurtes, queijo…", F_DAY5],
             ["nuts", "Frutos gordos", "nozes, amêndoas, avelãs, cajus", F_DAILY],
             ["eating_out", "Refeições fora, take-away ou encomendadas", "", F_DAY2],
             ["fried", "Fritos", "rissóis, croquetes, batatas fritas…", F_DAILY],
             ["sweets", "Doces", "bolos de pastelaria, bolachas, chocolates, gomas…", F_DAILY]]},
        {"id": "meal_drinks", "short": "Bebe às refeições", "type": "multi", "label": "O que bebes ao almoço e ao jantar?",
         "required": True, "other": True,
         "options": [["water", "Água"], ["sparkling", "Água com gás"], ["tea", "Chá"], ["soda", "Refrigerante"],
                     ["soda_zero", "Refrigerante zero"], ["juice", "Sumos de fruta"], ["wine_beer", "Vinho / cerveja"],
                     ["nothing", "Nada"], OTHER]},
        {"id": "motivation", "short": "Motivação para mudar (0–10)", "type": "choice", "compact": True,
         "label": "Qual a tua motivação para aderir a mudanças na tua alimentação?", "required": True,
         "ends": ["Nenhuma", "Total"], "options": _scale(0, 10)},
    ]},
    {"id": "diary", "title": "Diário alimentar", "fields": [
        {"id": "meals", "type": "meals", "label": "Que refeições fazes num dia normal?",
         "hint": "Escolhe as refeições que fazes. Em cada uma, diz-nos a hora, o que comes e as quantidades.",
         "rows": [["breakfast", "Pequeno-almoço"], ["morning_snack", "Lanche da manhã"], ["lunch", "Almoço"],
                  ["afternoon_snack", "Lanche da tarde"], ["dinner", "Jantar"], ["supper", "Ceia"],
                  ["post_workout", "Pós-treino"], ["other", "Outra"]]},
        {"id": "protein_portion", "short": "Porção de proteína", "type": "choice", "photos": "Carne / Peixe", "required": True,
         "label": "Qual é a porção de proteína que comes nas refeições principais?",
         "hint": "Exemplo: carne, peixe, alternativas vegetais. Escolhe a fotografia mais parecida com o teu prato.",
         "options": [[g, g + " g"] for g in ("80", "100", "120", "140", "160", "180", "200", "220")]},
        {"id": "carb_portion", "short": "Porção de hidratos", "type": "choice", "photos": "Arroz", "required": True,
         "label": "Qual é a porção de hidratos que comes nas refeições principais?",
         "hint": "Exemplo: arroz, massa, batata, quinoa. Escolhe a fotografia mais parecida com o teu prato.",
         "options": [[g, g + " g"] for g in ("50", "70", "100", "120", "150", "180", "200", "220", "250")]},
    ]},
    {"id": "changes", "title": "Mudanças na tua alimentação", "fields": [
        {"id": "alternatives", "short": "Opções que aceita", "type": "multi", "other": True,
         "label": "Seleciona as opções que gostas ou que estarias disposto/a a experimentar.",
         "options": [["eggs_bread", "Ovos mexidos com pão e fruta"], ["toast_yogurt", "Tosta mista com iogurte e fruta"],
                     ["bread_cheese_jam", "Pão com queijo fresco e compota/doce"],
                     ["avocado_egg", "Tosta de abacate e ovo"], ["salmon_toast", "Tosta de salmão fumado e queijo creme"],
                     ["yogurt_bowl", "Bowl de iogurte"], ["oatmeal", "Papas de aveia"], ["overnight", "Overnight oats"],
                     ["whey_pancakes", "Panquecas com whey na massa"],
                     ["yogurt_pancakes", "Panquecas com topping de iogurte"], ["mug_cake", "Bolo de caneca"],
                     ["protein_shake", "Batido proteico"], ["smoothie_bowl", "Smoothie bowl"],
                     ["protein_milk", "Leite proteico com cereais"],
                     ["protein_yogurt", "Iogurte proteico com bolachas de arroz e fruta"], OTHER]},
    ]},
    {"id": "supplements", "title": "Suplementação", "fields": [
        {"id": "supplements", "short": "Suplementos", "type": "multi", "label": "Que suplementos fazes?",
         "required": True, "other": True,
         "options": [["none", "Não faço"], ["creatine", "Creatina"], ["beta_alanine", "Beta-alanina"],
                     ["omega3", "Ómega-3"], ["tart_cherry", "Tart Cherry"], ["multivitamin", "Multivitamínico"],
                     ["vit_d", "Vitamina D"], ["vit_b12", "Vitamina B12"], ["whey", "Proteína whey"], OTHER]},
        {"id": "supplements_info", "short": "Marca, dose e quando", "type": "details", "of": "supplements",
         "label": "Para cada suplemento, diz-nos a marca, a dose e quando tomas.",
         "columns": [["brand", "Marca"], ["dose", "Dose"], ["when", "Quando"]],
         "placeholders": ["Ex.: marca X", "Ex.: 5 g", "Ex.: antes do treino"],
         "when_not": {"supplements": [None, ["none"]]}},
        {"id": "athlete", "short": "Tem jogos ou competições", "type": "choice", "options": YES_NO,
         "label": "És atleta ou tens jogos ou competições?"},
    ]},
    {"id": "game_day", "title": "Hábitos em dia de jogo/competição", "when": {"athlete": "yes"}, "fields": [
        {"id": "day_before_change", "short": "Muda a alimentação na véspera", "type": "choice", "options": YES_NO,
         "label": "No dia anterior ao jogo/competição costumas alterar algo na tua alimentação?"},
        {"id": "day_before_what", "short": "O que muda na véspera", "type": "text", "label": "O quê?", "required": True,
         "when": {"day_before_change": "yes"}, "max": 500},
        {"id": "game_day_change", "short": "Muda a alimentação no dia", "type": "choice", "options": YES_NO, "required": True,
         "label": "No dia de jogo/competição costumas alterar algo na tua alimentação?"},
        {"id": "game_day_what", "short": "O que muda no dia", "type": "text", "label": "O quê?",
         "when": {"game_day_change": "yes"}, "max": 500},
        {"id": "before_game", "short": "Antes do jogo", "type": "multi", "required": True, "other": True,
         "label": "Comes ou bebes alguma coisa antes do jogo/competição?",
         "hint": "Exemplo: no balneário ou no aquecimento.", "options": GAME_FOOD},
        {"id": "during_game", "short": "Durante o jogo", "type": "multi", "required": True, "other": True,
         "label": "Comes ou bebes alguma coisa durante o jogo/competição?",
         "hint": "Exemplo: no balneário, no intervalo.", "options": GAME_FOOD},
    ]},
    {"id": "notes", "title": "Notas e consentimento", "fields": [
        {"id": "notes", "short": "Notas do cliente", "type": "textarea", "max": 3000,
         "label": "Adiciona alguma nota, comentário ou dúvida que consideres relevante."},
        {"id": "consent", "type": "check", "required": True,
         "label": "Autorizo a The Mile a tratar os dados de saúde deste formulário para preparar e acompanhar as consultas de nutrição."},
    ]},
]
for _step in STEPS:
    for _f in list(_step["fields"]):
        if _f.get("other"):
            # Campo «Outra: …» logo a seguir à pergunta.
            _i = _step["fields"].index(_f)
            _step["fields"].insert(_i + 1, {"id": _f["id"] + "_other", "short": _f.get("short", _f["label"]) + " (outra)",
                                            "type": "text", "label": "Outra:", "max": 200, "other_of": _f["id"],
                                            "when": {_f["id"]: "other"}})
FIELDS = {f["id"]: f for s in STEPS for f in s["fields"]}
SECTIONS = STEPS  # secções do Google Forms (usadas para agrupar no backoffice)

# Ecrãs curtos para quem preenche: as mesmas perguntas, reorganizadas em passos pequenos.
# (secção, perguntas); o título de cada ecrã é o nome da secção.
LAYOUT = [
    ("Sobre ti", ["for_whom", "attendee_name", "relation", "birth_date"]),
    ("Sobre ti", ["occupation", "city", "lives_with", "heard_from", "nif"]),
    ("Saúde", ["sex", "height_cm", "weight_kg", "weighs_daily"]),
    ("Saúde", ["conditions", "medication", "allergies", "intolerances", "smoking"]),
    ("Saúde", ["sleep_hours", "sleep_quality"]),
    ("Saúde", ["goals", "previous_nutrition"]),
    ("Saúde feminina", ["cycle", "amenorrhea_since", "last_period", "heavy_flow"]),
    ("Saúde feminina", ["cycle_performance", "cycle_symptoms", "pms", "pill", "pill_which"]),
    ("Treino", ["activity", "sports", "sport_level"]),
    ("Treino", ["weekly_routine", "devices", "recovery"]),
    ("Alimentação", ["diet_pattern", "favorite_foods", "disliked_foods"]),
    ("Alimentação", ["shopping", "supermarkets", "cooking", "weighs_food"]),
    ("Alimentação", ["water", "urine_color", "coffee", "alcohol", "meal_drinks"]),
    ("Alimentação", ["frequency"]),
    ("Diário alimentar", ["meals"]),
    ("Diário alimentar", ["protein_portion", "carb_portion"]),
    ("Mudanças", ["alternatives", "motivation"]),
    ("Suplementação", ["supplements", "supplements_info", "athlete"]),
    ("Dia de jogo", ["day_before_change", "day_before_what", "game_day_change", "game_day_what"]),
    ("Dia de jogo", ["before_game", "during_game"]),
    ("Notas", ["notes", "consent"]),
]
_SECTION_WHEN = {"Saúde feminina": {"sex": "F"}, "Dia de jogo": {"athlete": "yes"}}


def _screens():
    out, used = [], []
    for i, (group, ids) in enumerate(LAYOUT):
        fields = []
        for fid in ids:
            fields.append(FIELDS[fid])
            if fid + "_other" in FIELDS:
                fields.append(FIELDS[fid + "_other"])
        used += [f["id"] for f in fields]
        step = {"id": "s%d" % i, "group": group, "title": group, "fields": fields}
        if group in _SECTION_WHEN:
            step["when"] = _SECTION_WHEN[group]
        out.append(step)
    assert sorted(used) == sorted(FIELDS), "todas as perguntas têm de estar num ecrã"
    return out


STEPS = _screens()
CARE_FIELDS = ("allergies", "intolerances", "medication", "conditions")
# Respostas de versões anteriores do formulário: guardam-se e mostram-se, mas já não se perguntam.
LEGACY_TEXT = {"supplements_detail": "Marca e dose"}


def initialize(c):
    c.executescript("""
    CREATE TABLE IF NOT EXISTS consult_forms (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','submitted')),
        answers_json TEXT NOT NULL DEFAULT '{}',
        step INTEGER NOT NULL DEFAULT 0,
        consent_at BIGINT,
        submitted_at BIGINT,
        expires_at BIGINT NOT NULL,
        created_by TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        UNIQUE(org_id, client_id)
    );
    """)
    # Anamnese editada pela equipa: que perguntas foram preenchidas/alteradas no backoffice.
    cols = clients._columns(c, "consult_forms")
    if "team_fields_json" not in cols:
        c.execute("ALTER TABLE consult_forms ADD COLUMN team_fields_json TEXT NOT NULL DEFAULT '[]'")
    if "team_updated_by" not in cols:
        c.execute("ALTER TABLE consult_forms ADD COLUMN team_updated_by TEXT")
    if "team_updated_at" not in cols:
        c.execute("ALTER TABLE consult_forms ADD COLUMN team_updated_at BIGINT")


def public_base():
    return os.environ.get("MILE_FORM_PUBLIC_URL", "https://themile.pt/apps/the-mile-booking/formulario").rstrip("/")


def _link(token):
    return public_base() + "?t=" + token


# ---------- backoffice ----------

def ensure(c, client_id, actor, org_id=ORG_ID, now=None):
    """Devolve o formulário do cliente, criando-o (e o link) se ainda não existir."""
    now = now or int(time.time())
    clients._row(c, client_id, org_id)
    row = c.execute("SELECT * FROM consult_forms WHERE org_id=? AND client_id=?", (org_id, client_id)).fetchone()
    if not row:
        c.execute("""INSERT INTO consult_forms
            (id,org_id,client_id,token,expires_at,created_by,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(org_id,client_id) DO NOTHING""",
                  (uuid.uuid4().hex, org_id, client_id, secrets.token_urlsafe(32),
                   now + LINK_DAYS * 86400, actor, now, now))
    elif row["status"] == "pending" and row["expires_at"] < now:
        c.execute("UPDATE consult_forms SET expires_at=?,updated_at=? WHERE id=?",
                  (now + LINK_DAYS * 86400, now, row["id"]))
    return for_client(c, client_id, org_id)


def for_client(c, client_id, org_id=ORG_ID):
    """Estado e respostas do formulário deste cliente (ou None)."""
    row = c.execute("SELECT * FROM consult_forms WHERE org_id=? AND client_id=?", (org_id, client_id)).fetchone()
    if not row:
        return None
    answers = json.loads(row["answers_json"] or "{}")
    team = json.loads(row["team_fields_json"] or "[]")
    sections = readable(answers)
    for sec in sections:
        for r in sec["rows"]:
            if (r.get("key") or "").split(".")[0] in team:
                r["team"] = True
    return {"status": row["status"], "link": _link(row["token"]), "submitted_at": row["submitted_at"],
            "updated_at": row["updated_at"], "answers": answers, "team_fields": team,
            "team_updated_at": row["team_updated_at"], "has_answers": bool(answers),
            "sections": sections, "care": care(answers), "summary": summary(answers)}


def summary(answers):
    """Resumo da anamnese por tema (o essencial de cada secção, em frases curtas)."""
    rows = {}
    for sec in readable(answers):
        for r in sec["rows"]:
            if r["type"] == "text":
                rows[r["key"]] = r["value"]
    def v(key):
        return rows.get(key, "")
    def item(label, value):
        return {"label": label, "value": value} if value else None
    groups = []
    def add(title, items):
        items = [i for i in items if i]
        if items:
            groups.append({"title": title, "items": items})
    motivation = answers.get("motivation")
    add("Objetivos", [item("Objetivos", v("goals")),
                      item("Motivação para mudar", f"{motivation}/10" if motivation not in (None, "") else ""),
                      item("Acompanhamento anterior", v("previous_nutrition"))])
    body_line = " · ".join(x for x in (v("height_cm"), v("weight_kg")) if x)
    sleep = " · ".join(x for x in (v("sleep_hours"), ("qualidade " + str(answers["sleep_quality"]) + "/5") if answers.get("sleep_quality") else "") if x)
    add("Saúde", [item("Altura e peso", body_line), item("Patologias", v("conditions")), item("Medicação", v("medication")),
                  item("Alergias", v("allergies")), item("Intolerâncias", v("intolerances")),
                  item("Fuma", v("smoking") if answers.get("smoking") not in (None, "no") else ""),
                  item("Sono", sleep), item("Pesa-se diariamente", v("weighs_daily"))])
    if answers.get("sex") == "F":
        cycle = v("cycle") + (" — " + v("amenorrhea_since") if v("amenorrhea_since") else "")
        pill = v("pill_which") or v("pill")
        add("Saúde feminina", [item("Ciclo", cycle), item("Pílula", pill), item("Sintomas no período", v("cycle_symptoms")),
                               item("Sintomas pré-menstruais", v("pms")), item("Fluxo intenso", v("heavy_flow"))])
    add("Treino", [item("Atividade", v("activity")), item("Desportos", v("sports")), item("Nível", v("sport_level")),
                   item("Semana de treino", v("weekly_routine")), item("Monitorização", v("devices"))])
    freq = answers.get("frequency") or {}
    f = FIELDS["frequency"]
    labels = {k: lab for k, lab, _, _ in f["rows"]}
    daily = [labels[k] for k, val in freq.items() if str(val).startswith("x") or val == "daily"]
    never = [labels[k] for k, val in freq.items() if val == "never"]
    add("Alimentação", [item("Padrão alimentar", v("diet_pattern")), item("Faz as compras", v("shopping")), item("Cozinha", v("cooking")),
                        item("Pesa a comida", v("weighs_food")), item("Água", v("water")), item("Cafés por dia", v("coffee")),
                        item("Álcool por semana", v("alcohol")), item("Todos os dias", ", ".join(daily)),
                        item("Nunca", ", ".join(never)), item("Às refeições bebe", v("meal_drinks")),
                        item("Não gosta de", v("disliked_foods"))])
    meals = answers.get("meals") or {}
    meal_labels = dict(FIELDS["meals"]["rows"])
    add("Dia alimentar", [item("Refeições", ", ".join(meal_labels[k] for k in meal_labels if k in meals)),
                          item("Porções", " · ".join(x for x in (("proteína " + v("protein_portion")) if v("protein_portion") else "",
                                                                 ("hidratos " + v("carb_portion")) if v("carb_portion") else "") if x))])
    sup_parts = []
    for key in [k.split(".", 1)[1] for k in rows if k.startswith("supplements_info.")]:
        name = (answers.get("supplements_other") or "Outro") if key == "other" else _option_label("supplements", key)
        detail = rows["supplements_info." + key]
        sup_parts.append(name + (" (" + detail + ")" if detail != "—" else ""))
    sup_text = "; ".join(sup_parts) or ("Não toma" if answers.get("supplements") == ["none"] else "")
    add("Suplementação", [item("Suplementos", sup_text), item("Jogos ou competições", v("athlete"))])
    add("Notas do cliente", [item("Notas", v("notes"))])
    return groups


def anamnesis(c, client_id, org_id=ORG_ID):
    """Anamnese para editar no backoffice: perguntas (por secção) e respostas atuais."""
    clients._row(c, client_id, org_id)
    return {"steps": SECTIONS, "form": for_client(c, client_id, org_id)}


def save_anamnesis(c, client_id, payload, actor, org_id=ORG_ID, now=None):
    """A equipa preenche ou corrige a anamnese (sem obrigatórias nem consentimento)."""
    now = now or int(time.time())
    if not isinstance(payload, dict):
        raise ValueError("invalid_request")
    answers = clean_answers(payload.get("answers") or {})
    ensure(c, client_id, actor, org_id, now)
    row = c.execute("SELECT * FROM consult_forms WHERE org_id=? AND client_id=?", (org_id, client_id)).fetchone()
    previous = json.loads(row["answers_json"] or "{}")
    for legacy in LEGACY_TEXT:
        if legacy in previous and legacy not in answers:
            answers[legacy] = previous[legacy]
    if answers.get("consent") is None and previous.get("consent"):
        answers["consent"] = True
    changed = {k for k in set(previous) | set(answers) if previous.get(k) != answers.get(k)}
    team = sorted(set(json.loads(row["team_fields_json"] or "[]")) | changed)
    c.execute("""UPDATE consult_forms SET answers_json=?,team_fields_json=?,team_updated_by=?,team_updated_at=?,
        updated_at=? WHERE id=?""", (json.dumps(answers, ensure_ascii=False, sort_keys=True), json.dumps(team),
                                     actor, now, now, row["id"]))
    _fill_profile(c, row, answers, now)
    return for_client(c, client_id, org_id)


def care(answers):
    """O que entra em «A ter em conta»: alergias, intolerâncias, medicação e patologias."""
    out = []
    for key in CARE_FIELDS:
        value = (answers.get(key) or "").strip()
        if value:
            out.append({"label": FIELDS[key].get("short", FIELDS[key]["label"]), "value": value})
    return out


def _option_label(field_id, value):
    for key, label in FIELDS[field_id].get("options", []):
        if key == value:
            return label
    return value


def _matches(answer, value):
    if isinstance(answer, list):
        return value in answer
    return answer == value


def _visible(item, answers):
    when = item.get("when") or {}
    if not all(_matches(answers.get(k), v) for k, v in when.items()):
        return False
    for k, hidden in (item.get("when_not") or {}).items():
        if answers.get(k) in hidden:
            return False
    return True


def _with_other(f, answers, labels):
    other = (answers.get(f["id"] + "_other") or "").strip()
    return [("Outra: " + other if other else "Outra") if lab == "Outra" else lab for lab in labels]


def readable(answers):
    """Respostas organizadas por secção do Google Forms, prontas a mostrar (rótulos em vez de códigos)."""
    sections = []
    for step in SECTIONS:
        if not _visible(step, answers):
            continue
        rows = []
        for f in step["fields"]:
            if not _visible(f, answers) or f["type"] == "check" or f.get("other_of"):
                continue
            value = answers.get(f["id"])
            short = f.get("short", f["label"])
            if f["type"] == "freq":
                grid = value if isinstance(value, dict) else {}
                for key, label, _hint, options in f["rows"]:
                    if grid.get(key):
                        text = dict((k, v) for k, v in options).get(grid[key], grid[key])
                        rows.append({"type": "text", "key": f["id"] + "." + key, "label": label, "value": text})
                continue
            if f["type"] == "meals":
                meals = value if isinstance(value, dict) else {}
                items = []
                for k, lab in f["rows"]:
                    m = meals.get(k) or {}
                    if m.get("time") or m.get("text") or m.get("qty") or m.get("on"):
                        items.append({"key": k, "label": lab, "time": m.get("time", ""), "text": m.get("text", ""),
                                      "qty": m.get("qty", "")})
                rows.append({"type": "meals", "label": f["label"], "items": items})
                continue
            if f["type"] == "details":
                info = value if isinstance(value, dict) else {}
                for key in answers.get(f["of"]) or []:
                    if key == "none":
                        continue
                    name = _option_label(f["of"], key)
                    if key == "other":
                        name = (answers.get(f["of"] + "_other") or "Outro").strip()
                    parts = [info.get(key, {}).get(c, "") for c, _ in f["columns"]]
                    text = " · ".join(p for p in parts if p) or "—"
                    rows.append({"type": "text", "key": f["id"] + "." + key, "label": name, "value": text})
                for legacy, label in LEGACY_TEXT.items():
                    if answers.get(legacy):
                        rows.append({"type": "text", "key": legacy, "label": label, "value": answers[legacy]})
                continue
            if value in (None, "", []):
                continue
            if f["type"] == "choice":
                text = _with_other(f, answers, [_option_label(f["id"], value)])[0]
                if f.get("unit"):
                    text += " " + f["unit"]
            elif f["type"] == "multi":
                text = " · ".join(_with_other(f, answers, [_option_label(f["id"], v) for v in value]))
            elif f["type"] == "number":
                text = ("%g" % value).replace(".", ",") + (" " + f["unit"] if f.get("unit") else "")
            elif f["type"] == "date":
                try:
                    text = date.fromisoformat(value).strftime("%d/%m/%Y")
                except ValueError:
                    text = value
            else:
                text = value
            rows.append({"type": "text", "key": f["id"], "label": short, "value": text})
        sections.append({"id": step["id"], "title": step["title"], "rows": rows})
    return sections


# ---------- página pública ----------

def _by_token(c, token, now):
    if not isinstance(token, str) or not TOKEN_RE.match(token):
        raise LookupError("form_not_found")
    row = c.execute("SELECT * FROM consult_forms WHERE token=?", (token,)).fetchone()
    if not row or row["expires_at"] < now:
        raise LookupError("form_not_found")
    return row


def _next_booking(c, row, today):
    import consult_sessions_v2 as sessions
    items = sorted(sessions._linked_bookings(c, row["org_id"], row["client_id"]),
                   key=lambda b: (b["day"], b["start_minute"]))
    upcoming = [b for b in items if b["day"] >= today] or items[-1:]
    if not upcoming:
        return None
    b = upcoming[0]
    return {"date": b["day"], "start": sessions._hhmm(b["start_minute"]), "mode": b["mode"],
            "service": b["service_name"], "professional": b["professional_name"]}


def public_view(c, token, now=None, today=None):
    now = now or int(time.time())
    row = _by_token(c, token, now)
    client = c.execute("SELECT name FROM consult_clients WHERE org_id=? AND id=?",
                       (row["org_id"], row["client_id"])).fetchone()
    first = ((client["name"] if client else "") or "").split(" ")[0]
    return {"first_name": first, "status": row["status"], "step": row["step"], "portions": portion_photos(c),
            "answers": json.loads(row["answers_json"] or "{}"),
            "booking": _next_booking(c, row, today or date.today().isoformat()),
            "steps": STEPS}


def portion_photos(c):
    """Fotografias da biblioteca Porções visuais para as perguntas de porções: {campo: {gramas: id}}."""
    out = {}
    for f in FIELDS.values():
        if not f.get("photos"):
            continue
        grams = {int(k) for k, _ in f["options"]}
        rows = c.execute("""SELECT id,total_g FROM v2_visual_portions WHERE category=? AND active=1
            ORDER BY total_g,source_row""", (f["photos"],)).fetchall()
        photos = {}
        for r in rows:
            if r["total_g"] in grams and str(r["total_g"]) not in photos:
                photos[str(r["total_g"])] = r["id"]
        out[f["id"]] = photos
    return out


def portion_image(c, token, image_id, now=None):
    """Só serve fotografias usadas no formulário e só com um link válido."""
    _by_token(c, token, now or int(time.time()))
    allowed = {i for photos in portion_photos(c).values() for i in photos.values()}
    if image_id not in allowed:
        raise LookupError("photo_not_found")
    import visual_portions_v2
    data = visual_portions_v2.get_image(c, image_id)
    if not data:
        raise LookupError("photo_not_found")
    return data


def _clean_value(f, value):
    kind = f["type"]
    if value in (None, ""):
        return None
    if kind in ("text", "textarea"):
        if not isinstance(value, str):
            raise ValueError("invalid_" + f["id"])
        value = value.strip() if kind == "textarea" else " ".join(value.split())
        if len(value) > f.get("max", 500):
            raise ValueError("invalid_" + f["id"])
        return value or None
    if kind == "choice":
        if value not in [k for k, _ in f["options"]]:
            raise ValueError("invalid_" + f["id"])
        return value
    if kind == "multi":
        keys = [k for k, _ in f["options"]]
        if not isinstance(value, list) or len(value) > len(keys) or any(v not in keys for v in value):
            raise ValueError("invalid_" + f["id"])
        out = [k for k in keys if k in value]
        return out or None
    if kind == "freq":
        if not isinstance(value, dict):
            raise ValueError("invalid_" + f["id"])
        rows = {k: {o for o, _ in opts} for k, _, _, opts in f["rows"]}
        out = {}
        for k, v in value.items():
            if k not in rows or (v and v not in rows[k]):
                raise ValueError("invalid_" + f["id"])
            if v:
                out[k] = v
        return out or None
    if kind == "details":
        if not isinstance(value, dict):
            raise ValueError("invalid_" + f["id"])
        keys = {k for k, _ in FIELDS[f["of"]]["options"]} - {"none"}
        cols = {k for k, _ in f["columns"]}
        out = {}
        for k, row in value.items():
            if k not in keys or not isinstance(row, dict) or any(c not in cols for c in row):
                raise ValueError("invalid_" + f["id"])
            clean = {}
            for c, v in row.items():
                if not isinstance(v, str) or len(v) > 120:
                    raise ValueError("invalid_" + f["id"])
                if v.strip():
                    clean[c] = " ".join(v.split())
            if clean:
                out[k] = clean
        return out or None
    if kind == "check":
        if value is not True:
            raise ValueError("invalid_" + f["id"])
        return True
    if kind == "date":
        try:
            parsed = date.fromisoformat(value) if isinstance(value, str) and len(value) == 10 else None
        except ValueError:
            parsed = None
        if not parsed or parsed.year < 1900 or parsed > date.today():
            raise ValueError("invalid_" + f["id"])
        return parsed.isoformat()
    if kind == "number":
        if isinstance(value, bool):
            raise ValueError("invalid_" + f["id"])
        try:
            number = float(str(value).replace(",", "."))
        except ValueError:
            raise ValueError("invalid_" + f["id"])
        if not (f["min"] <= number <= f["max"]):
            raise ValueError("invalid_" + f["id"])
        return round(number, 1)
    if kind == "meals":
        if not isinstance(value, dict):
            raise ValueError("invalid_" + f["id"])
        keys = {k for k, _ in f["rows"]}
        out = {}
        for k, v in value.items():
            if k not in keys or not isinstance(v, dict):
                raise ValueError("invalid_" + f["id"])
            t = v.get("time") or ""
            text = v.get("text") or ""
            qty = v.get("qty") or ""
            if not isinstance(t, str) or (t and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", t)):
                raise ValueError("invalid_" + f["id"])
            if not isinstance(text, str) or len(text) > 600 or not isinstance(qty, str) or len(qty) > 300:
                raise ValueError("invalid_" + f["id"])
            if any(x not in ("time", "text", "qty", "on") for x in v):
                raise ValueError("invalid_" + f["id"])
            if t or text.strip() or qty.strip() or v.get("on") is True:
                out[k] = {"time": t, "text": text.strip(), "qty": qty.strip(), "on": True}
        return out or None
    raise ValueError("invalid_" + f["id"])


def clean_answers(payload):
    if not isinstance(payload, dict):
        raise ValueError("invalid_answers")
    out = {}
    for key, value in payload.items():
        if key in LEGACY_TEXT:
            if isinstance(value, str) and value.strip() and len(value) <= 2000:
                out[key] = value.strip()
            continue
        f = FIELDS.get(key)
        if not f:
            raise ValueError("invalid_answers")
        cleaned = _clean_value(f, value)
        if cleaned is not None:
            out[key] = cleaned
    if len(json.dumps(out, ensure_ascii=False)) > ANSWERS_LIMIT:
        raise ValueError("answers_too_large")
    return out


def missing(answers):
    """Perguntas obrigatórias por responder (só as visíveis)."""
    out = []
    for step in STEPS:
        if not _visible(step, answers):
            continue
        for f in step["fields"]:
            if not (f.get("required") and _visible(f, answers)):
                continue
            value = answers.get(f["id"])
            if f["type"] == "freq":
                if any(not (value or {}).get(k) for k, _, _, _ in f["rows"]):
                    out.append(f["id"])
            elif value in (None, "", {}, []):
                out.append(f["id"])
    return out


def save(c, token, payload, now=None):
    """Guardado automático (rascunho ou alterações depois de enviado)."""
    now = now or int(time.time())
    row = _by_token(c, token, now)
    if not isinstance(payload, dict):
        raise ValueError("invalid_request")
    answers = clean_answers(payload.get("answers") or {})
    previous = json.loads(row["answers_json"] or "{}")
    for legacy in LEGACY_TEXT:
        if legacy in previous and legacy not in answers:
            answers[legacy] = previous[legacy]
    step = payload.get("step", row["step"])
    if type(step) is not int or not (0 <= step < len(STEPS)):
        step = row["step"]
    consent_at = row["consent_at"]
    if answers.get("consent") and not consent_at:
        consent_at = now
    if not answers.get("consent"):
        consent_at = None
        if row["status"] == "submitted":
            raise ValueError("consent_required")
    c.execute("""UPDATE consult_forms SET answers_json=?,step=?,consent_at=?,updated_at=? WHERE id=?""",
              (json.dumps(answers, ensure_ascii=False, sort_keys=True), step, consent_at, now, row["id"]))
    return {"ok": True, "missing": missing(answers)}


def submit(c, token, payload, now=None):
    now = now or int(time.time())
    save(c, token, payload, now)
    row = _by_token(c, token, now)
    answers = json.loads(row["answers_json"] or "{}")
    gaps = missing(answers)
    if gaps:
        raise ValueError("missing:" + ",".join(gaps))
    first = row["status"] != "submitted"
    c.execute("UPDATE consult_forms SET status='submitted',submitted_at=COALESCE(submitted_at,?),updated_at=? WHERE id=?",
              (now, now, row["id"]))
    _fill_profile(c, row, answers, now)
    if first:
        clients._audit(c, row["org_id"], row["client_id"], None, "form_submitted", {}, now)
    return {"ok": True}


def _fill_profile(c, row, answers, now):
    """Só preenche o que está vazio no perfil; nunca substitui o que a equipa registou."""
    profile = c.execute("SELECT birth_date,sex,height_cm FROM consult_clients WHERE org_id=? AND id=?",
                        (row["org_id"], row["client_id"])).fetchone()
    if not profile:
        return
    changes = {}
    if not profile["birth_date"] and answers.get("birth_date"):
        changes["birth_date"] = answers["birth_date"]
    if not profile["sex"] and answers.get("sex") in ("F", "M"):
        changes["sex"] = answers["sex"]
    if not profile["height_cm"] and answers.get("height_cm"):
        changes["height_cm"] = answers["height_cm"]
    if not changes:
        return
    sets = ",".join(f"{k}=?" for k in changes)
    c.execute(f"UPDATE consult_clients SET {sets},version=version+1,updated_at=? WHERE org_id=? AND id=?",
              (*changes.values(), now, row["org_id"], row["client_id"]))
    clients._audit(c, row["org_id"], row["client_id"], None, "updated_from_form",
                   {"fields": sorted(changes)}, now)
