package com.company.aiapp.ext;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import lombok.RequiredArgsConstructor;

import com.company.aiapp.dto.DocRequestDTO;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

@Component
@RequiredArgsConstructor
public class PythonDocClient {

  private final RestTemplate restTemplate;

  // -------- app.external.processor.* (application.yml) ----------
  @Value("${app.external.processor.baseUrl:http://localhost:5000}")
  private String baseUrl;

  @Value("${app.external.processor.processPath:/generate-pleading/docx}")
  private String processPath;

  // NOTE: you said this is already configured
  @Value("${app.external.processor.api-token:}")
  private String apiToken;

  @Value("${app.external.processor.model:gemini/gemini-2.5-flash}")
  private String llmModel;

  public static class GenResult {
    public String status;          // "READY" or "ERROR"
    public String error;           // error message when status=ERROR
    public byte[] docxBytes;       // the generated DOCX bytes
    public String suggestedName;   // best-effort filename (with .docx)
  }

  /**
   * Maps DocRequestDTO to the Python generator payload, calls POST /generate-pleading/docx,
   * and returns DOCX bytes (no persistence here).
   */
  public GenResult generate(DocRequestDTO dto) {
    GenResult out = new GenResult();

    try {
      // ---- 1) Build Python payload ----------------------------------------
      DocRequestDTO.Fields f = Objects.requireNonNull(dto.getFields(), "fields cannot be null");

      String parts = "author: " + ns(f.getPlaintiff()) +
          "; defendants: [" + (f.getDefendant() == null ? "" :
          f.getDefendant().stream().filter(Objects::nonNull).collect(Collectors.joining(", "))) + "]";

      Map<String, Object> llmTokens = new HashMap<>();
      if (apiToken != null && !apiToken.isBlank()) {
        llmTokens.put("api_key", apiToken);      // your note says this comes from yml
      }
      llmTokens.put("model", llmModel);

      Map<String, Object> body = new HashMap<>();
      body.put("motion_type", f.getMotion_type());
      body.put("facts",       f.getFacts());
      body.put("process",     f.getCase_number()); // map case_number -> process
      body.put("court",       f.getCourt());
      body.put("parts",       parts);
      body.put("llm_tokens",  llmTokens);

      // ---- 2) POST to Python endpoint that returns DOCX bytes -------------
      String url = normalizeUrl(baseUrl, processPath);

      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);

      HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
      ResponseEntity<byte[]> resp = restTemplate.exchange(url, HttpMethod.POST, entity, byte[].class);

      if (!resp.getStatusCode().is2xxSuccessful() || resp.getBody() == null) {
        out.status = "ERROR";
        out.error  = "Python returned " + resp.getStatusCode();
        return out;
      }

      // ---- 3) Build result (keep bytes in memory; no S3 here) -------------
      out.status = "READY";
      out.docxBytes = resp.getBody();
      out.suggestedName = ensureDocx(
          firstNonBlank(dto.getRequestedFileName(),
                        slug(f.getMotion_type()) + "_" + slug(f.getCase_number()))
      );
      return out;

    } catch (Exception e) {
      out.status = "ERROR";
      out.error = e.getClass().getSimpleName() + ": " + e.getMessage();
      out.docxBytes = null;
      return out;
    }
  }

  // ---------------- helpers ----------------

  private static String ns(String s) { return s == null ? "" : s; }

  private static String firstNonBlank(String a, String b) {
    if (a != null && !a.isBlank()) return a;
    return b;
  }

  private static String slug(String s) {
    if (s == null) return "";
    String t = s.toLowerCase().replaceAll("[^a-z0-9]+", "_");
    t = t.replaceAll("_+", "_");
    if (t.startsWith("_")) t = t.substring(1);
    if (t.endsWith("_")) t = t.substring(0, t.length() - 1);
    return t;
  }

  private static String ensureDocx(String name) {
    if (name == null || name.isBlank()) return "pleading.docx";
    return name.toLowerCase().endsWith(".docx") ? name : name + ".docx";
  }

  private static String normalizeUrl(String base, String path) {
    String b = base == null ? "" : base.trim();
    String p = path == null ? "" : path.trim();
    if (b.endsWith("/")) b = b.substring(0, b.length() - 1);
    if (!p.startsWith("/")) p = "/" + p;
    return b + p;
  }
}