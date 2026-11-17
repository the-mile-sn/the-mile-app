"""The Mile saved-plan PDF: branded cover, daily summary and pagination-safe options."""
from io import BytesIO
from pathlib import Path
import unicodedata
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, Flowable
)

KEYS = ("kcal", "protein_g", "carbs_g", "fat_g")
ACCENTS = {
    "Plano laranja": "#D88744", "Plano amarelo": "#C99F31",
    "Plano azul": "#528BB8", "Plano verde": "#56A77F",
    "Plano verde preparação": "#56A77F"
}
NUTRIENT_COLORS = ("#6EAC81", "#70A9D8", "#E2A65C", "#D6C168")
INK = "#242831"
MUTED = "#737780"
LOGO_PATH = Path(__file__).resolve().parent / "static" / "logo-black.png"


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
    """Same alternative-group averaging as the Planos backoffice."""
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
                totals[i] += sum(v[i] for v in vectors) / len(vectors)
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
        normalized = unicodedata.normalize("NFD", row[1].lower())
        normalized = " ".join("".join(c for c in normalized if unicodedata.category(c) != "Mn").split())
        return order.get(normalized, 5)
    return sorted(available, key=rank)


def _amount(i, amount):
    return ("%.0f" if i == 0 else "%.1f") % amount


def _style(name, size, leading, color=INK, bold=False, space_before=0, space_after=0,
           alignment=0, keep_next=False):
    return ParagraphStyle(name, fontName="Helvetica-Bold" if bold else "Helvetica",
                          fontSize=size, leading=leading, textColor=colors.HexColor(color),
                          spaceBefore=space_before, spaceAfter=space_after,
                          alignment=alignment, keepWithNext=keep_next)


def _draw_cover(canvas, doc, plan):
    """A4 editorial cover; always embed the genuine brand asset."""
    canvas.saveState()
    canvas.setTitle("Plano alimentar - The Mile")
    canvas.setFillColor(colors.HexColor("#939397"))
    canvas.setFont("Helvetica-Bold", 33)
    x = 23 * mm
    y = A4[1] - 75 * mm
    canvas.drawString(x, y, "Plano alimentar")
    canvas.setFillColor(colors.HexColor("#111318"))
    player = str(plan.get("player_name") or "Jogador")
    font_size = 33
    max_width = A4[0] - 46 * mm
    while stringWidth(player, "Helvetica-Bold", font_size) > max_width and font_size > 19:
        font_size -= 1
    canvas.setFont("Helvetica-Bold", font_size)
    canvas.drawString(x, y - 18 * mm, player)

    label = str(plan.get("plan_type") or "").lower()
    if "amarelo" in label:
        hue, lit = "#C99F31", 2
    elif "laranja" in label:
        hue, lit = "#D88744", 3
    elif "verde" in label:
        hue, lit = "#56A77F", 1
    elif "azul" in label:
        hue, lit = "#528BB8", 2
    else:
        hue, lit = "#939397", 2
    sy = y - 46 * mm
    for i in range(3):
        canvas.setFillColor(colors.HexColor(hue) if i < lit else colors.HexColor("#ECEDEF"))
        canvas.roundRect(x, sy - i * 5.5 * mm, 21 * mm, 3 * mm, 1.5 * mm, fill=1, stroke=0)

    if not LOGO_PATH.is_file():
        raise ValueError("missing_original_the_mile_logo")
    logo = ImageReader(str(LOGO_PATH))
    lw, lh = logo.getSize()
    max_w, max_h = 62 * mm, 28 * mm
    scale = min(max_w / lw, max_h / lh)
    w, h = lw * scale, lh * scale
    canvas.drawImage(logo, (A4[0] - w) / 2, 25 * mm, w, h, mask="auto")
    canvas.restoreState()


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#E7E8EA"))
    canvas.setLineWidth(0.5)
    canvas.line(17 * mm, 16.5 * mm, A4[0] - 17 * mm, 16.5 * mm)
    canvas.setFillColor(colors.HexColor("#868A91"))
    canvas.setFont("Helvetica", 8)
    canvas.drawString(17 * mm, 11 * mm, "www.themile.pt")
    canvas.drawRightString(A4[0] - 17 * mm, 11 * mm, str(doc.page))
    canvas.restoreState()


