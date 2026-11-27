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


def render_template(key, language, *, first_name=None):
    """Resolve an explicit recipient locale; never silently switch language."""
    title, body = TEMPLATES[key][language]
    if key == "birthday":
        if not isinstance(first_name, str) or not first_name.strip():
            raise ValueError("first_name_required")
        title = title.format(first_name=first_name.strip())
    return title, body
