from jinja2 import Template


def pull_prompt_with_fallback(name: str, fallback_template: str, kwargs: dict | None = None) -> str:
    """Render a prompt template.

    Two template styles coexist in ``dbgpt_analyst.prompts``: plain ``str.format``
    (single braces, ``{{`` used as an escaped literal brace) and Jinja2. ``{%`` only
    ever appears in Jinja templates, so it is the unambiguous discriminator — ``{{``
    alone is not (``insight_prompt`` uses it as an escaped brace).
    """
    kwargs = kwargs or {}
    if "{%" in fallback_template:
        return Template(fallback_template).render(**kwargs)
    return fallback_template.format(**kwargs)
