import uuid

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, MessagesState, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import interrupt

from app.ai.prompts import CRITIQUE_PROMPT, FINALIZE_PROMPT, RESEARCH_DIRECTIVE, SUPERVISOR_PROMPT, build_revise_prompt
from app.core.logging import get_logger

logger = get_logger(__name__)

# Nodes whose streamed tokens are the actual reply the user should see.
# supervisor (routing), researcher (information-gathering), and critique
# (self-review) also call the model, but their output is internal -
# forwarding their tokens too would leak "RESEARCH" / mid-investigation
# chatter / the critique's verdict into the visible chat. revise's output
# IS user-facing: chat_service signals the transition with a "self-review"
# status event so a corrected answer doesn't look like it's silently
# replacing the draft that already streamed.
USER_FACING_NODES = {"agent", "finalize", "revise"}

# A hard ceiling on researcher rounds, independent of what the model wants.
# Verified necessary, not theoretical: a real run against Groq's
# llama-3.3-70b-versatile called search_knowledge_base 16 times in a row for
# one question with no natural stopping point, until the accumulated
# message history blew past the provider's tokens-per-minute limit and the
# whole turn errored out. Small/fast models don't reliably self-regulate
# "gather enough, then stop" - this bounds the blast radius regardless.
# Kept low (not just "safe"): Groq's free/on-demand tier caps at 12,000
# TPM, and knowledge-base excerpts are large enough that even 5 rounds of
# accumulated context got close to that ceiling in testing.
_MAX_RESEARCH_ROUNDS = 3


class AgentState(MessagesState):
    # Set once by supervisor, read by execute_tools to know which node to
    # return to afterward - a risky tool call can happen from either agent
    # (direct path) or researcher (multi-step path), and execute_tools
    # itself has no other way to know which one dispatched it.
    mode: str
    research_rounds: int
    # None once critique approves (or hasn't run yet) - a string means
    # "needs a fix", and carries the specific feedback revise acts on.
    critique_feedback: str | None


def is_tool_risky(tool: BaseTool, native_tool_names: set[str]) -> bool:
    """True unless the tool is one of our own, or is an MCP tool explicitly
    confirmed read-only. MCP annotations (readOnlyHint/destructiveHint, per
    the MCP spec) are OPTIONAL - most real-world servers omit them, which
    means an unannotated MCP tool has the exact same empty .metadata as one
    of our own hand-written tools. Telling them apart by metadata alone is
    wrong (that was the previous, broken version of this check) - tool
    provenance (is its name in the native set built by app/ai/tools.py) is
    the only reliable signal, so it's passed in explicitly."""
    if tool.name in native_tool_names:
        return False
    metadata = getattr(tool, "metadata", None) or {}
    return metadata.get("readOnlyHint") is not True


def _stringify_tool_result(result: object) -> str:
    """Native tools return a plain string. MCP tools return a list of
    content blocks (MCP supports text/image/audio in one result) - stringify
    that naively and the model sees Python repr noise like "[{'type':
    'text', 'text': '...', 'id': '...'}]" instead of the actual text."""
    if isinstance(result, list) and all(isinstance(block, dict) and "text" in block for block in result):
        return "\n".join(block["text"] for block in result)
    return str(result)


async def _stream_and_accumulate(model, messages: list, config: RunnableConfig):
    """Runs the model via .astream() rather than .ainvoke() - astream_events
    (used by chat_service.stream_message for token-by-token streaming) only
    emits on_chat_model_stream events for calls that actually go through a
    model's streaming path, and only if the callbacks in `config` are
    forwarded into it. The accumulated final AIMessage is what the rest of
    the graph (tool routing, persistence) uses either way, streaming or not."""
    chunks = None
    async for chunk in model.astream(messages, config):
        chunks = chunk if chunks is None else chunks + chunk
    return chunks


async def _invoke_with_tool_fallback(
    model_with_tools, chat_model: BaseChatModel, messages: list, config: RunnableConfig, user_id: uuid.UUID
):
    """Some providers/models (seen in practice: Groq's llama-3.3-70b-versatile
    once ~15+ tools are bound at once) occasionally can't format a valid tool
    call and reject the request outright. Rather than failing the whole chat
    turn, retry once with tools unbound - the model just answers directly."""
    try:
        return await _stream_and_accumulate(model_with_tools, messages, config)
    except Exception:  # noqa: BLE001
        logger.exception("Tool-bound generation failed for user %s - retrying without tools", user_id)
        return await _stream_and_accumulate(chat_model, messages, config)


