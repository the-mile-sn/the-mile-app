"""The Mile saved-plan PDF: branded cover, daily summary and pagination-safe options."""
from io import BytesIO
from PIL import Image, ImageOps, UnidentifiedImageError
from pathlib import Path
from datetime import date
from math import cos, sin, radians
import monitoring_v2
import unicodedata
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
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
ROOT = Path(__file__).resolve().parent
LOGO_PATH = ROOT / "static" / "logo-black.png"
FONT_DIR = ROOT / "static" / "fonts"
pdfmetrics.registerFont(TTFont("InterTight", str(FONT_DIR / "InterTight-Regular.ttf")))
pdfmetrics.registerFont(TTFont("InterTight-Bold", str(FONT_DIR / "InterTight-Bold.ttf")))
pdfmetrics.registerFontFamily("InterTight", normal="InterTight", bold="InterTight-Bold")


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
    return ParagraphStyle(name, fontName="InterTight-Bold" if bold else "InterTight",
                          fontSize=size, leading=leading, textColor=colors.HexColor(color),
                          spaceBefore=space_before, spaceAfter=space_after,
                          alignment=alignment, keepWithNext=keep_next)


def _player_photo(c, plan):
    """Read the linked player's existing private photo for an admin-authorised PDF."""
    athlete_id = plan.get("athlete_id")
    if not athlete_id:
        return None
    row = c.execute(
        """SELECT u.photo FROM v2_player_links l
           JOIN users u ON u.id = l.user_id
           WHERE l.athlete_id = ? AND u.role = 'player' LIMIT 1""",
        (str(athlete_id),)
    ).fetchone()
    if not row:
        return None
    return row["photo"] if hasattr(row, "keys") else row[0]


def _draw_cover(canvas, doc, plan, photo_bytes=None):
    """A4 editorial cover; always embed the genuine brand asset."""
    canvas.saveState()
    canvas.setTitle("Plano alimentar - The Mile")
    canvas.setFillColor(colors.HexColor("#939397"))
    canvas.setFont("InterTight", 35)
    x = 23 * mm
    y = A4[1] - 12 * mm - 35
    canvas.drawString(x, y, "Plano alimentar")
    canvas.setFillColor(colors.HexColor("#111318"))
    player = str(plan.get("player_name") or "Jogador")
    font_size = 35
    max_width = (107 if photo_bytes else 164) * mm
    while stringWidth(player, "InterTight", font_size) > max_width and font_size > 19:
        font_size -= 1
    canvas.setFont("InterTight", font_size)
    canvas.drawString(x, y - 18 * mm, player)

    if photo_bytes:
        try:
            # Square centre-crop the existing portrait, preserving EXIF orientation.
            # Keep bytes in memory only; do not write an athlete photo to the repo.
            with Image.open(BytesIO(bytes(photo_bytes))) as img:
                portrait = ImageOps.fit(ImageOps.exif_transpose(img).convert("RGB"),
                                        (440,440), method=Image.Resampling.LANCZOS)
                crop = ImageReader(portrait)
                size = 45 * mm
                left = A4[0] - 23*mm - size
                bottom = y - 18*mm - 10*mm
                canvas.saveState()
                circle = canvas.beginPath()
                circle.circle(left + size/2, bottom + size/2, size/2)
                canvas.clipPath(circle, stroke=0, fill=0)
                canvas.drawImage(crop, left, bottom, size, size, mask="auto")
                canvas.restoreState()
        except (UnidentifiedImageError, OSError, ValueError):
            # A missing/corrupt photo must never prevent plan export.
            pass

    label = str(plan.get("plan_type") or "").lower()
    if "verde preparação" in label or "verde preparacao" in label:
        hue, lit = "#235C40", 3
    elif "laranja" in label:
        hue, lit = "#D88744", 1
    elif "amarelo" in label:
        hue, lit = "#C99F31", 2
    elif "azul" in label:
        hue, lit = "#528BB8", 2
    elif "verde" in label:
        hue, lit = "#56A77F", 3
    else:
        hue, lit = "#939397", 2
    sy = y - 30 * mm
    for i in range(3):
        canvas.setFillColor(colors.HexColor(hue) if i < lit else colors.HexColor("#ECEDEF"))
        canvas.roundRect(x, sy - i * 4.2 * mm, 21 * mm, 3 * mm, 1.5 * mm, fill=1, stroke=0)

    if not LOGO_PATH.is_file():
        raise ValueError("missing_original_the_mile_logo")
    logo = ImageReader(str(LOGO_PATH))
    lw, lh = logo.getSize()
    max_w, max_h = 62 * mm, 28 * mm
    scale = min(max_w / lw, max_h / lh)
    w, h = lw * scale, lh * scale
    canvas.drawImage(logo, (A4[0] - w) / 2, 25 * mm, w, h, mask="auto")
    canvas.restoreState()


