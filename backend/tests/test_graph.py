import uuid

import pytest
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.types import Command

from app.ai.graph import _stringify_tool_result, build_graph, is_tool_risky

pytestmark = pytest.mark.anyio


class _FakeTool:
    def __init__(self, name, metadata):
        self.name = name
        self.metadata = metadata


_NATIVE = {"calculator", "get_current_datetime", "search_knowledge_base", "remember_fact"}


def test_stringify_tool_result_flattens_mcp_content_blocks():
    mcp_style = [{"type": "text", "text": "the answer is 42", "id": "abc"}]
    assert _stringify_tool_result(mcp_style) == "the answer is 42"


def test_stringify_tool_result_joins_multiple_blocks():
    mcp_style = [{"type": "text", "text": "line one"}, {"type": "text", "text": "line two"}]
    assert _stringify_tool_result(mcp_style) == "line one\nline two"


def test_stringify_tool_result_passes_through_plain_strings():
    assert _stringify_tool_result("282") == "282"


def test_native_tools_are_never_risky_regardless_of_metadata():
    assert is_tool_risky(_FakeTool("calculator", metadata=None), _NATIVE) is False
    assert is_tool_risky(_FakeTool("calculator", metadata={}), _NATIVE) is False


def test_mcp_tool_explicitly_marked_read_only_is_not_risky():
    tool = _FakeTool("list_directory", metadata={"readOnlyHint": True, "destructiveHint": None})
    assert is_tool_risky(tool, _NATIVE) is False


def test_mcp_tool_marked_destructive_is_risky():
    tool = _FakeTool("write_file", metadata={"readOnlyHint": False, "destructiveHint": True})
    assert is_tool_risky(tool, _NATIVE) is True


def test_mcp_tool_with_hints_present_but_empty_is_treated_as_risky():
    tool = _FakeTool("some_tool", metadata={"readOnlyHint": None, "destructiveHint": None})
    assert is_tool_risky(tool, _NATIVE) is True


def test_mcp_tool_with_no_annotations_at_all_is_treated_as_risky():
    # The actual real-world shape: most MCP servers never set annotations,
    # so langchain-mcp-adapters hands back metadata=None - indistinguishable
    # from a native tool's metadata unless provenance (the native name set)
    # is checked first. This is the exact bypass a prior version of
    # is_tool_risky had: metadata-emptiness alone can't tell these apart.
    tool = _FakeTool("delete_everything", metadata=None)
    assert is_tool_risky(tool, _NATIVE) is True


