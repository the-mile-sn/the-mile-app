"""Read-only A4 export of the saved admin plan, without publication side effects."""
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

PLAN_COLORS = {
    "orange": "#E78841", "yellow": "#DEBA46", "blue": "#5394B8",
    "green": "#54A477", "vp": "#8A72A2",
}
MEAL_NAMES = {"breakfast": "Pequeno-almoço", "lunch": "Almoço", "snack": "Lanche",
              "dinner": "Jantar", "supper": "Ceia"}
METRICS = ("kcal", "protein_g", "carbs_g", "fat_g")


def _txt(value):
    """Escape untrusted plan text and preserve line breaks in ReportLab paragraphs."""
    return escape(str(value if value is not None else "")).replace("\n", "<br/>")


def render_plan_pdf(draft, athlete):
    """Render the stored draft/validated version. Does not write to the database."""
    extracted = draft.get("extracted") or {}
    groups = extracted.get("groups") or []
    if not isinstance(groups, list):
        raise ValueError("invalid_groups")
    output = BytesIO()
    page_width, _ = A4
    doc = SimpleDocTemplate(output, pagesize=A4, topMargin=23*mm,
        bottomMargin=20*mm, leftMargin=19*mm, rightMargin=19*mm,
        title="Plano alimentar - The Mile", author="The Mile",
        pageCompression=1)
    regular = ParagraphStyle("regular", fontName="Helvetica", fontSize=9.2, leading=13.5,
                             textColor=colors.HexColor("#242830"), spaceAfter=3)
    subtle = ParagraphStyle("subtle", parent=regular, fontSize=8, leading=11,
                            textColor=colors.HexColor("#60656C"))
    title = ParagraphStyle("title", parent=regular, fontName="Helvetica-Bold",
                           fontSize=20, leading=24, spaceAfter=9)
    section = ParagraphStyle("section", parent=regular, fontName="Helvetica-Bold",
                             fontSize=12, leading=16, spaceBefore=14, spaceAfter=8,
                             textColor=colors.HexColor(PLAN_COLORS.get(draft.get("color"), "#31343A")))
    option_style = ParagraphStyle("option", parent=regular, fontName="Helvetica-Bold",
                                  fontSize=9.5, leading=13, spaceAfter=5)
    numeric = ParagraphStyle("numeric", parent=subtle, alignment=TA_RIGHT)
    cell = ParagraphStyle("cell", parent=regular, fontSize=8.1, leading=11.2)
    story = [Paragraph("THE MILE", subtle), Spacer(1, 5*mm),
             Paragraph("Plano alimentar", title),
             Paragraph(_txt(athlete.get("name") or "Jogador"), regular),
             Paragraph("Plano: " + _txt(draft.get("color","")).capitalize(), subtle),
             Spacer(1, 6*mm)]
    available = page_width - 38*mm
    widths = [available*.12, available*.50, available*.095, available*.095, available*.095, available*.095]

    for group in groups:
        if not isinstance(group, dict):
            continue
        meals = group.get("meals") or []
        heading = group.get("heading") or " / ".join(MEAL_NAMES.get(x,x) for x in meals) or "Refeição"
        story.append(Paragraph(_txt(heading), section))
        for index, option in enumerate(group.get("options") or []):
            if not isinstance(option, dict):
                continue
            number = option.get("number") or index + 1
            option_name = option.get("title") or ""
            story.append(Paragraph("Opção " + _txt(number) + (" · " + _txt(option_name) if option_name else ""), option_style))
            items = option.get("items") or []
            rows = [[Paragraph("Qtd.", subtle), Paragraph("Alimento / indicação", subtle),
                     Paragraph("kcal", numeric), Paragraph("P (g)", numeric),
                     Paragraph("HC (g)", numeric), Paragraph("G (g)", numeric)]]
            for item in items:
                if not isinstance(item, dict):
                    continue
                kind=item.get("kind")
                if kind == "food":
                    nutrient=item.get("nutrients") or {}
                    rows.append([Paragraph(_txt(item.get("quantity","")), cell),
                        Paragraph(_txt(item.get("name") or item.get("text") or ""), cell),
                        *[Paragraph(_txt(nutrient.get(key,"-")), numeric) for key in METRICS]])
                elif kind in ("note","instruction","collapsible_note","title"):
                    note = item.get("text") or item.get("title") or ""
                    if note.strip():
                        rows.append(["", Paragraph(_txt(note), subtle), "", "", "", ""])
            totals=option.get("totals")
            if isinstance(totals,dict):
                rows.append(["", Paragraph("Total da opção", option_style),
                    *[Paragraph(_txt(totals.get(key,"-")), numeric) for key in METRICS]])
            if len(rows)>1:
                table=Table(rows,colWidths=widths,repeatRows=1,hAlign="LEFT",
                    splitByRow=1)
                table.setStyle(TableStyle([
                    ("VALIGN",(0,0),(-1,-1),"TOP"),
                    ("LEFTPADDING",(0,0),(-1,-1),5),
                    ("RIGHTPADDING",(0,0),(-1,-1),5),
                    ("TOPPADDING",(0,0),(-1,-1),5),
                    ("BOTTOMPADDING",(0,0),(-1,-1),5),
                    ("BACKGROUND",(0,0),(-1,0),colors.HexColor("#F0F1F3")),
                    ("LINEBELOW",(0,0),(-1,0),0.5,colors.HexColor("#D8DCE0")),
                    ("LINEBELOW",(0,1),(-1,-1),0.2,colors.HexColor("#E5E6E8")),
                ]))
                story.append(table)
            story.append(Spacer(1,5*mm))
    if not groups:
        story.append(Paragraph("Este plano ainda não contém opções alimentares.", regular))
    def footer(canvas, document):
        canvas.saveState()
        canvas.setFont("Helvetica",8)
        canvas.setFillColor(colors.HexColor("#797D82"))
        canvas.drawString(19*mm,12*mm,"www.themile.pt")
        canvas.drawRightString(A4[0]-19*mm,12*mm,str(document.page))
        canvas.restoreState()
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    return output.getvalue()