def _later_page_chrome(canvas, doc, plan):
    """Balanced brand header and restrained footer from page two onwards."""
    canvas.saveState()
    left, right = 17 * mm, A4[0] - 17 * mm
    canvas.setFillColor(colors.HexColor("#858A91"))
    canvas.setFont("InterTight", 8)
    name = str(plan.get("player_name") or "Jogador")
    heading = "Plano alimentar - " + name
    # Avoid touching the logo area even with long player names.
    available = A4[0] - 17*mm - 17*mm - 35*mm
    while stringWidth(heading, "InterTight", 8) > available and len(heading) > 19:
        heading = heading[:-2] + "…"
    canvas.drawString(left, A4[1] - 11 * mm, heading)
    logo = ImageReader(str(LOGO_PATH))
    iw, ih = logo.getSize()
    ratio = min(27*mm/iw, 8*mm/ih)
    w, h = iw*ratio, ih*ratio
    canvas.drawImage(logo, right - w, A4[1] - 13*mm, w, h, mask="auto")
    canvas.setStrokeColor(colors.HexColor("#E7E8EA"))
    canvas.setLineWidth(.5)
    canvas.line(left, 16.5*mm, right, 16.5*mm)
    canvas.setFillColor(colors.HexColor("#858A91"))
    canvas.setFont("InterTight", 8)
    canvas.drawString(left, 11*mm, "www.themile.pt")
    canvas.drawRightString(right, 11*mm, str(doc.page))
    canvas.restoreState()


class MacroPills(Flowable):
    """Pills centered precisely above the corresponding four food columns."""
    def __init__(self, values, numeric_widths):
        Flowable.__init__(self)
        self.values = values
        self.numeric_widths = numeric_widths
        self.width = sum(numeric_widths)
        self.height = 31
        self.hAlign = "LEFT"

    def draw(self):
        labels = [
            _amount(0, self.values[0]) + " kcal",
            _amount(1, self.values[1]) + " g P",
            _amount(2, self.values[2]) + " g HC",
            _amount(3, self.values[3]) + " g G",
        ]
        backgrounds = ("#EAF4EC", "#EAF2FA", "#FFF1E5", "#FBF7DE")
        cursor = 0
        for label, column_width, fg, bg in zip(
                labels, self.numeric_widths, NUTRIENT_COLORS, backgrounds):
            measured = stringWidth(label, "InterTight-Bold", 9)
            pill_width = min(column_width - 2, measured + 8)
            center = cursor + column_width / 2
            self.canv.setFillColor(colors.HexColor(bg))
            self.canv.roundRect(center - pill_width / 2, 6,
                                pill_width, 19, 9.5, stroke=0, fill=1)
            self.canv.setFillColor(colors.HexColor(fg))
            self.canv.setFont("InterTight-Bold", 9)
            self.canv.drawCentredString(center, 12, label)
            cursor += column_width


def _share(numerator, denominator):
    """A percent of actual plan kcal, not the total grams of macros."""
    if denominator is None or denominator <= 0:
        return 0.0
    return max(0.0, 100.0 * float(numerator) / float(denominator))


def _meal_shares(values):
    """Actual percentage of meal kcal supplied by each macro (4/4/9)."""
    energy = values[0]
    return [_share(values[1]*4, energy), _share(values[2]*4, energy),
            _share(values[3]*9, energy)]


def _macro_ring_shares(values):
    """Full 100% ring of macro-derived energy, independent of food-label kcal discrepancy.

    Individual grams are first converted to kcal using 4/4/9. Because labelled
    total kcal can differ due to rounding, fibre, or food database conventions,
    the three sectors are normalised to their own energy sum. The centre still
    displays the plan's declared kcal total, without changing its value.
    """
    parts = [max(0.0, float(values[1])*4),
             max(0.0, float(values[2])*4),
             max(0.0, float(values[3])*9)]
    total = sum(parts)
    if total <= 0:
        return [0.0, 0.0, 0.0]
    return [parts[0]/total, parts[1]/total, 1.0-(parts[0]+parts[1])/total]


def _reference_weight(c, plan):
    """Reuse the backoffice athlete reference, without synthesizing kilograms."""
    athlete_id = plan.get("athlete_id")
    if not athlete_id:
        return None
    try:
        ref = monitoring_v2.reference_weight(c, str(athlete_id), date.today().isoformat())
        weight = float((ref or {}).get("weight_kg") or 0)
        return weight if weight > 0 else None
    except (ValueError, TypeError, KeyError):
        return None


