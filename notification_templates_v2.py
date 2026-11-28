"""Draft bilingual templates for manually initiated notifications.

The approved Portuguese wording for game, weight, birthday and activation
is preserved. Other copy and English translations remain subject to review.
No sending, language lookup or scheduling is performed here.
"""
import hashlib
import json
import time

TEMPLATES = {
    "game": {
        "pt-PT": ("Formulário de jogo", "Não te esqueças de preencher o formulário do teu último jogo."),
        "en-GB": ("Match questionnaire", "Don't forget to complete the questionnaire for your last match."),
    },
    "weight": {
        "pt-PT": ("Formulário de peso", "Faz o registo do teu peso."),
        "en-GB": ("Weight log", "Record your weight."),
    },
    "document_available": {
        "pt-PT": ("Documento disponível", "Tens um documento disponível para consulta."),
        "en-GB": ("Document available", "A document is available to view."),
    },
    "assessment_available": {
        "pt-PT": ("Avaliação disponível", "Tens uma avaliação disponível para consulta."),
        "en-GB": ("Assessment available", "An assessment is available to view."),
    },
    "document_new": {
        "pt-PT": ("Novo documento", "Tens um novo documento disponível para consulta."),
        "en-GB": ("New document", "A new document is available to view."),
    },
    "document_updated": {
        "pt-PT": ("Documento atualizado", "Um dos teus documentos foi atualizado."),
        "en-GB": ("Document updated", "One of your documents has been updated."),
    },
    "assessment_new": {
        "pt-PT": ("Nova avaliação", "Tens uma nova avaliação disponível para consulta."),
        "en-GB": ("New assessment", "A new assessment is available to view."),
    },
    "assessment_updated": {
        "pt-PT": ("Avaliação atualizada", "Uma das tuas avaliações foi atualizada."),
        "en-GB": ("Assessment updated", "One of your assessments has been updated."),
    },
    "menu_new": {
        "pt-PT": ("Novo menu", "Tens um novo menu disponível para consulta."),
        "en-GB": ("New menu", "A new menu is available to view."),
    },
    "menu_updated": {
        "pt-PT": ("Menu atualizado", "O menu foi atualizado."),
        "en-GB": ("Menu updated", "The menu has been updated."),
    },
    "birthday": {
        "pt-PT": ("Feliz aniversário, {first_name}!", "A equipa The Mile deseja-te um excelente dia. Muitos parabéns!"),
        "en-GB": ("Happy birthday, {first_name}!", "The Mile team wishes you a wonderful day. Happy birthday!"),
    },
}

ACTIVATION = {
    "pt-PT": ("Ativar notificações", "Recebe informações importantes e atualizações sobre o teu acompanhamento.",
              "Ativar notificações", "Agora não"),
    "en-GB": ("Enable notifications", "Receive important information and updates about your ongoing support.",
              "Enable notifications", "Not now"),
}


def _has_sources(c):
    if c is None:
        return False
    if hasattr(c, "conn"):
        return c.execute("""SELECT 1 FROM information_schema.tables
            WHERE table_schema=current_schema() AND table_name='v2_notification_template_sources'""").fetchone() is not None
    return c.execute("""SELECT 1 FROM sqlite_master
        WHERE type='table' AND name='v2_notification_template_sources'""").fetchone() is not None


def source_copy(key, c=None):
    default = TEMPLATES[key]["pt-PT"]
    if not _has_sources(c):
        return default
    row = c.execute("SELECT title,body FROM v2_notification_template_sources WHERE template_key=?", (key,)).fetchone()
    return (row["title"],row["body"]) if row else default


def source_rows(c=None):
    """Canonical current PT templates and review-only EN suggestions."""
    rows=[]
    for key,copies in TEMPLATES.items():
        title,body=source_copy(key,c)
        rows.append({"id":key,"title":title,"body":body,
                     "title_en":copies["en-GB"][0],"body_en":copies["en-GB"][1]})
    return rows


