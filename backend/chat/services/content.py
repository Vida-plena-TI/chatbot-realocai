"""Text helpers that mirror the frontend's src/utils/content.js.

`summarize` and `title_from` must produce what the SPA's mock produces, so the sidebar
looks the same with the real API. Keep them in sync with content.js.
"""

import json
import re

TITLE_MAX_LENGTH = 60
PREVIEW_MAX_LENGTH = 90

# A proposal comes as a ```proposta {json}``` (or ```json```) block inside the answer.
_PROPOSAL_BLOCK = re.compile(r"```(?:proposta|json)\s*\n?([\s\S]*?)```", re.IGNORECASE)
_WHITESPACE = re.compile(r"\s+")


def _one_line(text):
    return _WHITESPACE.sub(" ", text).strip()


def _clip(text, max_length):
    return f"{text[: max_length - 1]}…" if len(text) > max_length else text


def _js_truthy(value):
    if value is None or value is False:
        return False
    if isinstance(value, int | float):
        return value != 0 and value == value  # NaN is falsy
    if isinstance(value, str):
        return value != ""
    return True


def strip_proposal(content):
    """Text of the answer without its proposal block (parseContent().text in content.js).

    The block is removed only when it holds a valid proposal (an object with
    `paciente` and `para`); otherwise the SPA shows it as text, and so do we.
    """
    match = _PROPOSAL_BLOCK.search(content)
    if match:
        try:
            proposal = json.loads(match.group(1))
        except ValueError:
            proposal = None
        if (
            isinstance(proposal, dict)
            and _js_truthy(proposal.get("paciente"))
            and _js_truthy(proposal.get("para"))
        ):
            return content.replace(match.group(0), "", 1).strip()
    return content.strip()


def summarize(content, max_length=PREVIEW_MAX_LENGTH):
    """Sidebar preview: answer without the proposal block, whitespace collapsed, clipped."""
    return _clip(_one_line(strip_proposal(content)), max_length)


def title_from(content, max_length=TITLE_MAX_LENGTH):
    """Automatic conversation title from the first user message."""
    return _clip(_one_line(content), max_length)
