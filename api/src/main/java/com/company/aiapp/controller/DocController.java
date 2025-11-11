package com.company.aiapp.controller;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.company.aiapp.config.storage.FileStorage;
import com.company.aiapp.domain.MotionEntity;
import com.company.aiapp.dto.DocHydrateResponse;
import com.company.aiapp.dto.DocRequestDTO;
import com.company.aiapp.dto.DocRequestDTOHydrate;
import com.company.aiapp.dto.DocResponseDTO;
import com.company.aiapp.dto.ProcessDocResponse;
import com.company.aiapp.repo.AppUserRepo;
import com.company.aiapp.repo.MotionRepository;
import com.company.aiapp.repo.projection.LatestDocOnlyView;
import com.company.aiapp.security.AppUserPrincipal;
import com.company.aiapp.service.ConversationService;
import com.company.aiapp.service.DocPipelineService;
import com.company.aiapp.service.DocProcessingService;
import com.company.aiapp.service.MotionService;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/docs")
public class DocController {

    private final DocPipelineService pipeline;          // legacy pipeline (kept)
    private final DocProcessingService docProcessing;   // new motion-aware flow
    private final FileStorage storage;
    private final MotionService motions;
    private final AppUserRepo appUserRepo;
    private final MotionRepository motionRepo;
    private final ConversationService conversations;
    private final ObjectMapper objectMapper;

    @Value("${app.external.processor.baseUrl}")
    private String ragBaseUrl;

    public DocController(
            DocPipelineService pipeline,
            DocProcessingService docProcessing,
            FileStorage storage,
            MotionService motions,
            AppUserRepo repo,
            MotionRepository motionRepo,
            ConversationService conversations,
            ObjectMapper objectMapper
    ) {
        this.pipeline = pipeline;
        this.docProcessing = docProcessing;
        this.storage = storage;
        this.motions = motions;
        this.appUserRepo = repo;
        this.motionRepo = motionRepo;
        this.conversations = conversations;
        this.objectMapper = objectMapper;
    }

    /** NEW: Motion-aware processing endpoint. */
    @PostMapping("/process")
    public ResponseEntity<ProcessDocResponse> process(
            @Valid @RequestBody DocRequestDTO request,
            @RequestHeader(value = "X-Org-Id", required = false) String orgId,
            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader,
            Authentication auth
    ) {
        normalizeIncoming(request);

        // Prefer header if a valid UUID
        UUID userUuid = parseUuid(userIdHeader);

        // Otherwise resolve from principal or email
        if (userUuid == null && auth != null) {
            Object p = auth.getPrincipal();
            if (p instanceof AppUserPrincipal aup) {
                userUuid = aup.getId();
            } else {
                userUuid = findUserIdByEmail(auth.getName());
            }
        }

        if (userUuid == null) return ResponseEntity.status(401).build();

        ProcessDocResponse resp = docProcessing.process(request, userUuid.toString(), orgId);
        return ResponseEntity.ok(resp);
    }

    /** LEGACY: original pipeline for backward compatibility. */
    @PostMapping("/process-legacy")
    public DocResponseDTO processLegacy(@Valid @RequestBody DocRequestDTO request, Authentication auth) {
        normalizeIncoming(request);
        return pipeline.process(request, auth);
    }

    @PostMapping(
            value = "/rag/upload",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<String> ragUpload(@RequestPart("file") MultipartFile file) {
        try {
            WebClient client = WebClient.builder().baseUrl(ragBaseUrl).build();

            MultipartBodyBuilder mb = new MultipartBodyBuilder();
            mb.part("file", file.getResource())
              .filename(file.getOriginalFilename())
              .contentType(file.getContentType() == null
                      ? MediaType.APPLICATION_OCTET_STREAM
                      : MediaType.parseMediaType(file.getContentType()));

            String upstream = client.post()
                    .uri("/rag/upload")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(mb.build()))
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            return ResponseEntity.ok(upstream == null ? "{}" : upstream);
        } catch (Exception ex) {
            return ResponseEntity.status(413)
                    .body("{\"error\":\"File too large. Ask an admin to increase max upload size.\"}");
        }
    }

