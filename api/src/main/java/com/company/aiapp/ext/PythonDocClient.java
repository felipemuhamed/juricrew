package com.company.aiapp.ext;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import com.company.aiapp.dto.DocRequestDTO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class PythonDocClient {

	private final RestTemplate restTemplate;
	private final ObjectMapper objectMapper;

	@Value("${app.external.processor.baseUrl:http://localhost:5000}")
	private String baseUrl;

	@Value("${app.external.processor.processPath:/generate-pleading/docx}")
	private String processPath;

	@Value("${app.external.processor.researchPath:/research}")
	private String researchPath;

	@Value("${app.external.processor.api-token:}")
	private String apiToken;

	@Value("${app.external.processor.model:gemini/gemini-2.5-flash}")
	private String llmModel;

	public static class GenResult {
		public String status; // "READY" or "ERROR"
		public String error; // message when status=ERROR
		public byte[] docxBytes; // doc bytes
		public String suggestedName; // filename
	}

	public JsonNode research(DocRequestDTO dto) {
		try {
			DocRequestDTO.Fields f = Objects.requireNonNull(dto.getFields(), "fields cannot be null");

			String parts = buildParts(f);
			Map<String, Object> llmTokens = buildLlmTokens();

			Map<String, Object> body = new HashMap<>();
			body.put("motion_type", f.getMotion_type());
			body.put("facts", f.getFacts());
			body.put("process", f.getCase_number());
			body.put("court", f.getCourt());
			body.put("parts", parts);
			body.put("llm_tokens", llmTokens);

			String url = normalizeUrl(baseUrl, researchPath);

			HttpHeaders headers = new HttpHeaders();
			headers.setContentType(MediaType.APPLICATION_JSON);

			HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
			ResponseEntity<String> resp = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);

			if (!resp.getStatusCode().is2xxSuccessful() || resp.getBody() == null) {
				throw new IllegalStateException("Python returned " + resp.getStatusCode());
			}

			JsonNode root = objectMapper.readTree(resp.getBody());
			return root.has("result") ? root.get("result") : root;

		} catch (Exception e) {
			throw new RuntimeException(e.getClass().getSimpleName() + ": " + e.getMessage(), e);
		}
	}

	public GenResult generate(DocRequestDTO dto, String firmTemplateMarkdown) {
		GenResult out = new GenResult();

		try {
			DocRequestDTO.Fields f = Objects.requireNonNull(dto.getFields(), "fields cannot be null");

			String parts = buildParts(f);
			Map<String, Object> llmTokens = buildLlmTokens();

			Map<String, Object> body = new HashMap<>();
			body.put("motion_type", f.getMotion_type());
			body.put("facts", f.getFacts());
			body.put("process", f.getCase_number());
			body.put("court", f.getCourt());
			body.put("parts", parts);
			body.put("selected_authorities", jsonNodeToMap(dto.getSelectedAuthorities()));
			body.put("firm_template", firmTemplateMarkdown);
			body.put("llm_tokens", llmTokens);

			String url = normalizeUrl(baseUrl, processPath);

			HttpHeaders headers = new HttpHeaders();
			headers.setContentType(MediaType.APPLICATION_JSON);

			HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
			ResponseEntity<byte[]> resp = restTemplate.exchange(url, HttpMethod.POST, entity, byte[].class);

			if (!resp.getStatusCode().is2xxSuccessful() || resp.getBody() == null) {
				out.status = "ERROR";
				out.error = "Python returned " + resp.getStatusCode();
				return out;
			}

			out.status = "READY";
			out.docxBytes = resp.getBody();
			out.suggestedName = ensureDocx(firstNonBlank(dto.getRequestedFileName(),
					slug(f.getMotion_type()) + "_" + slug(f.getCase_number())));
			return out;

		} catch (Exception e) {
			out.status = "ERROR";
			out.error = e.getClass().getSimpleName() + ": " + e.getMessage();
			out.docxBytes = null;
			return out;
		}
	}

	private String buildParts(DocRequestDTO.Fields f) {
		return "plaintiff: " + ns(f.getPlaintiff()) + "; defendants: [" + (f.getDefendant() == null ? ""
				: f.getDefendant().stream().filter(Objects::nonNull).collect(Collectors.joining(", "))) + "]";
	}

	private Map<String, Object> buildLlmTokens() {
		Map<String, Object> llmTokens = new HashMap<>();
		if (apiToken != null && !apiToken.isBlank()) {
			llmTokens.put("api_key", apiToken);
		}
		llmTokens.put("model", llmModel);
		return llmTokens;
	}

	@SuppressWarnings("unchecked")
	private Map<String, Object> jsonNodeToMap(JsonNode node) {
		if (node == null || node.isNull())
			return Map.of();
		try {
			return objectMapper.convertValue(node, Map.class);
		} catch (Exception e) {
			return Map.of();
		}
	}

	private static String ns(String s) {
		return s == null ? "" : s;
	}

	private static String firstNonBlank(String a, String b) {
		if (a != null && !a.isBlank())
			return a;
		return b;
	}

	private static String slug(String s) {
		if (s == null)
			return "";
		String t = s.toLowerCase().replaceAll("[^a-z0-9]+", "_");
		t = t.replaceAll("_+", "_");
		if (t.startsWith("_"))
			t = t.substring(1);
		if (t.endsWith("_"))
			t = t.substring(0, t.length() - 1);
		return t;
	}

	private static String ensureDocx(String name) {
		if (name == null || name.isBlank())
			return "pleading.docx";
		return name.toLowerCase().endsWith(".docx") ? name : name + ".docx";
	}

	private static String normalizeUrl(String base, String path) {
		String b = base == null ? "" : base.trim();
		String p = path == null ? "" : path.trim();
		if (b.endsWith("/"))
			b = b.substring(0, b.length() - 1);
		if (!p.startsWith("/"))
			p = "/" + p;
		return b + p;
	}
}