// src/main/java/com/company/aiapp/service/ModelClient.java
package com.company.aiapp.service;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.function.Consumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;

import reactor.core.Disposable;
import reactor.core.Disposables;

@Service
public class ModelClient {

	private static final Logger log = LoggerFactory.getLogger(ModelClient.class);

	public record Msg(String role, String content) {
	}

	private final RestTemplate rt;
	private final WebClient webClient;
	private final ObjectMapper om = new ObjectMapper();

	private final String completionsUrl; // http://localhost:8000/v1/chat/completions
	private final String modelId; // e.g. qwen2.5-coder-3b

	private static final String SYSTEM_POLICY = "You are a senior engineer for Java/Spring Boot 3 and TypeScript/React (MUI). "
			+ "Be concise, secure, and follow best practices. No hardcoded secrets. "
			+ "Prefer parameterized queries. When generating code, return only the code unless asked for explanation.";

	public ModelClient(RestTemplate rt, @Value("${app.model.baseUrl}") String completionsUrl,
			@Value("${app.model.servedModel}") String modelId) {
		this.rt = rt;
		this.webClient = WebClient.builder().build();
		this.completionsUrl = completionsUrl;
		this.modelId = modelId;
	}

	/** sync call unchanged (omitted) */

	/**
	 * Streaming call: returns a Disposable subscription so caller can cancel.
	 */
	public Disposable streamChat(List<Msg> history, Consumer<String> onDelta, Consumer<Exception> onError,
			Runnable onComplete) {
		try {
			var messages = new ArrayList<Map<String, String>>();
//			messages.add(Map.of("role", "system", "content", SYSTEM_POLICY));
			for (Msg m : history)
				messages.add(Map.of("role", m.role(), "content", m.content()));

			Map<String, Object> payload = Map.of("model", modelId, "messages", messages, "temperature", 0.2,
					"max_tokens", 1024, "stream", true);

			log.info("model.streamChat -> POST {} (messages={})", completionsUrl, messages.size());

			ClientResponse resp = webClient.post().uri(completionsUrl).contentType(MediaType.APPLICATION_JSON)
					.accept(MediaType.TEXT_EVENT_STREAM) // SSE from vLLM
					.bodyValue(payload).exchange().block(Duration.ofSeconds(5));

			if (resp == null)
				throw new IllegalStateException("No response from model server");
			log.info("model.streamChat <- status={} content-type={}", resp.statusCode().value(),
					resp.headers().contentType().orElse(null));

			if (!resp.statusCode().is2xxSuccessful()) {
				String err = resp.bodyToMono(String.class).block(Duration.ofSeconds(10));
				throw new RuntimeException("Model HTTP " + resp.statusCode().value() + ": " + err);
			}

			// Subscribe to raw bytes; we’ll split SSE frames ourselves.
			return resp.bodyToFlux(byte[].class).map(bytes -> new String(bytes, StandardCharsets.UTF_8))
					.doOnError(e -> onError.accept(new RuntimeException("Stream error: " + e.getMessage(), e)))
					.doOnComplete(onComplete).subscribe(chunk -> {
						for (String line : chunk.split("\\r?\\n")) {
							String trimmed = line.trim();
							if (!trimmed.startsWith("data:"))
								continue;
							String data = trimmed.substring(5).trim();
							if ("[DONE]".equals(data)) {
								onComplete.run();
								return;
							}
							String deltaText = parseDelta(data);
							if (!deltaText.isEmpty())
								onDelta.accept(deltaText);
						}
					});

		} catch (Exception e) {
			onError.accept(e);
			return Disposables.disposed();// no-op disposable
		}
	}

	/** Extracts text from OpenAI/vLLM stream chunk JSON. */
	private String parseDelta(String json) {
		try {
			JsonNode root = om.readTree(json);
			JsonNode choices = root.path("choices");
			if (!choices.isArray() || choices.isEmpty())
				return "";
			JsonNode first = choices.get(0);
			JsonNode content = first.path("delta").path("content");
			if (content.isTextual())
				return content.asText();
			JsonNode text = first.path("text");
			if (text.isTextual())
				return text.asText();
			return "";
		} catch (Exception ignore) {
			return "";
		}
	}
}