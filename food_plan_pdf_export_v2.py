"""PDF export of the saved backoffice meal-plan editor; read-only and admin-only at route."""
from io import BytesIO
import unicodedata
import re
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

KEYS = ("kcal", "protein_g", "carbs_g", "fat_g")
ACCENTS = {"Plano laranja": "#D88744", "Plano amarelo": "#C99F31",
           "Plano azul": "#528BB8", "Plano verde": "#56A77F",
           "Plano verde preparação": "#56A77F"}


def _text(value):
    return escape(str(value if value is not None else "")).replace("\n", "<br/>")


def _nutrition(item, ref):
    if item.get("kind") == "supplement" or item.get("grams") is None or not ref:
        return None
    factor = float(item["grams"]) / 100.0
    if ref.get("variant") == "gross":
        factor *= float(ref.get("edible_fraction") or 1)
    return [float(ref[key] or 0) * factor for key in KEYS]


def _option_average(option, library):
    """Use the same alternative-group averaging rule as static/create-plan.js."""
    foods = option.get("foods") or []
    totals = [0.0] * len(KEYS)
    for index, food in enumerate(foods):
        if food.get("alternative_to") is not None:
            continue
        group = [food] + [f for f in foods if f.get("alternative_to") == index]
        complete = [f for f in group if f.get("grams") is not None]
        chosen = complete if complete else [food]
        vectors = [_nutrition(f, library.get(f.get("id"))) for f in chosen]
        vectors = [v for v in vectors if v is not None]
        if vectors:
            for i in range(len(KEYS)):
                totals[i] += sum(v[i] for v in vectors)/len(vectors)
    return totals



def _meal_slots(meal):
    slots = meal.get("applies_to")
    if isinstance(slots, list) and slots:
        return [str(slot) for slot in slots]
    name = str(meal.get("name") or "Refeição")
    normalized = unicodedata.normalize("NFD", name.lower())
    normalized = " ".join("".join(c for c in normalized if unicodedata.category(c) != "Mn").split())
    if "intermedia" in normalized or ("pequeno almoco" in normalized and "lanche" in normalized):
        return ["Pequeno almoço", "Lanche"]
    if "principal" in normalized or ("almoco" in normalized and "jantar" in normalized):
        return ["Almoço", "Jantar"]
    return [name]


def _selected_meals(meals, keys):
    available = [(f"{mi}:{si}", slot, meal)
                 for mi, meal in enumerate(meals)
                 for si, slot in enumerate(_meal_slots(meal))]
    if keys is not None:
        selected = set(keys)
        if not selected or len(selected) != len(keys) or not selected.issubset({row[0] for row in available}):
            raise ValueError("invalid_meals")
        available = [row for row in available if row[0] in selected]
    order = {"pequeno almoco": 0, "almoco": 1, "lanche": 2, "jantar": 3, "ceia": 4}
    def rank(row):
        norm = unicodedata.normalize("NFD", row[1].lower())
        norm = " ".join("".join(c for c in norm if unicodedata.category(c) != "Mn").split())
        return order.get(norm, 5)
    return sorted(available, key=rank)

