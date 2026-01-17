import io
import json
from pyexpat.errors import messages
import time
import random

import logging
import os
import sys
import threading
from collections import defaultdict
from collections.abc import Callable
from datetime import datetime
from typing import (
    Any,
    Final,
    Literal,
    TextIO,
    TypedDict,
    cast,
)

from dotenv import load_dotenv
from litellm.types.utils import ChatCompletionDeltaToolCall
from pydantic import BaseModel, Field

from crewai.events.event_bus import crewai_event_bus
from crewai.events.types.llm_events import (
    LLMCallCompletedEvent,
    LLMCallFailedEvent,
    LLMCallStartedEvent,
    LLMCallType,
    LLMStreamChunkEvent,
)
from crewai.events.types.tool_usage_events import (
    ToolUsageErrorEvent,
    ToolUsageFinishedEvent,
    ToolUsageStartedEvent,
)
from crewai.llms.base_llm import BaseLLM
from crewai.utilities.exceptions.context_window_exceeding_exception import (
    LLMContextLengthExceededError,
)
from crewai.utilities.logger_utils import suppress_warnings

with suppress_warnings():
    import litellm
    from litellm import Choices, CustomLogger
    from litellm.exceptions import ContextWindowExceededError
    from litellm.litellm_core_utils.get_supported_openai_params import (
        get_supported_openai_params,
    )
    from litellm.types.utils import ModelResponse
    from litellm.utils import supports_response_schema

import re
from itertools import cycle

# Configurações de retry
MAX_RETRIES = 6
INITIAL_DELAY = 1  # segundos
BACKOFF_FACTOR = 2
MAX_DELAY = 60  # segundos (1 minuto)

# --- Rate limiting / noisy logging controls ---
HTTPX_LOG_LEVEL = os.getenv("HTTPX_LOG_LEVEL", "WARNING").upper()
logging.getLogger("httpx").setLevel(getattr(logging, HTTPX_LOG_LEVEL, logging.WARNING))
logging.getLogger("httpcore").setLevel(getattr(logging, HTTPX_LOG_LEVEL, logging.WARNING))
logger = logging.getLogger(__name__)

LLM_MAX_CONCURRENCY = int(os.getenv("LLM_MAX_CONCURRENCY", "1") or "1")
_LLM_SEMAPHORE = threading.Semaphore(max(1, LLM_MAX_CONCURRENCY))
RETRY_JITTER = float(os.getenv("LLM_RETRY_JITTER", "0.25") or "0.25")  # +0% to +25% jitter

def _is_rate_limit_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return ("429" in msg) or ("too many requests" in msg) or ("rate limit" in msg)

def _is_timeout_or_network_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return (
        "timeout" in msg
        or "timed out" in msg
        or "connection" in msg
        or "temporarily unavailable" in msg
        or "service unavailable" in msg
        or "502" in msg
        or "503" in msg
        or "504" in msg
    )

def _sleep_backoff(attempt: int) -> None:
    base = min(INITIAL_DELAY * (BACKOFF_FACTOR ** attempt), MAX_DELAY)
    jitter = 1.0 + (random.random() * max(0.0, RETRY_JITTER))
    time.sleep(base * jitter)

load_dotenv()
litellm.suppress_debug_info = True


class FilteredStream(io.TextIOBase):
    _lock = None

    def __init__(self, original_stream: TextIO):
        self._original_stream = original_stream
        self._lock = threading.Lock()

    def write(self, s: str) -> int:
        if not self._lock:
            self._lock = threading.Lock()

        with self._lock:
            lower_s = s.lower()

            # Skip common noisy LiteLLM banners and any other lines that contain "litellm"
            if (
                "litellm.info:" in lower_s
                or "consider using a smaller input" in lower_s
                or "detailed execution traces" in lower_s
                or "would you like to view your execution traces" in lower_s
            ):
                return 0

            return self._original_stream.write(s)

    def flush(self):
        with self._lock:
            return self._original_stream.flush()

    def __getattr__(self, name):
        return getattr(self._original_stream, name)

    @property
    def encoding(self):
        return getattr(self._original_stream, "encoding", "utf-8")

    def isatty(self):
        return self._original_stream.isatty()

    def fileno(self):
        return self._original_stream.fileno()

    def writable(self):
        return True


# Apply filtered stream (idempotent)
if not isinstance(sys.stdout, FilteredStream):
    sys.stdout = FilteredStream(sys.stdout)
if not isinstance(sys.stderr, FilteredStream):
    sys.stderr = FilteredStream(sys.stderr)


MIN_CONTEXT: Final[int] = 1024
MAX_CONTEXT: Final[int] = 2097152  # Current max from gemini-1.5-pro
ANTHROPIC_PREFIXES: Final[tuple[str, str, str]] = ("anthropic/", "claude-", "claude/")