async def test_two_risky_tool_calls_in_one_batch_each_need_their_own_approval_and_run_once(checkpointer):
    """Regression test for a real bug: execute_tools used to interleave
    interrupt() with actual tool execution in a single pass. LangGraph
    replays the whole node from the top on resume, so a tool call handled
    before the pause point (in an earlier iteration of that same loop) ran
    for real a second time on resume, and a second risky call in the same
    batch could execute without its own approval prompt. The fix collects
    every approval in a first pass, then only executes once all are
    resolved - verified here with real call counters, since a content check
    alone can't tell 'ran once' apart from 'ran twice'."""
    call_counts = {"a": 0, "b": 0}

    @tool
    def risky_a() -> str:
        """Risky A."""
        call_counts["a"] += 1
        return "a done"

    @tool
    def risky_b() -> str:
        """Risky B."""
        call_counts["b"] += 1
        return "b done"

    risky_a.metadata = {"readOnlyHint": False, "destructiveHint": True}
    risky_b.metadata = {"readOnlyHint": False, "destructiveHint": True}

    class _FakeModel(GenericFakeChatModel):
        def bind_tools(self, tools, **kwargs):
            return self

        async def ainvoke(self, messages, config=None, **kwargs):
            return AIMessage(content="DIRECT")  # supervisor's classification call

        async def astream(self, messages, config=None, **kwargs):
            already_called = any(getattr(m, "tool_calls", None) for m in messages)
            if not already_called:
                yield AIMessageChunk(
                    content="",
                    tool_calls=[
                        {"name": "risky_a", "args": {}, "id": "c1"},
                        {"name": "risky_b", "args": {}, "id": "c2"},
                    ],
                )
            else:
                yield AIMessageChunk(content="both done")

    model = _FakeModel(messages=iter([]))
    graph = build_graph(checkpointer, model, [risky_a, risky_b], user_id=None, native_tool_names=set())
    # A real, never-reused UUID - not a fixed string. The checkpoint tables
    # persist across test runs against the same database (unlike the `db`
    # fixture's savepoint rollback), so a fixed thread_id here previously
    # picked up stale completed state from an earlier run and passed for
    # the wrong reason (see: this test failing after a second run).
    config = {"configurable": {"thread_id": str(uuid.uuid4())}}

    result1 = await graph.ainvoke({"messages": [HumanMessage(content="go")]}, config=config)
    assert result1.get("__interrupt__")  # paused on the first risky call
    assert call_counts == {"a": 0, "b": 0}

    result2 = await graph.ainvoke(Command(resume=True), config=config)
    # Still paused - the second risky call needs its OWN approval before
    # anything executes. This is the key assertion: neither tool has run yet.
    assert result2.get("__interrupt__")
    assert call_counts == {"a": 0, "b": 0}

    result3 = await graph.ainvoke(Command(resume=True), config=config)
    assert not result3.get("__interrupt__")
    assert call_counts == {"a": 1, "b": 1}  # each ran exactly once, not twice


async def test_unattended_run_auto_denies_a_risky_tool_without_ever_pausing(checkpointer):
    """Scheduled/background runs (app/services/scheduled_task_service.py)
    have nobody present to ever answer an interrupt() - unattended=True must
    resolve a risky call to denied and keep running to completion in a
    single ainvoke, never pausing."""
    call_count = {"n": 0}

    @tool
    def risky() -> str:
        """Risky."""
        call_count["n"] += 1
        return "done"

    risky.metadata = {"readOnlyHint": False, "destructiveHint": True}

    class _FakeModel(GenericFakeChatModel):
        def bind_tools(self, tools, **kwargs):
            return self

        async def ainvoke(self, messages, config=None, **kwargs):
            return AIMessage(content="DIRECT")

        async def astream(self, messages, config=None, **kwargs):
            already_called = any(getattr(m, "tool_calls", None) for m in messages)
            if not already_called:
                yield AIMessageChunk(content="", tool_calls=[{"name": "risky", "args": {}, "id": "c1"}])
            else:
                yield AIMessageChunk(content="done without it")

    model = _FakeModel(messages=iter([]))
    graph = build_graph(checkpointer, model, [risky], user_id=None, native_tool_names=set(), unattended=True)
    config = {"configurable": {"thread_id": str(uuid.uuid4())}}

    result = await graph.ainvoke({"messages": [HumanMessage(content="go")]}, config=config)

    assert not result.get("__interrupt__")  # never paused
    assert call_count["n"] == 0  # the risky tool itself never ran
    denial = next(m for m in result["messages"] if isinstance(m, ToolMessage))
    assert "unattended" in denial.content


