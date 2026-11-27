"""Read-only inventory of text actually displayed by the player/chef apps.

The canonical libraries remain the sole source of nutrition, quantities,
rules and prescriptions. Only presentation text is proposed for translation.
"""
import json

KINDS = ("food", "dish", "recipe", "recipe_category", "supplement")
LABELS = {
    "food": "Alimentos", "dish": "Pratos", "recipe": "Receitas",
    "recipe_category": "Categorias de receitas", "supplement": "Suplementação"
}
SQL = {
    "food": "SELECT id,display_name,category FROM v2_food_library WHERE active=1",
    "dish": "SELECT id,name_pt,name_en,category FROM v2_dish_library WHERE active=1",
    "recipe": """SELECT id,name,notes,sections_json,steps_json
                 FROM v2_recipe_library WHERE status='published'""",
    "recipe_category": "SELECT id,name FROM v2_recipe_categories",
    "supplement": """SELECT id,name,dose,note,timing_text,prescriptions_json
                     FROM v2_supplement_library""",
}
SINGLE = {
    "food": "SELECT id,display_name,category FROM v2_food_library WHERE id=? AND active=1",
    "dish": "SELECT id,name_pt,name_en,category FROM v2_dish_library WHERE id=? AND active=1",
    "recipe": """SELECT id,name,notes,sections_json,steps_json
                 FROM v2_recipe_library WHERE id=? AND status='published'""",
    "recipe_category": "SELECT id,name FROM v2_recipe_categories WHERE id=?",
    "supplement": """SELECT id,name,dose,note,timing_text,prescriptions_json
                     FROM v2_supplement_library WHERE id=?""",
}

def _json(raw):
    try:
        value=json.loads(raw or "[]")
    except (ValueError,TypeError):
        return []
    return value if isinstance(value,list) else []

def _put(fields,path,value,label,legacy=""):
    if isinstance(value,str) and value.strip() and len(value)<=10000:
        fields.append({
            "field_path":path,"source_text":value,"field_label":label,
            "legacy_en":legacy if isinstance(legacy,str) else ""
        })

def rows_for(c,kind):
    if kind=="notification":
        from notification_templates_v2 import source_rows
        return source_rows()
    return c.execute(SQL[kind]).fetchall()


def fields_for(kind,row):
    """Only fields used in player/chef presentation, never food internal notes."""
    data=dict(row)
    fields=[]
    if kind=="notification":
        _put(fields,"title",data["title"],"Título",data["title_en"])
        _put(fields,"body",data["body"],"Mensagem",data["body_en"])
    elif kind=="food":
        _put(fields,"display_name",data["display_name"],"Nome do alimento")
    elif kind=="dish":
        _put(fields,"name_pt",data["name_pt"],"Nome do prato",data.get("name_en") or "")
    elif kind=="recipe":
        _put(fields,"name",data["name"],"Nome da receita")
        # Recipe notes are exposed in the published recipe detail response.
        _put(fields,"notes",data["notes"],"Notas da receita")
        for section in _json(data["sections_json"]):
            if not isinstance(section,dict):continue
            sid=section.get("id")
            if not isinstance(sid,str) or not sid:continue
            _put(fields,"sections/"+sid+"/title",section.get("title"),"Título da secção")
            ingredients=section.get("ingredients")
            if not isinstance(ingredients,list):continue
            for ing in ingredients:
                if not isinstance(ing,dict):continue
                iid=ing.get("id")
                if not isinstance(iid,str) or not iid:continue
                path="sections/"+sid+"/ingredients/"+iid
                _put(fields,path+"/name",ing.get("name"),"Ingrediente")
                _put(fields,path+"/unit",ing.get("unit"),"Unidade de apresentação")
                # Intentionally NOT the quantity or recipe reference.
        for i,step in enumerate(_json(data["steps_json"])):
            _put(fields,"steps/"+str(i),step,"Preparação · passo "+str(i+1))
    elif kind=="recipe_category":
        _put(fields,"name",data["name"],"Nome da categoria")
    elif kind=="supplement":
        _put(fields,"name",data["name"],"Nome do suplemento")
        for field,label in (("dose","Dose · texto visível"),
                            ("timing_text","Instrução de toma"),
                            ("note","Nota visível")):
            _put(fields,field,data.get(field),label)
        for idx,prescription in enumerate(_json(data["prescriptions_json"])):
            if not isinstance(prescription,dict):continue
            for key,label in (("dose","Prescrição · texto da dose"),
                              ("timing_text","Prescrição · instrução de toma"),
                              ("note","Prescrição · nota")):
                _put(fields,"prescriptions/"+str(idx)+"/"+key,
                     prescription.get(key),label+" "+str(idx+1))
        # Rule, moment code, numeric dose and prescription semantics are NEVER edited.
    else:
        raise ValueError("invalid_translation_field")
    return fields

def record(c,kind,entity_id):
    if kind=="notification":
        row=next((r for r in rows_for(c,kind) if r["id"]==entity_id),None)
        if row is None:raise LookupError("content_not_found")
        return row
    if kind not in KINDS or not isinstance(entity_id,str) or len(entity_id)>160:
        raise ValueError("invalid_translation_field")
    row=c.execute(SINGLE[kind],(entity_id,)).fetchone()
    if row is None:raise LookupError("content_not_found")
    return row

def canonical_field(c,kind,entity_id,field_path):
    row=record(c,kind,entity_id)
    for field in fields_for(kind,row):
        if field["field_path"]==field_path:
            return field["source_text"]
    raise ValueError("invalid_translation_field")