LLM_CONTEXT_WINDOW_SIZES: Final[dict[str, int]] = {
    # openai
    "gpt-4": 8192,
    "gpt-4o": 128000,
    "gpt-4o-mini": 200000,
    "gpt-4-turbo": 128000,
    "gpt-4.1": 1047576,
    "gpt-4.1-mini-2025-04-14": 1047576,
    "gpt-4.1-nano-2025-04-14": 1047576,
    "o1-preview": 128000,
    "o1-mini": 128000,
    "o3-mini": 200000,
    "o4-mini": 200000,
    # gemini
    "gemini-2.0-flash": 1048576,
    "gemini-2.0-flash-thinking-exp-01-21": 32768,
    "gemini-2.0-flash-lite-001": 1048576,
    "gemini-2.0-flash-001": 1048576,
    "gemini-2.5-flash": 1048576,
    "gemini-2.5-pro-exp-03-25": 1048576,
    "gemini-1.5-pro": 2097152,
    "gemini-1.5-flash": 1048576,
    "gemini-1.5-flash-8b": 1048576,
    "gemini/gemma-3-1b-it": 32000,
    "gemini/gemma-3-4b-it": 128000,
    "gemini/gemma-3-12b-it": 128000,
    "gemini/gemma-3-27b-it": 128000,
    # deepseek
    "deepseek-chat": 128000,
    # groq
    "gemma2-9b-it": 8192,
    "gemma-7b-it": 8192,
    "llama3-groq-70b-8192-tool-use-preview": 8192,
    "llama3-groq-8b-8192-tool-use-preview": 8192,
    "llama-3.1-70b-versatile": 131072,
    "llama-3.1-8b-instant": 131072,
    "llama-3.2-1b-preview": 8192,
    "llama-3.2-3b-preview": 8192,
    "llama-3.2-11b-text-preview": 8192,
    "llama-3.2-90b-text-preview": 8192,
    "llama3-70b-8192": 8192,
    "llama3-8b-8192": 8192,
    "mixtral-8x7b-32768": 32768,
    "llama-3.3-70b-versatile": 128000,
    "llama-3.3-70b-instruct": 128000,
    # sambanova
    "Meta-Llama-3.3-70B-Instruct": 131072,
    "QwQ-32B-Preview": 8192,
    "Qwen2.5-72B-Instruct": 8192,
    "Qwen2.5-Coder-32B-Instruct": 8192,
    "Meta-Llama-3.1-405B-Instruct": 8192,
    "Meta-Llama-3.1-70B-Instruct": 131072,
    "Meta-Llama-3.1-8B-Instruct": 131072,
    "Llama-3.2-90B-Vision-Instruct": 16384,
    "Llama-3.2-11B-Vision-Instruct": 16384,
    "Meta-Llama-3.2-3B-Instruct": 4096,
    "Meta-Llama-3.2-1B-Instruct": 16384,
    # bedrock (etc...)
    "us.amazon.nova-pro-v1:0": 300000,
    "us.amazon.nova-micro-v1:0": 128000,
    "us.amazon.nova-lite-v1:0": 300000,
    "us.anthropic.claude-3-5-sonnet-20240620-v1:0": 200000,
    "us.anthropic.claude-3-5-haiku-20241022-v1:0": 200000,
    "us.anthropic.claude-3-5-sonnet-20241022-v2:0": 200000,
    "us.anthropic.claude-3-7-sonnet-20250219-v1:0": 200000,
    "us.anthropic.claude-3-sonnet-20240229-v1:0": 200000,
    "us.anthropic.claude-3-opus-20240229-v1:0": 200000,
    "us.anthropic.claude-3-haiku-20240307-v1:0": 200000,
    "us.meta.llama3-2-11b-instruct-v1:0": 128000,
    "us.meta.llama3-2-3b-instruct-v1:0": 131000,
    "us.meta.llama3-2-90b-instruct-v1:0": 128000,
    "us.meta.llama3-2-1b-instruct-v1:0": 131000,
    "us.meta.llama3-1-8b-instruct-v1:0": 128000,
    "us.meta.llama3-1-70b-instruct-v1:0": 128000,
    "us.meta.llama3-3-70b-instruct-v1:0": 128000,
    "us.meta.llama3-1-405b-instruct-v1:0": 128000,
    "eu.anthropic.claude-3-5-sonnet-20240620-v1:0": 200000,
    "eu.anthropic.claude-3-sonnet-20240229-v1:0": 200000,
    "eu.anthropic.claude-3-haiku-20240307-v1:0": 200000,
    "eu.meta.llama3-2-3b-instruct-v1:0": 131000,
    "eu.meta.llama3-2-1b-instruct-v1:0": 131000,
    "apac.anthropic.claude-3-5-sonnet-20240620-v1:0": 200000,
    "apac.anthropic.claude-3-5-sonnet-20241022-v2:0": 200000,
    "apac.anthropic.claude-3-sonnet-20240229-v1:0": 200000,
    "apac.anthropic.claude-3-haiku-20240307-v1:0": 200000,
    "amazon.nova-pro-v1:0": 300000,
    "amazon.nova-micro-v1:0": 128000,
    "amazon.nova-lite-v1:0": 300000,
    "anthropic.claude-3-5-sonnet-20240620-v1:0": 200000,
    "anthropic.claude-3-5-haiku-20241022-v1:0": 200000,
    "anthropic.claude-3-5-sonnet-20241022-v2:0": 200000,
    "anthropic.claude-3-7-sonnet-20250219-v1:0": 200000,
    "anthropic.claude-3-sonnet-20240229-v1:0": 200000,
    "anthropic.claude-3-opus-20240229-v1:0": 200000,
    "anthropic.claude-3-haiku-20240307-v1:0": 200000,
    "anthropic.claude-v2:1": 200000,
    "anthropic.claude-v2": 100000,
    "anthropic.claude-instant-v1": 100000,
    "meta.llama3-1-405b-instruct-v1:0": 128000,
    "meta.llama3-1-70b-instruct-v1:0": 128000,
    "meta.llama3-1-8b-instruct-v1:0": 128000,
    "meta.llama3-70b-instruct-v1:0": 8000,
    "meta.llama3-8b-instruct-v1:0": 8000,
    "amazon.titan-text-lite-v1": 4000,
    "amazon.titan-text-express-v1": 8000,
    "cohere.command-text-v14": 4000,
    "ai21.j2-mid-v1": 8191,
    "ai21.j2-ultra-v1": 8191,
    "ai21.jamba-instruct-v1:0": 256000,
    "mistral.mistral-7b-instruct-v0:2": 32000,
    "mistral.mixtral-8x7b-instruct-v0:1": 32000,
    # mistral
    "mistral-tiny": 32768,
    "mistral-small-latest": 32768,
    "mistral-medium-latest": 32768,
    "mistral-large-latest": 32768,
    "mistral-large-2407": 32768,
    "mistral-large-2402": 32768,
    "mistral/mistral-tiny": 32768,
    "mistral/mistral-small-latest": 32768,
    "mistral/mistral-medium-latest": 32768,
    "mistral/mistral-large-latest": 32768,
    "mistral/mistral-large-2407": 32768,
    "mistral/mistral-large-2402": 32768,
}