async def test_supervisor_routes_a_complex_request_through_researcher_then_finalize(checkpointer):
    """The multi-agent split: supervisor classifies the request, researcher
    loops through tools to gather information, and only finalize's answer
    (not researcher's intermediate steps) becomes the reply."""

    @tool
    def lookup(query: str) -> str:
        """Look something up."""
        return "found: 42"

    class _FakeModel(GenericFakeChatModel):
        def bind_tools(self, tools, **kwargs):
            return self

        async def ainvoke(self, messages, config=None, **kwargs):
            # Both supervisor and critique call ainvoke (not astream) -
            # distinguished by the injected directive text, same as astream below.
            last_content = str(messages[-1].content) if messages else ""
            if "Critique step" in last_content:
                return AIMessage(content="APPROVED")
            return AIMessage(content="RESEARCH")  # supervisor's classification call

        async def astream(self, messages, config=None, **kwargs):
            # Distinguished by the injected directive text, not call order -
            # researcher and finalize both call astream, possibly more than once.
            last_content = str(messages[-1].content) if messages else ""
            if "Final answer step" in last_content:
                yield AIMessageChunk(content="Final synthesized answer: 42.")
                return
            already_called_tool = any(isinstance(m, ToolMessage) for m in messages)
            if not already_called_tool:
                yield AIMessageChunk(content="", tool_calls=[{"name": "lookup", "args": {"query": "x"}, "id": "c1"}])
            else:
                yield AIMessageChunk(content="")  # no more tools needed - route to finalize

    model = _FakeModel(messages=iter([]))
    graph = build_graph(checkpointer, model, [lookup], user_id=None, native_tool_names={"lookup"})
    config = {"configurable": {"thread_id": str(uuid.uuid4())}}

    result = await graph.ainvoke({"messages": [HumanMessage(content="do deep research on X")]}, config=config)

    assert not result.get("__interrupt__")  # lookup is native/safe - no confirmation needed
    assert result["mode"] == "researcher"  # supervisor routed to the multi-step path
    tool_messages = [m for m in result["messages"] if isinstance(m, ToolMessage)]
    assert len(tool_messages) == 1
    assert tool_messages[0].content == "found: 42"
    assert result["messages"][-1].content == "Final synthesized answer: 42."


async def test_critique_can_trigger_exactly_one_revision_pass(checkpointer):
    """Reflection/self-correction: a flawed draft gets caught and fixed once
    - no loop back to critique after revise, matching the agreed scope
    (research path only, single revision pass, no repeat of the runaway-loop
    mistake from the researcher round cap)."""

    @tool
    def lookup(query: str) -> str:
        """Look something up."""
        return "found: 42"

    class _FakeModel(GenericFakeChatModel):
        def bind_tools(self, tools, **kwargs):
            return self

        async def ainvoke(self, messages, config=None, **kwargs):
            last_content = str(messages[-1].content) if messages else ""
            if "Critique step" in last_content:
                return AIMessage(content="REVISE: the answer never actually states the number found")
            return AIMessage(content="RESEARCH")  # supervisor

        async def astream(self, messages, config=None, **kwargs):
            last_content = str(messages[-1].content) if messages else ""
            if "Revision step" in last_content:
                assert "never actually states the number" in last_content  # feedback was passed through
                yield AIMessageChunk(content="The corrected answer is 42.")
                return
            if "Final answer step" in last_content:
                yield AIMessageChunk(content="Here is a vague answer.")  # the flawed draft
                return
            already_called_tool = any(isinstance(m, ToolMessage) for m in messages)
            if not already_called_tool:
                yield AIMessageChunk(content="", tool_calls=[{"name": "lookup", "args": {"query": "x"}, "id": "c1"}])
            else:
                yield AIMessageChunk(content="")

    model = _FakeModel(messages=iter([]))
    graph = build_graph(checkpointer, model, [lookup], user_id=None, native_tool_names={"lookup"})
    config = {"configurable": {"thread_id": str(uuid.uuid4())}}

    result = await graph.ainvoke({"messages": [HumanMessage(content="do deep research on X")]}, config=config)

    assert result["critique_feedback"] == "the answer never actually states the number found"
    # The flawed draft is still in history (transparency - the user sees the
    # correction happen), but the LAST message - what actually gets
    # persisted as the reply - is the revised, corrected one.
    contents = [m.content for m in result["messages"] if isinstance(m, AIMessage) and m.content]
    assert "Here is a vague answer." in contents
    assert result["messages"][-1].content == "The corrected answer is 42."
