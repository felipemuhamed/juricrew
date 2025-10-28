package com.company.aiapp.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ExternalProcessorClient {

    private static final MediaType DOCX_MEDIA = MediaType.parseMediaType(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    @Value("${app.external.processor.baseUrl:http://localhost:8000}")
    private String baseUrl;

    @Value("${app.external.processor.processPath:/generate-pleading/docx}")
    private String processPath;

    // NEW: token + (optional) model to mirror your curl body
    @Value("${app.external.processor.api-token}")
    private String apiToken;

    @Value("${app.external.processor.model}")
    private String model;

    /**
     * Posts the input "fields" map to FastAPI (converted to its expected flat request)
     * and returns the response body (DOCX bytes).
     *
     * Expected keys inside fields:
     *   - motion_type (String)
     *   - facts (String)
     *   - case_number (String)  -> mapped to 'process'
     *   - court (String)
     *   - plaintiff (String)    (optional)
     *   - defendant (List<String> or String) (optional)
     */
    public byte[] generateDocx(Map<String, Object> fields) {
        Objects.requireNonNull(fields, "'fields' cannot be null");

        String motionType = str(fields.get("motion_type"));
        String facts      = str(fields.get("facts"));
        String caseNum    = str(fields.get("case_number"));
        String court      = str(fields.get("court"));
        String plaintiff  = strOrEmpty(fields.get("plaintiff"));
        List<String> defendants = toStringList(fields.get("defendant"));

        requireNonBlank(motionType, "fields.motion_type");
        requireNonBlank(facts, "fields.facts");
        requireNonBlank(caseNum, "fields.case_number");
        requireNonBlank(court, "fields.court");

        String parts = buildParts(plaintiff, defendants);

        // ----- Build Python's expected flat payload -----
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("motion_type", motionType);
        payload.put("facts", facts);
        payload.put("process", caseNum);
        payload.put("court", court);
        payload.put("parts", parts);

        // llm_tokens block (exactly like the curl sample)
        Map<String, Object> llmTokens = new LinkedHashMap<>();
        if (apiToken != null && !apiToken.isBlank()) {
            llmTokens.put("api_key", apiToken);
        }
        if (model != null && !model.isBlank()) {
            llmTokens.put("model", model);
        }
        payload.put("llm_tokens", llmTokens);

        // ----- Build RestTemplate on the spot -----
        RestTemplate restTemplate = restTemplate();

        String effectiveBase = trimTrailingSlash(Objects.requireNonNullElse(baseUrl, "http://localhost:8000"));
        String primaryPath   = ensureLeadingSlash(Objects.requireNonNullElse(processPath, "/generate-pleading/docx"));

        try {
            return postForDocx(restTemplate, effectiveBase + primaryPath, payload);
        } catch (HttpClientErrorException.NotFound nf) {
            // Fallbacks to cover config drift
            for (String alt : new String[]{"/generate-pleading/docx", "/process"}) {
                String tryUrl = effectiveBase + ensureLeadingSlash(alt);
                if (!tryUrl.equals(effectiveBase + primaryPath)) {
                    try {
                        return postForDocx(restTemplate, tryUrl, payload);
                    } catch (HttpClientErrorException.NotFound ignore) {
                        // keep trying
                    }
                }
            }
            throw nf;
        } catch (RestClientException ex) {
            throw new RuntimeException("External processor call failed", ex);
        }
    }

    /* ----------------------- HTTP helpers ----------------------- */

    private RestTemplate restTemplate() {
        // build with simple timeouts, no constructor injection
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(10).toMillis());
        factory.setReadTimeout((int) Duration.ofMinutes(2).toMillis());
        return new RestTemplate(factory);
    }

    private byte[] postForDocx(RestTemplate restTemplate, String url, Map<String, Object> payload) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(Arrays.asList(DOCX_MEDIA, MediaType.APPLICATION_OCTET_STREAM));

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);
        ResponseEntity<byte[]> resp = restTemplate.exchange(url, HttpMethod.POST, entity, byte[].class);

        if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
            return resp.getBody();
        }
        throw new RuntimeException("External processor call failed: HTTP " + resp.getStatusCodeValue());
    }

    /* ----------------------- value helpers ----------------------- */

    private static String buildParts(String plaintiff, List<String> defendants) {
        String defStr = (defendants == null || defendants.isEmpty())
                ? ""
                : defendants.stream().filter(Objects::nonNull).map(String::trim).filter(s -> !s.isEmpty())
                .collect(Collectors.joining(", "));
        return "author: " + safe(plaintiff) + "; defendants: [" + defStr + "]";
        // If Python expects "plaintiff:" instead of "author:", switch the label here:
        // return "plaintiff: " + safe(plaintiff) + "; defendants: [" + defStr + "]";
    }

    private static String str(Object o) {
        return (o == null) ? null : String.valueOf(o).trim();
    }

    private static String strOrEmpty(Object o) {
        String s = str(o);
        return (s == null) ? "" : s;
    }

    @SuppressWarnings("unchecked")
    private static List<String> toStringList(Object v) {
        if (v == null) return Collections.emptyList();
        if (v instanceof List<?>) {
            List<String> out = new ArrayList<>();
            for (Object o : (List<?>) v) {
                if (o == null) continue;
                String s = String.valueOf(o).trim();
                if (!s.isEmpty()) out.add(s);
            }
            return out;
        }
        String s = str(v);
        if (s == null || s.isEmpty()) return Collections.emptyList();
        String[] parts = s.split("[,;\\n]+");
        List<String> out = new ArrayList<>(parts.length);
        for (String p : parts) {
            String q = p.trim();
            if (!q.isEmpty()) out.add(q);
        }
        return out;
    }

    private static void requireNonBlank(String v, String name) {
        if (v == null || v.isBlank()) {
            throw new IllegalArgumentException("Missing required field: " + name);
        }
    }

    private static String safe(String v) {
        return v == null ? "" : v;
    }

    private static String trimTrailingSlash(String s) {
        return (s != null && s.endsWith("/")) ? s.substring(0, s.length() - 1) : s;
    }

    private static String ensureLeadingSlash(String s) {
        if (s == null || s.isEmpty()) return "/";
        return s.startsWith("/") ? s : "/" + s;
    }
}