def build_graph(
    checkpointer: BaseCheckpointSaver,
    chat_model: BaseChatModel,
    tools: list[BaseTool],
    user_id: uuid.UUID,
    native_tool_names: set[str],
    unattended: bool = False,
) -> CompiledStateGraph:
    """supervisor routes each turn to either agent (direct - simple chat,
    at most a quick tool call) or researcher (a multi-step investigation
    loop for questions that genuinely need it). Both loop through
    execute_tools the same way agent always did; researcher additionally
    hands off to finalize once it stops requesting tools, which turns
    whatever was gathered into one clean answer in Missy's own voice - the
    user never sees the routing decision or the research steps themselves,
    only the final reply (see USER_FACING_NODES). A risky tool call pauses
    the whole run via interrupt() regardless of which path triggered it -
    the checkpointer persists exactly where it stopped, so a later call with
    Command(resume=...) picks the SAME node back up instead of restarting.

    unattended=True (used by scheduled/background runs - see
    app/services/scheduled_task_service.py) skips interrupt() entirely and
    auto-denies every risky tool call instead: there's no human present to
    ever resolve a paused confirmation on an unattended run, so pausing
    would just strand the run forever rather than protect anything."""
    tools_by_name = {t.name: t for t in tools}
    model_with_tools = chat_model.bind_tools(tools)

    async def run_tool(tool_fn: BaseTool, call: dict) -> str:
        try:
            return _stringify_tool_result(await tool_fn.ainvoke(call["args"]))
        except Exception:  # noqa: BLE001 - a broken tool must not fail the whole turn
            logger.exception("Tool '%s' raised during a chat turn for user %s", call["name"], user_id)
            return f"The '{call['name']}' tool failed - answer without it, or tell the user."

    async def supervisor(state: AgentState, config: RunnableConfig) -> dict:
        # Not appended to the persisted message history - this is a routing
        # decision, not conversation content, and the user never sees it.
        classification_messages = [*state["messages"], HumanMessage(content=SUPERVISOR_PROMPT)]
        response = await chat_model.ainvoke(classification_messages, config)
        mode = "researcher" if "RESEARCH" in str(response.content).upper() else "agent"
        return {"mode": mode}

    async def agent(state: AgentState, config: RunnableConfig) -> dict:
        response = await _invoke_with_tool_fallback(model_with_tools, chat_model, state["messages"], config, user_id)
        return {"messages": [response]}

    async def researcher(state: AgentState, config: RunnableConfig) -> dict:
        # The directive is re-added each round (not persisted) - harmless to
        # repeat, and simpler than tracking whether this is the first pass.
        directive_messages = [*state["messages"], HumanMessage(content=RESEARCH_DIRECTIVE)]
        response = await _invoke_with_tool_fallback(model_with_tools, chat_model, directive_messages, config, user_id)
        return {"messages": [response], "research_rounds": state.get("research_rounds", 0) + 1}

    async def finalize(state: AgentState, config: RunnableConfig) -> dict:
        # No tools bound - this step can only write the answer, not gather more.
        directive_messages = [*state["messages"], HumanMessage(content=FINALIZE_PROMPT)]
        response = await _stream_and_accumulate(chat_model, directive_messages, config)
        return {"messages": [response]}

    async def critique(state: AgentState, config: RunnableConfig) -> dict:
        # Self-review only for research-path answers, and only once (see
        # route_after_critique) - not user-facing, not tool-bound, judges
        # the draft against the research gathered above it in the same
        # message list rather than rewriting anything itself.
        review_messages = [*state["messages"], HumanMessage(content=CRITIQUE_PROMPT)]
        response = await chat_model.ainvoke(review_messages, config)
        content = str(response.content).strip()
        if content.upper().startswith("APPROVED"):
            return {"critique_feedback": None}
        feedback = content.split(":", 1)[1].strip() if ":" in content else content
        return {"critique_feedback": feedback or "unspecified issue - please double-check the answer"}

    async def revise(state: AgentState, config: RunnableConfig) -> dict:
        directive_messages = [*state["messages"], HumanMessage(content=build_revise_prompt(state["critique_feedback"]))]
        response = await _stream_and_accumulate(chat_model, directive_messages, config)
        return {"messages": [response]}

    def route_after_supervisor(state: AgentState) -> str:
        return state["mode"]

    def route_after_agent(state: AgentState) -> str:
        last = state["messages"][-1]
        return "execute_tools" if getattr(last, "tool_calls", None) else END

    def route_after_researcher(state: AgentState) -> str:
        last = state["messages"][-1]
        return "execute_tools" if getattr(last, "tool_calls", None) else "finalize"

    def route_after_critique(state: AgentState) -> str:
        return "revise" if state.get("critique_feedback") else END

    def route_after_tools(state: AgentState) -> str:
        # Every tool call issued always gets resolved by execute_tools first
        # (never skipped) - the cap only decides whether researcher gets
        # ANOTHER round after that, so a provider never sees a tool_calls
        # message with no matching result.
        if state["mode"] == "researcher" and state.get("research_rounds", 0) >= _MAX_RESEARCH_ROUNDS:
            return "finalize"
        return state["mode"]

    async def execute_tools(state: AgentState) -> dict:
        last = state["messages"][-1]
        tool_calls = last.tool_calls

        # Pass 1: resolve every approval FIRST, before anything with a side
        # effect runs. LangGraph re-executes this whole node from the top on
        # resume - interrupt() calls replay their cached answer without
        # re-pausing, but a tool invocation is NOT memoized. Interleaving
        # execution with interrupts (the previous, broken version of this
        # loop) meant a tool before the pause point re-ran for real on
        # resume, and a second risky call in the same batch could execute
        # without ever getting its own approval prompt.
        approvals: dict[str, bool] = {}
        for call in tool_calls:
            tool_fn = tools_by_name.get(call["name"])
            if tool_fn is not None and is_tool_risky(tool_fn, native_tool_names):
                if unattended:
                    # No human is present to ever answer an interrupt() on an
                    # unattended run - deny outright instead of pausing forever.
                    approvals[call["id"]] = False
                else:
                    approvals[call["id"]] = interrupt({"tool_name": call["name"], "tool_args": call["args"]})

        # Pass 2: now actually run things - nothing here can trigger another
        # interrupt, so nothing here can be re-entered/re-executed by a resume.
        outputs = []
        for call in tool_calls:
            tool_fn = tools_by_name.get(call["name"])
            if tool_fn is None:
                content = f"Unknown tool: {call['name']}"
            elif call["id"] in approvals and not approvals[call["id"]]:
                if unattended:
                    content = (
                        f"'{call['name']}' requires manual approval and is not available in an unattended "
                        "scheduled run. Do not retry it - mention in your summary that this was skipped."
                    )
                else:
                    content = (
                        f"The user denied permission to run '{call['name']}'. "
                        "Do not retry it - explain that to the user and continue without it."
                    )
            else:
                content = await run_tool(tool_fn, call)
            outputs.append(ToolMessage(content=content, tool_call_id=call["id"], name=call["name"]))
        return {"messages": outputs}

    builder = StateGraph(AgentState)
    builder.add_node("supervisor", supervisor)
    builder.add_node("agent", agent)
    builder.add_node("researcher", researcher)
    builder.add_node("execute_tools", execute_tools)
    builder.add_node("finalize", finalize)
    builder.add_node("critique", critique)
    builder.add_node("revise", revise)
    builder.set_entry_point("supervisor")
    builder.add_conditional_edges("supervisor", route_after_supervisor, {"agent": "agent", "researcher": "researcher"})
    builder.add_conditional_edges("agent", route_after_agent, {"execute_tools": "execute_tools", END: END})
    builder.add_conditional_edges(
        "researcher", route_after_researcher, {"execute_tools": "execute_tools", "finalize": "finalize"}
    )
    builder.add_conditional_edges(
        "execute_tools", route_after_tools, {"agent": "agent", "researcher": "researcher", "finalize": "finalize"}
    )
    # Only the research path gets self-reviewed - agent's direct answers
    # skip straight to END as before, unaffected by critique/revise existing.
    builder.add_edge("finalize", "critique")
    builder.add_conditional_edges("critique", route_after_critique, {"revise": "revise", END: END})
    builder.add_edge("revise", END)  # exactly one revision pass - no loop back to critique
    return builder.compile(checkpointer=checkpointer)
