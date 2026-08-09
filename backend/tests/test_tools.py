import ast
import re

import pytest

from app.ai.tools import _safe_eval


def _calc(expression: str) -> str:
    try:
        return str(_safe_eval(ast.parse(expression, mode="eval").body))
    except Exception:
        return "error"


@pytest.mark.parametrize(
    "expression,expected",
    [
        ("2 + 2", "4"),
        ("12 * (7 + 3) / 2", "60.0"),
        ("2 ** 10", "1024"),
        ("-5 + 3", "-2"),
        ("10 % 3", "1"),
    ],
)
def test_calculator_evaluates_arithmetic(expression, expected):
    assert _calc(expression) == expected


@pytest.mark.parametrize(
    "malicious",
    [
        "__import__('os').system('echo pwned')",
        "open('/etc/passwd').read()",
        "[].__class__.__mro__[1].__subclasses__()",
        "1 if True else 2",  # conditional expressions aren't arithmetic either
    ],
)
def test_calculator_rejects_non_arithmetic_input(malicious):
    # The calculator only ever evaluates arithmetic, never arbitrary Python -
    # anything with a function call, attribute access, or name lookup must
    # be rejected rather than silently executed.
    assert _calc(malicious) == "error"


def test_get_current_datetime_returns_recognizable_format():
    from app.ai.tools import build_tools

    class _FakeSession:
        pass

    tools = build_tools(_FakeSession(), user_id=None)
    datetime_tool = next(t for t in tools if t.name == "get_current_datetime")
    result = datetime_tool.invoke({})
    assert re.match(r"^[A-Za-z]+, [A-Za-z]+ \d{1,2}, \d{4}, \d{2}:\d{2} UTC$", result)
