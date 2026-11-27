"""Draft bilingual templates for manually initiated notifications.

The approved Portuguese wording for game, weight, birthday and activation
is preserved. Other copy and English translations remain subject to review.
No sending, language lookup or scheduling is performed here.
"""
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


def source_rows():
    """Canonical PT templates and review-only EN suggestions."""
    return [{"id":key,"title":copies["pt-PT"][0],"body":copies["pt-PT"][1],
             "title_en":copies["en-GB"][0],"body_en":copies["en-GB"][1]}
            for key,copies in TEMPLATES.items()]


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
    title,body=TEMPLATES[key]["pt-PT"]
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
