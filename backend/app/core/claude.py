"""
Central Claude API wrapper.
Two modes:
  - ask_claude()            → single-turn, returns text
  - ask_claude_with_tools() → agentic loop with tool use
"""
import anthropic
from app.core.config import get_settings
from typing import Callable, Any
import structlog

log = structlog.get_logger()
settings = get_settings()

client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 2048


async def ask_claude(
    prompt: str,
    system: str = "",
    max_tokens: int = MAX_TOKENS,
) -> str:
    """Single-turn Claude call. Returns text response."""
    log.info("claude_request", prompt_length=len(prompt))
    message = await client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


async def ask_claude_with_document(
    prompt: str,
    document_text: str,
    system: str = "",
    max_tokens: int = MAX_TOKENS,
) -> str:
    """Claude call with a large document injected into context."""
    full_prompt = f"""<document>
{document_text}
</document>

{prompt}"""
    return await ask_claude(full_prompt, system=system, max_tokens=max_tokens)


async def ask_claude_with_tools(
    prompt: str,
    tools: list[dict],
    tool_handlers: dict[str, Callable[..., Any]],
    system: str = "",
    max_tokens: int = MAX_TOKENS,
    max_iterations: int = 8,
) -> str:
    """
    Agentic Claude loop with tool use.

    Claude decides which tools to call and when.
    Each tool result is fed back until Claude signals end_turn.

    Args:
        prompt:         The user's request.
        tools:          List of Anthropic tool definition dicts.
        tool_handlers:  Mapping of tool name → async Python function.
        system:         System prompt.
        max_tokens:     Max tokens per Claude response.
        max_iterations: Safety cap — prevents infinite tool loops.

    Returns:
        Claude's final text response after all tool calls complete.
    """
    messages = [{"role": "user", "content": prompt}]

    for iteration in range(max_iterations):
        log.info("agent_iteration", iteration=iteration, message_count=len(messages))

        response = await client.messages.create(
            model=MODEL,
            max_tokens=max_tokens,
            system=system,
            tools=tools,
            messages=messages,
        )

        # Claude is done — return the final text
        if response.stop_reason == "end_turn":
            text_blocks = [b for b in response.content if b.type == "text"]
            return text_blocks[0].text if text_blocks else ""

        # Claude wants to use tools — collect all tool_use blocks
        tool_use_blocks = [b for b in response.content if b.type == "tool_use"]
        if not tool_use_blocks:
            # No tool calls and no end_turn — unexpected, return what we have
            text_blocks = [b for b in response.content if b.type == "text"]
            return text_blocks[0].text if text_blocks else ""

        # Execute each tool call (in parallel where possible)
        tool_results = []
        for block in tool_use_blocks:
            tool_name = block.name
            tool_input = block.input
            log.info("tool_call", tool=tool_name, input=tool_input)

            if tool_name not in tool_handlers:
                result = f"Error: tool '{tool_name}' not registered."
            else:
                try:
                    result = await tool_handlers[tool_name](**tool_input)
                    result = str(result)
                except Exception as e:
                    result = f"Tool error: {str(e)}"
                    log.error("tool_error", tool=tool_name, error=str(e))

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": result,
            })

        # Append assistant turn + tool results and continue loop
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

    raise RuntimeError(f"Agent exceeded max_iterations ({max_iterations})")