def _draw_ring(canvas, cx, cy, radius, hole, segments, neutral="#F0F1F3"):
    """Draw vector wedges, preserving a neutral remainder if 4/4/9 differs from kcal."""
    canvas.setFillColor(colors.HexColor(neutral))
    canvas.circle(cx, cy, radius, stroke=0, fill=1)
    start = 90.0
    for fraction, fill in segments:
        fraction = min(max(fraction, 0.0), 1.0)
        extent = 360.0 * fraction
        if extent <= 0:
            continue
        canvas.setFillColor(colors.HexColor(fill))
        canvas.wedge(cx-radius, cy-radius, cx+radius, cy+radius,
                     startAng=start, extent=-extent, stroke=0, fill=1)
        start -= extent
    canvas.setFillColor(colors.white)
    canvas.circle(cx, cy, hole, stroke=0, fill=1)


class NutritionDailyOverview(Flowable):
    """Single energy ring and an aligned macro breakdown with g/kg and percent."""
    def __init__(self, totals, reference_weight, width):
        Flowable.__init__(self)
        self.values = totals
        self.weight_kg = reference_weight
        self.width = width
        self.height = 190

    def draw(self):
        c = self.canv
        energy, protein, carbs, fat = self.values
        shares = _macro_ring_shares(self.values)
        palette = ("#D5E0F2", "#F9E0D0", "#FFF0BF")
        cx, cy, radius = 86, 97, 64
        _draw_ring(c, cx, cy, radius, 45, list(zip(shares, palette)))
        c.setFillColor(colors.HexColor("#111318"))
        # Centre the energy value in the ring and balance the line spacing.
        c.setFillColor(colors.HexColor("#939397"))
        c.setFont("InterTight", 10)
        c.drawCentredString(cx, cy+24, "kcal")
        c.setFillColor(colors.HexColor("#111318"))
        c.setFont("InterTight-Bold", 27)
        c.drawCentredString(cx, cy-6, _amount(0, energy))
        if self.weight_kg:
            c.setFillColor(colors.HexColor("#939397"))
            c.setFont("InterTight", 10)
            c.drawCentredString(cx, cy-30, "%.0f/kg" % (energy/self.weight_kg))

        x = 192
        right = self.width-4
        labels = ("Proteínas", "Hidratos", "Gorduras")
        grams = (protein, carbs, fat)
        ink = ("#426D9C", "#A96836", "#8A6F17")
        for i, (label, value, share, accent, tint) in enumerate(
                zip(labels, grams, shares, ink, palette)):
            y = 139-i*48
            c.setFillColor(colors.HexColor(tint))
            c.circle(x+5,y+4,5,fill=1,stroke=0)
            c.setFillColor(colors.HexColor("#242831"))
            c.setFont("InterTight",11)
            c.drawString(x+18,y,label)
            c.setFillColor(colors.HexColor(accent))
            c.setFont("InterTight-Bold",12)
            c.drawRightString(right,y,_amount(1,value)+" g")
            c.setFillColor(colors.HexColor("#737780"))
            c.setFont("InterTight",9.5)
            ratio = ("%.1f g/kg" % (value/self.weight_kg)) if self.weight_kg else "— g/kg"
            c.drawRightString(right,y-15,ratio+"   ·   "+str(round(share*100))+"%")
            if i < 2:
                c.setStrokeColor(colors.HexColor("#E7E8EA"))
                c.setLineWidth(.5)
                c.line(x+18,y-24,right,y-24)