    /** Simple downloader to serve generated DOCX back to the UI. */
    @GetMapping("/download")
    public ResponseEntity<ByteArrayResource> download(@RequestParam("path") String relativePath) throws Exception {
        Path rel = Path.of(relativePath);
        byte[] bytes = storage.loadBytes(rel);
        String fileName = rel.getFileName().toString();

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(fileName).build().toString())
                .body(new ByteArrayResource(bytes));
    }

    /**
     * Returns the latest generated/saved doc for a case number for the **current user**,
     * optionally scoped to a folder/project (when provided).
     * Uses a native projection that already LIMIT 1 to avoid NonUniqueResultException.
     */
    @GetMapping("/latest")
    public ResponseEntity<ProcessDocResponse> latestByCase(
            @RequestParam("caseNumber") String caseNumber,
            @RequestParam(value = "projectId", required = false) String projectId,
            Authentication auth,
            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader
    ) {
        // Determine owner (createdBy): header UUID > principal UUID > email lookup
        UUID owner = parseUuid(userIdHeader);
        if (owner == null && auth != null) {
            Object p = auth.getPrincipal();
            if (p instanceof AppUserPrincipal aup) {
                owner = aup.getId();
            } else {
                owner = findUserIdByEmail(auth.getName());
            }
        }

        UUID folderId = parseUuid(projectId);

        Optional<LatestDocOnlyView> opt =
                motionRepo.findLatestDocOnlyNative(owner, caseNumber, folderId);

        return opt.map(v -> ResponseEntity.ok(
                        new ProcessDocResponse(
                                v.getId(),
                                String.valueOf(v.getStatus()),     // ← ensure String
                                v.getOutputDocxPath()
                        )))
                .orElseGet(() -> ResponseEntity.ok(new ProcessDocResponse(null, "DRAFT", null)));
    }

    /**
     * Returns the latest saved input snapshot for the given caseNumber (optionally
     * scoped to a folder/project and/or current user). Responds 204 when nothing is available.
     *
     * We first grab the latest id via the native LIMIT 1 query, then load that entity by id
     * to read `inputSnapshot` (avoids JPQL single-result exceptions).
     */
    @Transactional(readOnly = true)
    @GetMapping("/latest-snapshot")
    public ResponseEntity<?> latestSnapshot(
            @RequestParam("caseNumber") String caseNumber,
            @RequestParam(value = "projectId", required = false) String projectId,
            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader,
            Authentication auth
    ) {
        if (caseNumber == null || caseNumber.isBlank()) {
            return ResponseEntity.badRequest().body("{\"error\":\"caseNumber is required\"}");
        }

        // Resolve user (optional)
        UUID userId = parseUuid(userIdHeader);
        if (userId == null && auth != null && auth.getPrincipal() instanceof AppUserPrincipal aup) {
            userId = aup.getId();
        } else if (userId == null && auth != null) {
            userId = findUserIdByEmail(auth.getName());
        }

        UUID folderId = parseUuid(projectId);

        // Step 1: try latest doc WITH folder filter
        Optional<LatestDocOnlyView> latestOpt =
                motionRepo.findLatestDocOnlyNative(userId, caseNumber, folderId);

        // 🧠 Fallback: if nothing in this folder, try again WITHOUT folder filter
        if (latestOpt.isEmpty() && folderId != null) {
            latestOpt = motionRepo.findLatestDocOnlyNative(userId, caseNumber, null);
        }

        if (latestOpt.isEmpty()) {
            return ResponseEntity.noContent().build();
        }

        UUID latestId = latestOpt.get().getId();

        // Step 2: load entity by ID to read input_snapshot and full status/path
        Optional<MotionEntity> entityOpt = motionRepo.findById(latestId);
        if (entityOpt.isEmpty()) {
            return ResponseEntity.noContent().build();
        }

        MotionEntity e = entityOpt.get();
        String json = (e.getInputSnapshot() != null) ? e.getInputSnapshot().toString() : null;
        if (json == null || json.trim().isEmpty()) {
            return ResponseEntity.noContent().build();
        }

        // parse snapshot string into Fields
        DocRequestDTOHydrate.Fields fields;
        try {
            fields = objectMapper.readValue(json, DocRequestDTOHydrate.Fields.class);
        } catch (Exception ex) {
            return ResponseEntity.noContent().build();
        }
        if (fields.getDefendant() == null) {
            fields.setDefendant(List.of());
        }

        DocHydrateResponse resp = new DocHydrateResponse();
        resp.setMotionId(e.id());
        resp.setStatus(String.valueOf(e.status())); // normalize to String for the UI
        resp.setOutputPath(e.outputDocxPath());
        resp.setFields(fields);

        return ResponseEntity.ok(resp);
    }

    // =========== Helpers ==========//
    private static UUID parseUuid(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return UUID.fromString(s.trim());
        } catch (Exception e) {
            return null;
        }
    }

    private static String trimOrEmpty(String s) {
        return s == null ? "" : s.trim();
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.trim().isEmpty()) return a.trim();
        if (b != null && !b.trim().isEmpty()) return b.trim();
        return "";
    }

    private static String emptyToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }

    private UUID findUserIdByEmail(String email) {
        if (email == null || email.isBlank()) return null;
        return appUserRepo.findByEmail(email.trim()).map(u -> u.getId()).orElse(null);
    }

    /** Normalizes the incoming DTO so downstream services receive a stable shape. */
    private static void normalizeIncoming(DocRequestDTO dto) {
        if (dto == null) return;

        dto.setProjectId(trimOrEmpty(dto.getProjectId()));
        dto.setSubfolder(trimOrEmpty(dto.getSubfolder()));
        dto.setRequestedFileName(emptyToNull(trimOrEmpty(dto.getRequestedFileName())));

        DocRequestDTO.Fields f = dto.getFields();
        if (f == null) {
            f = new DocRequestDTO.Fields();
            dto.setFields(f);
        }

        final String caseNumber = firstNonBlank(
                trimOrEmpty(f.getCase_number()),
                trimOrEmpty(f.getProcess()) // legacy
        );
        f.setCase_number(caseNumber);

        f.setMotion_type(trimOrEmpty(f.getMotion_type()));
        f.setFacts(trimOrEmpty(f.getFacts()));
        f.setCourt(trimOrEmpty(f.getCourt()));
        f.setPlaintiff(trimOrEmpty(f.getPlaintiff()));

        List<String> defendants = new ArrayList<>();
        if (f.getDefendant() != null) {
            for (String s : f.getDefendant()) {
                String t = trimOrEmpty(s);
                if (!t.isEmpty()) defendants.add(t);
            }
        } else if (f.getDefendants() != null) {
            for (String s : f.getDefendants()) {
                String t = trimOrEmpty(s);
                if (!t.isEmpty()) defendants.add(t);
            }
        } else if (f.getParts() != null && !f.getParts().trim().isEmpty()) {
            String raw = f.getParts();
            String cleaned = raw
                    .replaceAll("(?i)plaintiff\\s*:\\s*[^;\\]]*;?", "")
                    .replaceAll("(?i)defendants?\\s*:\\s*\\[?\\s*", "")
                    .replaceAll("\\]", "");
            String[] toks = cleaned.split("[,;\\n]+");
            for (String t : toks) {
                String v = t.trim();
                if (!v.isEmpty()) defendants.add(v);
            }
        }
        f.setDefendant(defendants.isEmpty() ? List.of() : defendants);
    }
}