class MacroPills(Flowable):
    """Four nutritional labels above each option title."""
    def __init__(self, values, available_width):
        Flowable.__init__(self)
        self.values = values
        self.width = available_width
        self.height = 33
        self.hAlign = "LEFT"

    def draw(self):
        labels = [
            _amount(0, self.values[0]) + " kcal",
            _amount(1, self.values[1]) + " g P",
            _amount(2, self.values[2]) + " g HC",
            _amount(3, self.values[3]) + " g G",
        ]
        backgrounds = ("#EAF4EC", "#EAF2FA", "#FFF1E5", "#FBF7DE")
        widths = [stringWidth(label, "Helvetica-Bold", 9.3) + 19 for label in labels]
        spacing = 7
        x = self.width - (sum(widths) + spacing * 3)
        c = self.canv
        for label, w, fg, fill in zip(labels, widths, NUTRIENT_COLORS, backgrounds):
            c.setFillColor(colors.HexColor(fill))
            c.roundRect(x, 9, w, 22, 10, fill=1, stroke=0)
            c.setFillColor(colors.HexColor(fg))
            c.setFont("Helvetica-Bold", 9.3)
            c.drawCentredString(x + w/2, 16, label)
            x += w + spacing


def render_editor_pdf(c, plan, selected_meal_keys=None):
    """Read-only PDF export; shares the same saved data and meal selection as backoffice."""
    meals = plan.get("meals")
    if not isinstance(meals, list) or not meals:
        raise ValueError("empty_plan")
    chosen_meals = _selected_meals(meals, selected_meal_keys)
    identifiers = {f.get("id") for meal in meals for option in meal.get("options", [])
                   for f in option.get("foods", [])
                   if f.get("kind", "food") == "food" and f.get("id")}
    library = {}
    for fid in identifiers:
        row = c.execute("SELECT id,display_name,variant,edible_fraction,kcal,protein_g,carbs_g,fat_g "
                        "FROM v2_food_library WHERE id=?", (fid,)).fetchone()
        if row:
            library[fid] = dict(row)
    if len(library) != len(identifiers):
        raise ValueError("missing_food_reference")

    out = BytesIO()
    doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=17*mm, rightMargin=17*mm,
                            topMargin=21*mm, bottomMargin=20*mm,
                            title="Plano alimentar - The Mile", author="The Mile")
    regular = _style("food", 8.6, 12, space_after=0)
    muted = _style("muted", 8, 11, color="#737780")
    right = _style("right", 8.3, 11.5, color="#60656E", alignment=TA_RIGHT)
    header = _style("header", 8.3, 12, color="#737780", alignment=TA_RIGHT)
    section = _style("section", 15, 19, color=ACCENTS.get(plan.get("plan_type"), "#343942"),
                     bold=True, space_before=15, space_after=11, keep_next=True)
    option_title = _style("option", 11.5, 16, bold=True, space_after=9, keep_next=True)
    summary_head = _style("summary_head", 21, 26, bold=True, space_after=12)
    summary_description = _style("summary_description", 9, 14, color="#737780", space_after=16)

    cw = A4[0] - 34 * mm
    widths = [cw*.115, cw*.49, cw*.099, cw*.099, cw*.099, cw*.098]

    daily = [0.0] * len(KEYS)
    meal_averages = []
    for _, name, meal in chosen_meals:
        options = meal.get("options") or []
        if options:
            option_values = [_option_average(opt, library) for opt in options]
            average = [sum(values[i] for values in option_values)/len(option_values) for i in range(4)]
        else:
            average = [0.0] * 4
        meal_averages.append((name, average))
        daily = [a + b for a, b in zip(daily, average)]

    # First page is cover (drawn by first-page callback). The second introduces nutrition.
    story = [Spacer(1, 1), PageBreak(),
             Paragraph("Resumo nutricional", summary_head),
             Paragraph("Referência diária calculada a partir da média das opções de cada refeição selecionada.",
                       summary_description)]
    summary_grid = Table([
        [Paragraph(("%.0f" if i==0 else "%.1f") % daily[i] + (" kcal" if i==0 else " g"),
                   _style("daily_%d" % i, 17, 22, color=NUTRIENT_COLORS[i], bold=True))
         for i in range(4)],
        [Paragraph(text, muted) for text in ("Energia", "Proteína", "Hidratos", "Gordura")]
    ], colWidths=[cw/4]*4, hAlign="LEFT")
    summary_grid.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 7),
        ("RIGHTPADDING", (0,0), (-1,-1), 7),
        ("TOPPADDING", (0,0), (-1,0), 12),
        ("BOTTOMPADDING", (0,-1), (-1,-1), 12),
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#F6F7F8")),
    ]))
    story.extend([summary_grid, Spacer(1, 12*mm),
                  Paragraph("Distribuição por refeição", _style("meal_breakdown", 13, 18,
                           bold=True, space_after=9))])
    rows = []
    for name, values in meal_averages:
        rows.append([Paragraph(_text(name.replace("Pequeno almoço", "Pequeno-almoço")), regular)] +
                    [Paragraph(_amount(i, values[i]) + (" kcal" if i==0 else " g"),
                               right) for i in range(4)])
    breakdown = Table(rows, colWidths=[cw*.40]+[cw*.15]*4, hAlign="LEFT")
    breakdown.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LINEBELOW", (0,0), (-1,-1), .4, colors.HexColor("#E7E8EA")),
        ("TOPPADDING", (0,0), (-1,-1), 9),
        ("BOTTOMPADDING", (0,0), (-1,-1), 9),
    ]))
    story.extend([breakdown, PageBreak()])

    for _, meal_name, meal in chosen_meals:
        meal_heading = Paragraph(_text(meal_name.replace("Pequeno almoço","Pequeno-almoço")), section)
        options = meal.get("options") or []
        if not options:
            story.append(meal_heading)
            continue
        for oi, option in enumerate(options):
            totals = _option_average(option, library)
            content = ([meal_heading] if oi == 0 else []) + [
                MacroPills(totals, cw),
                Paragraph("Opção " + str(oi+1) +
                          (" · " + _text(option.get("title")) if option.get("title") else ""),
                          option_title)
            ]
            # Only numerical nutrient headers: no Qtd. or Alimento / notas.
            rows = [["", "", *[Paragraph(s, header) for s in ("kcal", "P (g)", "HC (g)", "G (g)")]]]
            foods = option.get("foods") or []
            notes = option.get("notes") or []
            ordered = option.get("order") or (
                [{"type":"note","index":i} for i in range(len(notes))] +
                [{"type":"food","index":i} for i in range(len(foods))])
            for position in ordered:
                try:
                    idx = position["index"]
                    kind = position["type"]
                    if kind == "note":
                        note = notes[idx]
                        rows.append(["", Paragraph(_text(note), muted), "", "", "", ""])
                        continue
                    if kind != "food":
                        continue
                    food = foods[idx]
                except (KeyError, IndexError, TypeError):
                    continue
                ref = library.get(food.get("id"))
                quantity = food.get("display_quantity") or (
                    (("%g" % food["grams"]) + " g") if food.get("grams") is not None else "Por definir")
                if food.get("grams") == 0:
                    quantity = "0 g"
                label = food.get("display_name") or food.get("label") or (
                    ref or {}).get("display_name") or "Alimento"
                if food.get("alternative_to") is not None:
                    label = "Ou " + label
                values = _nutrition(food, ref)
                line = [Paragraph(_text(quantity), muted), Paragraph(_text(label), regular)]
                line.extend(Paragraph(_amount(i, value), right) if values is not None
                            else Paragraph("-", right)
                            for i, value in enumerate(values if values is not None else [0,0,0,0]))
                rows.append(line)
            table = Table(rows, colWidths=widths, repeatRows=0, hAlign="LEFT", splitByRow=1)
            table.setStyle(TableStyle([
                ("VALIGN", (0,0), (-1,-1), "TOP"),
                ("LEFTPADDING", (0,0), (-1,-1), 4),
                ("RIGHTPADDING", (0,0), (-1,-1), 4),
                ("TOPPADDING", (0,0), (-1,-1), 5),
                ("BOTTOMPADDING", (0,0), (-1,-1), 5),
                ("LINEBELOW", (0,0), (-1,0), .5, colors.HexColor("#DDE0E3")),
                ("LINEBELOW", (0,1), (-1,-1), .2, colors.HexColor("#E7E8EA")),
            ]))
            content.append(table)
            content.append(Spacer(1, 8*mm))
            # Move the complete option to the following page if it will fit there.
            # A genuinely oversized option may split rather than overflow the page.
            story.append(KeepTogether(content))

    def first_page(canvas, document):
        _draw_cover(canvas, document, plan)

    doc.build(story, onFirstPage=first_page, onLaterPages=_footer)
    return out.getvalue()