DEFAULT_CONTEXT_WINDOW_SIZE: Final[int] = 8192
CONTEXT_WINDOW_USAGE_RATIO: Final[float] = 0.85


class Delta(TypedDict):
    content: str | None
    role: str | None


class StreamingChoices(TypedDict):
    delta: Delta
    index: int
    finish_reason: str | None


class FunctionArgs(BaseModel):
    name: str = ""
    arguments: str = ""


class AccumulatedToolArgs(BaseModel):
    function: FunctionArgs = Field(default_factory=FunctionArgs)


class DeepSeekLLM(BaseLLM):
    completion_cost: float | None = None

    def __init__(
        self,
        model: str,
        timeout: float | int | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        n: int | None = None,
        stop: str | list[str] | None = None,
        max_completion_tokens: int | None = None,
        max_tokens: int | None = None,
        presence_penalty: float | None = None,
        frequency_penalty: float | None = None,
        logit_bias: dict[int, float] | None = None,
        response_format: type[BaseModel] | None = None,
        seed: int | None = None,
        logprobs: int | None = None,
        top_logprobs: int | None = None,
        base_url: str | None = None,
        api_base: str | None = None,
        api_version: str | None = None,
        api_key: str | list[str] | tuple[str, ...] | None = None,
        callbacks: list[Any] | None = None,
        reasoning_effort: Literal["none", "low", "medium", "high"] | None = None,
        stream: bool = False,
        **kwargs,
    ):
        self.model = model
        self.timeout = timeout
        self.temperature = temperature
        self.top_p = top_p
        self.n = n
        self.max_completion_tokens = max_completion_tokens
        self.max_tokens = max_tokens
        self.presence_penalty = presence_penalty
        self.frequency_penalty = frequency_penalty
        self.logit_bias = logit_bias
        self.response_format = response_format
        self.seed = seed
        self.logprobs = logprobs
        self.top_logprobs = top_logprobs
        self.base_url = base_url
        self.api_base = api_base
        self.api_version = api_version

        # IMPORTANT FIX:
        # If api_key is a string, cycling over it cycles characters (BAD).
        # Normalize to a list of keys.
        self.api_key = api_key
        keys: list[str] = []
        if api_key is None:
            keys = [""]
        elif isinstance(api_key, str):
            keys = [api_key]
        elif isinstance(api_key, (list, tuple)):
            keys = [k for k in api_key if isinstance(k, str) and k.strip()]
            if not keys:
                keys = [""]
        else:
            keys = [""]

        self._api_key_cycle = cycle(keys)

        self.callbacks = callbacks
        self.context_window_size = 0
        self.reasoning_effort = reasoning_effort
        self.additional_params = kwargs
        self.is_anthropic = self._is_anthropic_model(model)
        self.stream = stream

        litellm.drop_params = True

        # Normalize self.stop to always be a List[str]
        if stop is None:
            self.stop: list[str] = []
        elif isinstance(stop, str):
            self.stop = [stop]
        else:
            self.stop = stop

        self.set_callbacks(callbacks or [])
        self.set_env_callbacks()

    @staticmethod
    def _is_anthropic_model(model: str) -> bool:
        return any(prefix in model.lower() for prefix in ANTHROPIC_PREFIXES)

    def _get_next_api_key(self) -> str:
        return next(self._api_key_cycle)

    def _prepare_completion_params(
        self,
        messages: str | list[dict[str, str]],
        tools: list[dict] | None = None,
    ) -> dict[str, Any]:
        if isinstance(messages, str):
            messages = [{"role": "user", "content": messages}]
        formatted_messages = self._format_messages_for_provider(messages)

        model_lower = (self.model or "").lower()
        is_gemini = model_lower.startswith("gemini-") or model_lower.startswith("gemini/")

        reasoning_effort = self.reasoning_effort

        # LiteLLM Gemini/Vertex mapping does NOT accept "none".
        # Use "disable" to turn off thinking (thinking budget = 0).
        if is_gemini:
            if reasoning_effort is None:
                reasoning_effort = "disable"
            elif reasoning_effort == "none":
                reasoning_effort = "disable"
        else:
            # For non-Gemini providers, "none" should simply be omitted
            if reasoning_effort == "none":
                reasoning_effort = None

        params = {
            "model": self.model,
            "messages": formatted_messages,
            "timeout": self.timeout,
            "temperature": self.temperature,
            "top_p": self.top_p,
            "n": self.n,
            "stop": self.stop,
            "max_tokens": self.max_tokens or self.max_completion_tokens,
            "presence_penalty": self.presence_penalty,
            "frequency_penalty": self.frequency_penalty,
            "logit_bias": self.logit_bias,
            "response_format": self.response_format,
            "seed": self.seed,
            "logprobs": self.logprobs,
            "top_logprobs": self.top_logprobs,
            "api_base": self.api_base,
            "base_url": self.base_url,
            "api_version": self.api_version,
            "api_key": self._get_next_api_key(),
            "stream": self.stream,
            "tools": tools,
            "reasoning_effort": reasoning_effort,
            **self.additional_params,
        }

        return {k: v for k, v in params.items() if v is not None}


    def execute_with_retry(self, params: dict[str, Any]):
        last_exc: Exception | None = None

        for attempt in range(MAX_RETRIES + 1):
            try:
                with _LLM_SEMAPHORE:
                    response = litellm.completion(**params)

                # Basic content sanity check (helps catch weird empty responses)
                content = cast(Choices, cast(ModelResponse, response).choices)[0].message.content
                content_str = (content or "").strip()

                if not content_str:
                    raise ValueError("Invalid response from LLM call - empty content.")

                return response

            except Exception as e:
                last_exc = e

                # Only retry for rate limit or transient network/timeouts
                if _is_rate_limit_error(e) or _is_timeout_or_network_error(e):
                    if attempt >= MAX_RETRIES:
                        break
                    logger.warning("LLM call failed (attempt %s/%s): %s", attempt + 1, MAX_RETRIES + 1, str(e))
                    _sleep_backoff(attempt)
                    continue

                # Not retryable -> fail immediately
                raise

        raise RuntimeError(f"LLM call failed after retries: {last_exc}") from last_exc

    def _handle_non_streaming_response(
        self,
        params: dict[str, Any],
        callbacks: list[Any] | None = None,
        available_functions: dict[str, Any] | None = None,
        from_task: Any | None = None,
        from_agent: Any | None = None,
    ) -> str | Any:
        try:
            response = self.execute_with_retry(params)
        except ContextWindowExceededError as e:
            raise LLMContextLengthExceededError(str(e)) from e

        response_message = cast(Choices, cast(ModelResponse, response).choices)[0].message
        text_response = response_message.content or ""

        if callbacks and len(callbacks) > 0:
            for callback in callbacks:
                if hasattr(callback, "log_success_event"):
                    usage_info = getattr(response, "usage", None)
                    if usage_info:
                        callback.log_success_event(
                            kwargs=params,
                            response_obj={"usage": usage_info},
                            start_time=0,
                            end_time=0,
                        )

        tool_calls = getattr(response_message, "tool_calls", [])
        if self._get_custom_llm_provider() == "deepseek":
            text_response = self.deepseek_process_string(text_response)

        if (not tool_calls or not available_functions) and text_response:
            self._handle_emit_call_events(
                response=text_response,
                call_type=LLMCallType.LLM_CALL,
                from_task=from_task,
                from_agent=from_agent,
                messages=params["messages"],
            )
            return text_response

        if tool_calls and not available_functions and not text_response:
            return tool_calls

        tool_result = self._handle_tool_call(tool_calls, available_functions, from_task, from_agent)
        if tool_result is not None:
            return tool_result

        self._handle_emit_call_events(
            response=text_response,
            call_type=LLMCallType.LLM_CALL,
            from_task=from_task,
            from_agent=from_agent,
            messages=params["messages"],
        )
        return text_response

    def _handle_streaming_response(
        self,
        params: dict[str, Any],
        callbacks: list[Any] | None = None,
        available_functions: dict[str, Any] | None = None,
        from_task: Any | None = None,
        from_agent: Any | None = None,
    ) -> str:
        full_response = ""
        last_chunk = None
        chunk_count = 0
        usage_info = None

        accumulated_tool_args: defaultdict[int, AccumulatedToolArgs] = defaultdict(AccumulatedToolArgs)

        params["stream"] = True
        params["stream_options"] = {"include_usage": True}

        try:
            with _LLM_SEMAPHORE:
                for chunk in litellm.completion(**params):
                    chunk_count += 1
                    last_chunk = chunk

                    chunk_content = None
                    try:
                        choices = None
                        if isinstance(chunk, dict) and "choices" in chunk:
                            choices = chunk["choices"]
                        elif hasattr(chunk, "choices") and not isinstance(chunk.choices, type):
                            choices = chunk.choices

                        if isinstance(chunk, dict) and "usage" in chunk:
                            usage_info = chunk["usage"]
                        elif hasattr(chunk, "usage") and not isinstance(chunk.usage, type):
                            usage_info = chunk.usage

                        if choices and len(choices) > 0:
                            choice = choices[0]

                            delta = None
                            if isinstance(choice, dict) and "delta" in choice:
                                delta = choice["delta"]
                            elif hasattr(choice, "delta"):
                                delta = choice.delta

                            if delta:
                                if isinstance(delta, dict):
                                    if "content" in delta and delta["content"] is not None:
                                        chunk_content = delta["content"]
                                    else:
                                        chunk_content = ""
                                elif hasattr(delta, "content"):
                                    chunk_content = delta.content or ""

                                if isinstance(delta, dict) and "tool_calls" in delta and delta["tool_calls"]:
                                    result = self._handle_streaming_tool_calls(
                                        tool_calls=delta["tool_calls"],
                                        accumulated_tool_args=accumulated_tool_args,
                                        available_functions=available_functions,
                                        from_task=from_task,
                                        from_agent=from_agent,
                                    )
                                    if result is not None:
                                        chunk_content = result

                    except Exception as e:
                        logging.debug(f"Error extracting content from chunk: {e}")

                    if chunk_content is not None:
                        full_response += chunk_content
                        if not hasattr(crewai_event_bus, "emit"):
                            raise Exception("crewai_event_bus must have an `emit` method")

                        crewai_event_bus.emit(
                            self,
                            event=LLMStreamChunkEvent(
                                chunk=chunk_content,
                                from_task=from_task,
                                from_agent=from_agent,
                            ),
                        )

            if not full_response.strip() and chunk_count == 0:
                logging.warning("No chunks received in streaming response, falling back to non-streaming")
                non_streaming_params = params.copy()
                non_streaming_params["stream"] = False
                non_streaming_params.pop("stream_options", None)
                return self._handle_non_streaming_response(
                    non_streaming_params,
                    callbacks,
                    available_functions,
                    from_task,
                    from_agent,
                )

            if not full_response.strip() and len(accumulated_tool_args) == 0:
                raise Exception("No content received from streaming response.")

            tool_calls = None
            try:
                if last_chunk:
                    choices = None
                    if isinstance(last_chunk, dict) and "choices" in last_chunk:
                        choices = last_chunk["choices"]
                    elif hasattr(last_chunk, "choices") and not isinstance(last_chunk.choices, type):
                        choices = last_chunk.choices

                    if choices and len(choices) > 0:
                        choice = choices[0]
                        message = None
                        if isinstance(choice, dict) and "message" in choice:
                            message = choice["message"]
                        elif hasattr(choice, "message"):
                            message = choice.message

                        if message:
                            if isinstance(message, dict) and "tool_calls" in message:
                                tool_calls = message["tool_calls"]
                            elif hasattr(message, "tool_calls"):
                                tool_calls = message.tool_calls
            except Exception:
                pass

            if not tool_calls or not available_functions:
                self._handle_streaming_callbacks(callbacks, usage_info, last_chunk)
                self._handle_emit_call_events(
                    response=full_response,
                    call_type=LLMCallType.LLM_CALL,
                    from_task=from_task,
                    from_agent=from_agent,
                    messages=params["messages"],
                )
                return full_response

            tool_result = self._handle_tool_call(tool_calls, available_functions)
            if tool_result is not None:
                return tool_result

            self._handle_streaming_callbacks(callbacks, usage_info, last_chunk)
            self._handle_emit_call_events(
                response=full_response,
                call_type=LLMCallType.LLM_CALL,
                from_task=from_task,
                from_agent=from_agent,
                messages=params["messages"],
            )
            return full_response

        except ContextWindowExceededError as e:
            raise LLMContextLengthExceededError(str(e)) from e
        except Exception as e:
            logging.error(f"Error in streaming response: {e!s}")
            if full_response.strip():
                logging.warning(f"Returning partial response despite error: {e!s}")
                self._handle_emit_call_events(
                    response=full_response,
                    call_type=LLMCallType.LLM_CALL,
                    from_task=from_task,
                    from_agent=from_agent,
                    messages=params["messages"],
                )
                return full_response

            if not hasattr(crewai_event_bus, "emit"):
                raise AttributeError("crewai_event_bus must have an 'emit' method") from e
            crewai_event_bus.emit(
                self,
                event=LLMCallFailedEvent(
                    error=str(e), from_task=from_task, from_agent=from_agent
                ),
            )
            raise Exception(f"Failed to get streaming response: {e!s}") from e

    def _handle_streaming_tool_calls(
        self,
        tool_calls: list[ChatCompletionDeltaToolCall],
        accumulated_tool_args: defaultdict[int, AccumulatedToolArgs],
        available_functions: dict[str, Any] | None = None,
        from_task: Any | None = None,
        from_agent: Any | None = None,
    ) -> None | str:
        for tool_call in tool_calls:
            current_tool_accumulator = accumulated_tool_args[tool_call.index]

            if tool_call.function.name:
                current_tool_accumulator.function.name = tool_call.function.name

            if tool_call.function.arguments:
                current_tool_accumulator.function.arguments += tool_call.function.arguments

            if not hasattr(crewai_event_bus, "emit"):
                raise AttributeError("crewai_event_bus must have an 'emit' method")
            crewai_event_bus.emit(
                self,
                event=LLMStreamChunkEvent(
                    tool_call=tool_call.to_dict(),
                    chunk=tool_call.function.arguments,
                    from_task=from_task,
                    from_agent=from_agent,
                ),
            )

            if (
                current_tool_accumulator.function.name
                and current_tool_accumulator.function.arguments
                and available_functions
            ):
                try:
                    json.loads(current_tool_accumulator.function.arguments)
                    return self._handle_tool_call([current_tool_accumulator], available_functions)
                except json.JSONDecodeError:
                    continue
        return None

    @staticmethod
    def _handle_streaming_callbacks(
        callbacks: list[Any] | None,
        usage_info: dict[str, Any] | None,
        last_chunk: Any | None,
    ) -> None:
        if callbacks and len(callbacks) > 0:
            for callback in callbacks:
                if hasattr(callback, "log_success_event"):
                    if not usage_info:
                        try:
                            if last_chunk:
                                if isinstance(last_chunk, dict) and "usage" in last_chunk:
                                    usage_info = last_chunk["usage"]
                                elif hasattr(last_chunk, "usage") and not isinstance(last_chunk.usage, type):
                                    usage_info = last_chunk.usage
                        except Exception:
                            pass

                    if usage_info:
                        callback.log_success_event(
                            kwargs={},
                            response_obj={"usage": usage_info},
                            start_time=0,
                            end_time=0,
                        )

    def deepseek_process_string(self, texto):
        match = re.search(r"(Action Input:\s*\{.*?\})", texto, re.DOTALL)
        if match:
            return texto[:match.end()]

        if "<｜tool" in texto:
            pensamento = texto.split("<｜tool")[0].strip()
            match_action = re.search(r"<｜tool▁sep｜>([\w\s\'\"]+)", texto)
            action = match_action.group(1).strip() if match_action else "Unknown"

            match_json = re.search(r"```json\s*(\{.*?\})\s*```", texto, re.DOTALL)
            if not match_json:
                match_json = re.search(r"(\{.*?\})", texto, re.DOTALL)

            if match_json:
                json_str = match_json.group(1).strip()
                return f"{pensamento}\n\nAction: {action}\nAction Input: {json_str}"

        return texto.strip()

    def _handle_tool_call(
        self,
        tool_calls: list[Any],
        available_functions: dict[str, Any] | None = None,
        from_task: Any | None = None,
        from_agent: Any | None = None,
    ) -> str | None:
        if not tool_calls or not available_functions:
            return None

        tool_call = tool_calls[0]
        function_name = tool_call.function.name
        function_args = {}

        if function_name in available_functions:
            try:
                function_args = json.loads(tool_call.function.arguments)
                fn = available_functions[function_name]

                if not hasattr(crewai_event_bus, "emit"):
                    raise AttributeError("crewai_event_bus must have an 'emit' method")
                started_at = datetime.now()
                crewai_event_bus.emit(
                    self,
                    event=ToolUsageStartedEvent(
                        tool_name=function_name,
                        tool_args=function_args,
                        from_agent=from_agent,
                        from_task=from_task,
                    ),
                )

                result = fn(**function_args)

                crewai_event_bus.emit(
                    self,
                    event=ToolUsageFinishedEvent(
                        output=result,
                        tool_name=function_name,
                        tool_args=function_args,
                        started_at=started_at,
                        finished_at=datetime.now(),
                        from_task=from_task,
                        from_agent=from_agent,
                    ),
                )

                self._handle_emit_call_events(
                    response=result,
                    call_type=LLMCallType.TOOL_CALL,
                    from_task=from_task,
                    from_agent=from_agent,
                )
                return result
            except Exception as e:
                logging.error(f"Error executing function '{function_name}': {e}")
                if not hasattr(crewai_event_bus, "emit"):
                    raise AttributeError("crewai_event_bus must have an 'emit' method") from e
                crewai_event_bus.emit(self, event=LLMCallFailedEvent(error=f"Tool execution error: {e!s}"))
                crewai_event_bus.emit(
                    self,
                    event=ToolUsageErrorEvent(
                        tool_name=function_name,
                        tool_args=function_args,
                        error=f"Tool execution error: {e!s}",
                        from_task=from_task,
                        from_agent=from_agent,
                    ),
                )
        return None

    def call(
        self,
        messages: str | list[dict[str, str]],
        tools: list[dict] | None = None,
        callbacks: list[Any] | None = None,
        available_functions: dict[str, Any] | None = None,
        from_task: Any | None = None,
        from_agent: Any | None = None,
    ) -> str | Any:
        if not hasattr(crewai_event_bus, "emit"):
            raise AttributeError("crewai_event_bus must have an 'emit' method")
        crewai_event_bus.emit(
            self,
            event=LLMCallStartedEvent(
                messages=messages,
                tools=tools,
                callbacks=callbacks,
                available_functions=available_functions,
                from_task=from_task,
                from_agent=from_agent,
                model=self.model,
            ),
        )

        self._validate_call_params()

        if isinstance(messages, str):
            messages = [{"role": "user", "content": messages}]

        if "o1" in self.model.lower():
            for message in messages:
                if message.get("role") == "system":
                    message["role"] = "assistant"

        with suppress_warnings():
            if callbacks and len(callbacks) > 0:
                self.set_callbacks(callbacks)
            try:
                params = self._prepare_completion_params(messages, tools)
                if self.stream:
                    return self._handle_streaming_response(params, callbacks, available_functions, from_task, from_agent)
                return self._handle_non_streaming_response(params, callbacks, available_functions, from_task, from_agent)

            except LLMContextLengthExceededError:
                raise
            except Exception as e:
                unsupported_stop = "Unsupported parameter" in str(e) and "'stop'" in str(e)
                if unsupported_stop:
                    if "additional_drop_params" in self.additional_params and isinstance(self.additional_params["additional_drop_params"], list):
                        self.additional_params["additional_drop_params"].append("stop")
                    else:
                        self.additional_params = {"additional_drop_params": ["stop"]}
                    logging.info("Retrying LLM call without the unsupported 'stop'")
                    return self.call(messages, tools=tools, callbacks=callbacks, available_functions=available_functions, from_task=from_task, from_agent=from_agent)

                if not hasattr(crewai_event_bus, "emit"):
                    raise AttributeError("crewai_event_bus must have an 'emit' method") from e
                crewai_event_bus.emit(
                    self,
                    event=LLMCallFailedEvent(
                        error=str(e), from_task=from_task, from_agent=from_agent
                    ),
                )
                raise

    def _handle_emit_call_events(
        self,
        response: Any,
        call_type: LLMCallType,
        from_task: Any | None = None,
        from_agent: Any | None = None,
        messages: str | list[dict[str, Any]] | None = None,
    ):
        if not hasattr(crewai_event_bus, "emit"):
            raise AttributeError("crewai_event_bus must have an 'emit' method")
        crewai_event_bus.emit(
            self,
            event=LLMCallCompletedEvent(
                messages=messages,
                response=response,
                call_type=call_type,
                from_task=from_task,
                from_agent=from_agent,
                model=self.model,
            ),
        )

    def _format_messages_for_provider(self, messages: list[dict[str, str]]) -> list[dict[str, str]]:
        if messages is None:
            raise TypeError("Messages cannot be None")

        for msg in messages:
            if not isinstance(msg, dict) or "role" not in msg or "content" not in msg:
                raise TypeError("Invalid message format. Each message must be a dict with 'role' and 'content' keys")

        if "o1" in self.model.lower():
            formatted_messages = []
            for msg in messages:
                if msg["role"] == "system":
                    formatted_messages.append({"role": "assistant", "content": msg["content"]})
                else:
                    formatted_messages.append(msg)
            return formatted_messages

        if "mistral" in self.model.lower():
            if messages and messages[-1]["role"] == "assistant":
                return [*messages, {"role": "user", "content": "Please continue."}]
            return messages

        if "ollama" in self.model.lower() and messages and messages[-1]["role"] == "assistant":
            return [*messages, {"role": "user", "content": ""}]

        if not self.is_anthropic:
            return messages

        if not messages or messages[0]["role"] == "system":
            return [{"role": "user", "content": "."}, *messages]

        return messages

    def _get_custom_llm_provider(self) -> str | None:
        if "/" in self.model:
            return self.model.partition("/")[0]
        return None

    def _validate_call_params(self) -> None:
        provider = self._get_custom_llm_provider()
        if self.response_format is not None and not supports_response_schema(
            model=self.model,
            custom_llm_provider=provider,
        ):
            raise ValueError(
                f"The model {self.model} does not support response_format for provider '{provider}'. "
                "Please remove response_format or use a supported model."
            )

    def supports_function_calling(self) -> bool:
        try:
            provider = self._get_custom_llm_provider()
            return litellm.utils.supports_function_calling(self.model, custom_llm_provider=provider)
        except Exception as e:
            logging.error(f"Failed to check function calling support: {e!s}")
            return False

    def supports_stop_words(self) -> bool:
        try:
            params = get_supported_openai_params(model=self.model)
            return params is not None and "stop" in params
        except Exception as e:
            logging.error(f"Failed to get supported params: {e!s}")
            return False

    def get_context_window_size(self) -> int:
        if self.context_window_size != 0:
            return self.context_window_size

        for key, value in LLM_CONTEXT_WINDOW_SIZES.items():
            if value < MIN_CONTEXT or value > MAX_CONTEXT:
                raise ValueError(f"Context window for {key} must be between {MIN_CONTEXT} and {MAX_CONTEXT}")

        self.context_window_size = int(DEFAULT_CONTEXT_WINDOW_SIZE * CONTEXT_WINDOW_USAGE_RATIO)
        for key, value in LLM_CONTEXT_WINDOW_SIZES.items():
            if self.model.startswith(key):
                self.context_window_size = int(value * CONTEXT_WINDOW_USAGE_RATIO)
        return self.context_window_size

    @staticmethod
    def set_callbacks(callbacks: list[Any]):
        with suppress_warnings():
            callback_types = [type(callback) for callback in callbacks]
            for callback in litellm.success_callback[:]:
                if type(callback) in callback_types:
                    litellm.success_callback.remove(callback)

            for callback in litellm._async_success_callback[:]:
                if type(callback) in callback_types:
                    litellm._async_success_callback.remove(callback)

            litellm.callbacks = callbacks

    @staticmethod
    def set_env_callbacks() -> None:
        with suppress_warnings():
            success_callbacks_str = os.environ.get("LITELLM_SUCCESS_CALLBACKS", "")
            success_callbacks: list[str | Callable[..., Any] | CustomLogger] = []
            if success_callbacks_str:
                success_callbacks = [cb.strip() for cb in success_callbacks_str.split(",") if cb.strip()]

            failure_callbacks_str = os.environ.get("LITELLM_FAILURE_CALLBACKS", "")
            failure_callbacks: list[str | Callable[..., Any] | CustomLogger] = []
            if failure_callbacks_str:
                failure_callbacks = [cb.strip() for cb in failure_callbacks_str.split(",") if cb.strip()]

            litellm.success_callback = success_callbacks
            litellm.failure_callback = failure_callbacks