def editable_template(c,key):
    from content_translations_v2 import resolve
    pt=source_copy(key,c)
    fields={}
    for index,field in enumerate(("title","body")):
        candidate=c.execute("""SELECT translated_text,source_hash,status FROM v2_content_translations
            WHERE entity_kind='notification' AND entity_id=? AND field_path=? AND language='en'""",(key,field)).fetchone()
        resolved=resolve(c,entity_kind="notification",entity_id=key,field_path=field,source_text=pt[index],language="en")
        fields[field]={"pt":pt[index],"en":candidate["translated_text"] if candidate else TEMPLATES[key]["en-GB"][index],
                       "status":resolved["status"],"source_hash":candidate["source_hash"] if candidate else None}
    revision=hashlib.sha256(json.dumps(fields,sort_keys=True,ensure_ascii=False).encode("utf-8")).hexdigest()
    return {"id":key,"label":TEMPLATES[key]["pt-PT"][0],"fields":fields,"revision":revision}


def editable_templates(c):
    return [editable_template(c,key) for key in TEMPLATES]


def save_template(c, *, actor_id, payload):
    """Explicit bilingual review; same translation approval store, no send."""
    from content_translations_v2 import submit, approve
    if not isinstance(payload,dict) or set(payload)!={"id","revision","pt","en"}:
        raise ValueError("invalid_template")
    key=payload["id"]
    if not isinstance(key,str) or key not in TEMPLATES:
        raise ValueError("invalid_template")
    actor=c.execute("SELECT role,active FROM users WHERE id=?", (actor_id,)).fetchone()
    if not actor or actor["role"]!="admin" or not actor["active"]:
        raise PermissionError("forbidden")
    if not _has_sources(c):
        raise ValueError("template_store_unavailable")
    if editable_template(c,key)["revision"]!=payload["revision"]:
        raise ValueError("template_changed")
    copies={}
    for lang in ("pt","en"):
        data=payload[lang]
        if not isinstance(data,dict) or set(data)!={"title","body"}:
            raise ValueError("invalid_template")
        copies[lang]={}
        for field in ("title","body"):
            text=data[field]
            validate_translation(key,field,text)
            copies[lang][field]=text.strip()
    pt=copies["pt"]
    c.execute("""INSERT INTO v2_notification_template_sources(template_key,title,body,updated_at,updated_by)
        VALUES(?,?,?,?,?) ON CONFLICT(template_key) DO UPDATE SET title=excluded.title,body=excluded.body,
        updated_at=excluded.updated_at,updated_by=excluded.updated_by""",(key,pt["title"],pt["body"],int(time.time()),actor_id))
    for field in ("title","body"):
        args=dict(entity_kind="notification",entity_id=key,field_path=field,source_text=pt[field],language="en")
        text=copies["en"][field]
        submit(c,**args,translated_text=text,actor_id=actor_id)
        approve(c,**args,reviewer_id=actor_id,expected_candidate_hash=hashlib.sha256(text.encode("utf-8")).hexdigest())
    return editable_template(c,key)


def validate_translation(key, field, text):
    if key not in TEMPLATES or field not in ("title","body") or not isinstance(text,str):
        raise ValueError("invalid_notification_translation")
    if not text.strip() or len(text)>(120 if field=="title" else 1000):
        raise ValueError("invalid_notification_translation")
    # The birthday name is interpolated only after the exact placeholder is
    # reviewed; no other placeholders or formatting expressions are allowed.
    expected=TEMPLATES[key]["pt-PT"][0 if field=="title" else 1]
    placeholder="{first_name}"
    if (text.count(placeholder)!=expected.count(placeholder)
            or any(x in text.replace(placeholder,"") for x in ("{","}"))):
        raise ValueError("invalid_notification_placeholder")


def render_template(key, language, *, first_name=None, c=None):
    """PT canonical; EN only from the shared approved translation store."""
    title,body=source_copy(key,c)
    if language=="en-GB":
        if c is None:
            raise ValueError("notification_translation_unavailable")
        from content_translations_v2 import resolve
        translated=[]
        for field,source in (("title",title),("body",body)):
            result=resolve(c,entity_kind="notification",entity_id=key,field_path=field,
                           source_text=source,language="en")
            if result["status"]!="approved" or result["language"]!="en":
                raise ValueError("notification_translation_requires_review")
            validate_translation(key,field,result["text"])
            translated.append(result["text"])
        title,body=translated
    elif language!="pt-PT":
        raise ValueError("invalid_recipient_locale")
    if key=="birthday":
        if not isinstance(first_name,str) or not first_name.strip():
            raise ValueError("first_name_required")
        title=title.replace("{first_name}",first_name.strip())
        body=body.replace("{first_name}",first_name.strip())
    return title,body