class NutritionMealOverview(Flowable):
    """One editorial meal row: kcal, daily percent and three macro bars."""
    def __init__(self, name, values, daily_kcal, width, show_divider=True):
        Flowable.__init__(self)
        self.show_divider = show_divider
        self.name = name.replace("Pequeno almoço","Pequeno-almoço")
        self.values = values
        self.daily_kcal = daily_kcal
        self.width = width
        self.height = 75

    def draw(self):
        c = self.canv
        energy = self.values[0]
        c.setFillColor(colors.HexColor("#939397"))
        c.setFont("InterTight-Bold",11)
        c.drawString(0,53,self.name)
        c.setFillColor(colors.HexColor("#242831"))
        c.setFont("InterTight-Bold",14)
        c.drawString(0,30,_amount(0,energy)+" kcal")
        c.setFillColor(colors.HexColor("#737780"))
        c.setFont("InterTight",9.5)
        c.drawString(0,15,str(round(_share(energy,self.daily_kcal)))+"% do dia")

        start = 168
        usable = self.width-start
        cell_width = usable/3
        # Each bar represents the meal's share of that nutrient's daily total.
        # When an option has no macro energy, retain a neutral empty track.
        labels = ("P", "HC", "G")
        accents = ("#B6C6E5", "#EBC5B2", "#F5DE9E")
        for i,(label,value,accent) in enumerate(zip(labels,self.values[1:],accents)):
            x = start+i*cell_width+5
            bar_width = cell_width-16
            c.setFillColor(colors.HexColor("#242831"))
            c.setFont("InterTight",11)
            c.drawString(x,47,label+": "+_amount(1,value)+" g")
            c.setFillColor(colors.HexColor("#F1F1F3"))
            c.roundRect(x,26,bar_width,8,4,stroke=0,fill=1)
            # Preserve the existing macro-energy share semantics.
            macro_share = _meal_shares(self.values)[i]
            if macro_share > 0:
                c.setFillColor(colors.HexColor(accent))
                c.roundRect(x,26,min(bar_width,max(4,bar_width*min(macro_share/100,1))),
                            8,4,stroke=0,fill=1)
        if self.show_divider:
            c.setLineWidth(.5)
            c.setStrokeColor(colors.HexColor("#E7E8EA"))
            c.line(0,4,self.width,4)


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
                            topMargin=25*mm, bottomMargin=20*mm,
                            title="Plano alimentar - The Mile", author="The Mile")
    regular = _style("food", 9, 12, space_after=0)
    muted = _style("muted", 9, 12, color="#737780")
    right = _style("right", 9, 12, color="#939397", alignment=TA_CENTER)
    breakdown_number = _style("breakdown_number", 9, 12, color="#939397", alignment=TA_RIGHT)
    
    section = _style("section", 16, 20, color=ACCENTS.get(plan.get("plan_type"), "#343942"),
                     bold=True, space_before=15, space_after=11, keep_next=True)
    option_index = _style("option_index", 12, 15, color="#939397", space_after=2, keep_next=True)
    option_title = _style("option_title", 12, 16, color="#111318", bold=True, space_after=0, keep_next=True)
    summary_head = _style("summary_head", 21, 26, bold=True, space_after=12)
    summary_description = _style("summary_description", 10, 14, color="#737780", space_after=16)

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

    # Cover remains separate; the summary uses vector rings and bars.
    weight = _reference_weight(c, plan)
    story = [Spacer(1,1),PageBreak(),
        Paragraph("Resumo nutricional",summary_head),
        Paragraph("Valores de referência: média das opções de cada refeição selecionada.",
                  summary_description),
        NutritionDailyOverview(daily,weight,cw),
        Paragraph("Distribuição pelas refeições", _style("meal_distribution", 15, 19,
                  color="#242831", bold=True, space_after=9))]
    # Compact meal flowables keep the entire normal daily selection on one A4 page.
    # For unusually large custom meal lists, ReportLab may paginate rather than clip.
    for meal_index,(name,values) in enumerate(meal_averages):
        story.append(NutritionMealOverview(name,values,daily[0],cw,
                                           show_divider=meal_index < len(meal_averages)-1))
        story.append(Spacer(1,2*mm))
    story.append(PageBreak())

    for _, meal_name, meal in chosen_meals:
        meal_heading = Paragraph(_text(meal_name.replace("Pequeno almoço","Pequeno-almoço")), section)
        options = meal.get("options") or []
        if not options:
            story.append(meal_heading)
            continue
        for oi, option in enumerate(options):
            totals = _option_average(option, library)
            option_label = [
                Paragraph("Opção " + str(oi + 1), option_index),
                Paragraph(_text(option.get("title") or ""), option_title),
            ]
            option_header = Table(
                [[option_label, MacroPills(totals, widths[2:])]],
                colWidths=[sum(widths[:2]), sum(widths[2:])], hAlign="LEFT")
            option_header.setStyle(TableStyle([
                ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
                ("LEFTPADDING", (0,0), (-1,-1), 0),
                ("RIGHTPADDING", (0,0), (-1,-1), 0),
                ("TOPPADDING", (0,0), (-1,-1), 0),
                ("BOTTOMPADDING", (0,0), (-1,-1), 12),
            ]))
            content = ([meal_heading] if oi == 0 else []) + [option_header]
            # The pill captions are the nutrient legend; no redundant header row.
            rows = []
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
                ("LINEBELOW", (0,0), (-1,-1), .2, colors.HexColor("#E7E8EA")),
                ("LEFTPADDING", (2,0), (-1,-1), 0),
                ("RIGHTPADDING", (2,0), (-1,-1), 0),
            ]))
            content.append(table)
            content.append(Spacer(1, 8*mm))
            # Move the complete option to the following page if it will fit there.
            # A genuinely oversized option may split rather than overflow the page.
            story.append(KeepTogether(content))

    photo_bytes = _player_photo(c, plan)

    def first_page(canvas, document):
        _draw_cover(canvas, document, plan, photo_bytes)

    doc.build(story, onFirstPage=first_page,
              onLaterPages=lambda canvas, document: _later_page_chrome(canvas, document, plan))
    return out.getvalue()