def render_editor_pdf(c, plan, selected_meal_keys=None):
    """Export the stored content; never modify draft, publication, or athlete rows."""
    meals = plan.get("meals")
    if not isinstance(meals, list) or not meals:
        raise ValueError("empty_plan")
    chosen_meals = _selected_meals(meals, selected_meal_keys)
    identifiers = {f.get("id") for meal in meals for option in meal.get("options", [])
                   for f in option.get("foods", []) if f.get("kind","food")=="food" and f.get("id")}
    library = {}
    for fid in identifiers:
        row = c.execute("SELECT id,display_name,variant,edible_fraction,kcal,protein_g,carbs_g,fat_g FROM v2_food_library WHERE id=?", (fid,)).fetchone()
        if row: library[fid] = dict(row)
    if len(library) != len(identifiers):
        raise ValueError("missing_food_reference")

    out = BytesIO()
    doc = SimpleDocTemplate(out,pagesize=A4,leftMargin=17*mm,rightMargin=17*mm,
                            topMargin=21*mm,bottomMargin=19*mm,
                            title="Plano alimentar - The Mile",author="The Mile")
    regular = ParagraphStyle("body",fontName="Helvetica",fontSize=8.6,leading=12,
                             textColor=colors.HexColor("#242831"),spaceAfter=4)
    muted = ParagraphStyle("muted",parent=regular,fontSize=7.5,leading=10.5,
                           textColor=colors.HexColor("#646970"))
    big = ParagraphStyle("big",parent=regular,fontName="Helvetica-Bold",fontSize=19,leading=24)
    sect = ParagraphStyle("section",parent=regular,fontName="Helvetica-Bold",fontSize=12,leading=16,
                           spaceBefore=12,spaceAfter=7,
                           textColor=colors.HexColor(ACCENTS.get(plan.get("plan_type"),"#3B4148")))
    opt = ParagraphStyle("option",parent=regular,fontName="Helvetica-Bold",fontSize=9,leading=13)
    right = ParagraphStyle("right",parent=muted,alignment=TA_RIGHT)
    cw=A4[0]-34*mm
    widths=[cw*.115,cw*.49,cw*.099,cw*.099,cw*.099,cw*.098]
    story=[Paragraph("THE MILE",muted),Spacer(1,5*mm),
           Paragraph("Plano alimentar",big),Spacer(1,2*mm),
           Paragraph(_text(plan.get("player_name") or "Jogador"),regular),
           Paragraph(_text(plan.get("plan_type") or plan.get("name") or ""),muted),
           Spacer(1,6*mm)]
    daily = [0.0] * len(KEYS)
    for _, _, meal in chosen_meals:
        options = meal.get("options") or []
        if not options:
            continue
        option_values = [_option_average(option, library) for option in options]
        for i in range(len(KEYS)):
            daily[i] += sum(values[i] for values in option_values) / len(option_values)
    story.append(Paragraph("Resumo diário de referência",sect))
    story.append(Paragraph(
        f"{daily[0]:.0f} kcal  |  P {daily[1]:.1f} g  |  HC {daily[2]:.1f} g  |  G {daily[3]:.1f} g", regular))
    story.append(Paragraph("Estimativa: média das opções por refeição selecionada.",muted))
    story.append(Spacer(1,4*mm))
    for _, meal_name, meal in chosen_meals:
        story.append(Paragraph(_text(meal_name.replace("Pequeno almoço","Pequeno-almoço")),sect))
        for oi, option in enumerate(meal.get("options") or []):
            story.append(Paragraph("Opção "+str(oi+1)+(" · "+_text(option.get("title")) if option.get("title") else ""),opt))
            rows=[[Paragraph("Qtd.",muted),Paragraph("Alimento / notas",muted),
                   *[Paragraph(s,right) for s in ("kcal","P (g)","HC (g)","G (g)")]]]
            foods=option.get("foods") or []
            notes=option.get("notes") or []
            ordered=option.get("order") or ([{"type":"note","index":i} for i in range(len(notes))]+
                                            [{"type":"food","index":i} for i in range(len(foods))])
            for position in ordered:
                try:
                    idx=position["index"];kind=position["type"]
                    if kind=="note":
                        note=notes[idx]
                        rows.append(["",Paragraph(_text(note),muted),"","","",""])
                        continue
                    if kind!="food":continue
                    food=foods[idx]
                except (KeyError,IndexError,TypeError):
                    continue
                ref=library.get(food.get("id"))
                quantity=food.get("display_quantity") or (
                    (("%g" % food["grams"])+" g") if food.get("grams") is not None else "Por definir")
                if food.get("grams")==0: quantity="0 g"
                label=food.get("display_name") or food.get("label") or (ref or {}).get("display_name") or "Alimento"
                if food.get("alternative_to") is not None:label="Ou "+label
                metrics=_nutrition(food,ref)
                cells=[Paragraph(_text(quantity),muted),Paragraph(_text(label),regular)]
                cells.extend([Paragraph(("%.0f" if i==0 else "%.1f")%v,right) if metrics else Paragraph("-",right)
                              for i,v in enumerate(metrics or [0,0,0,0])])
                rows.append(cells)
            totals=_option_average(option,library)
            rows.append(["",Paragraph("Total médio da opção",opt),
                         *[Paragraph(("%.0f" if i==0 else "%.1f")%v,right) for i,v in enumerate(totals)]])
            table=Table(rows,colWidths=widths,repeatRows=1,hAlign="LEFT",splitByRow=1)
            table.setStyle(TableStyle([
                ("VALIGN",(0,0),(-1,-1),"TOP"),
                ("LEFTPADDING",(0,0),(-1,-1),4),
                ("RIGHTPADDING",(0,0),(-1,-1),4),
                ("TOPPADDING",(0,0),(-1,-1),4),
                ("BOTTOMPADDING",(0,0),(-1,-1),4),
                ("BACKGROUND",(0,0),(-1,0),colors.HexColor("#F0F1F2")),
                ("LINEBELOW",(0,0),(-1,0),.45,colors.HexColor("#DDE0E3")),
                ("LINEBELOW",(0,1),(-1,-1),.25,colors.HexColor("#E6E8E9")),
            ]))
            story.extend([table,Spacer(1,4*mm)])
    def footer(canvas, document):
        canvas.saveState()
        canvas.setFont("Helvetica",8)
        canvas.setFillColor(colors.HexColor("#858B90"))
        canvas.drawString(17*mm,11*mm,"www.themile.pt")
        canvas.drawRightString(A4[0]-17*mm,11*mm,str(document.page))
        canvas.restoreState()
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    return out.getvalue()
