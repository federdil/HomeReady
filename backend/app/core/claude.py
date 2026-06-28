"""
Central Claude API wrapper.
- ask_claude()            → single-turn, returns text
- ask_claude_with_tools() → agentic loop with tool use

Resilience: 30s timeout per call, exponential backoff on overload (up to 3 retries).
"""
import asyncio
import anthropic
from app.core.config import get_settings
from typing import Callable, Any
import structlog

log = structlog.get_logger()
settings = get_settings()

client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 2048
TIMEOUT = 60.0       # seconds per Claude call
MAX_RETRIES = 3
RETRY_DELAYS = [2, 5, 10]  # seconds between retries


class ClaudeError(Exception):
    """Raised when Claude fails after all retries."""
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code
        self.user_message = message


async def _call_with_retry(coro_fn, *args, **kwargs) -> Any:
    """Execute an async Claude API call with timeout and retry on overload."""
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            return await asyncio.wait_for(coro_fn(*args, **kwargs), timeout=TIMEOUT)
        except asyncio.TimeoutError:
            log.warning("claude_timeout", attempt=attempt)
            last_err = ClaudeError("HomeReady is taking longer than usual. Please try again.", 504)
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAYS[attempt])
        except anthropic.RateLimitError:
            log.warning("claude_rate_limit", attempt=attempt)
            last_err = ClaudeError("HomeReady is busy right now. Please try again in a moment.", 429)
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAYS[attempt])
        except anthropic.APIStatusError as e:
            if e.status_code == 529:  # overloaded
                log.warning("claude_overloaded", attempt=attempt)
                last_err = ClaudeError("HomeReady is busy right now. Please try again in a moment.", 503)
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(RETRY_DELAYS[attempt])
            else:
                log.error("claude_api_error", status=e.status_code, error=str(e))
                raise ClaudeError(f"AI service error ({e.status_code}). Please try again.", 502)
        except Exception as e:
            log.error("claude_unexpected_error", error=str(e))
            raise ClaudeError("Something went wrong with the AI service. Please try again.", 500)
    raise last_err


async def ask_claude(
    prompt: str,
    system: str = "",
    max_tokens: int = MAX_TOKENS,
) -> str:
    log.info("claude_request", prompt_length=len(prompt))

    async def _call():
        message = await client.messages.create(
            model=MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text

    return await _call_with_retry(_call)


async def ask_claude_with_document(
    prompt: str,
    document_text: str,
    system: str = "",
    max_tokens: int = MAX_TOKENS,
) -> str:
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
    messages = [{"role": "user", "content": prompt}]

    for iteration in range(max_iterations):
        log.info("agent_iteration", iteration=iteration, message_count=len(messages))

        async def _call():
            return await client.messages.create(
                model=MODEL,
                max_tokens=max_tokens,
                system=system,
                tools=tools,
                messages=messages,
            )

        response = await _call_with_retry(_call)

        if response.stop_reason == "end_turn":
            text_blocks = [b for b in response.content if b.type == "text"]
            return text_blocks[0].text if text_blocks else ""

        tool_use_blocks = [b for b in response.content if b.type == "tool_use"]
        if not tool_use_blocks:
            text_blocks = [b for b in response.content if b.type == "text"]
            return text_blocks[0].text if text_blocks else ""

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

        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

    raise ClaudeError("The AI agent took too many steps. Please try again.", 504)
