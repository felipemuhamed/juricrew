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
import com.company.aiapp.entity.Conversation;
import com.company.aiapp.ext.PythonDocClient;
import com.company.aiapp.repo.AppUserRepo;
import com.company.aiapp.repo.ConversationRepo;
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
    private final ConversationRepo conversationRepo;
    private final ObjectMapper objectMapper;
    private final PythonDocClient python;

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
            ConversationRepo conversationRepo,
            ObjectMapper objectMapper,
            PythonDocClient python
    ) {
        this.pipeline = pipeline;
        this.docProcessing = docProcessing;
        this.storage = storage;
        this.motions = motions;
        this.appUserRepo = repo;
        this.motionRepo = motionRepo;
        this.conversations = conversations;
        this.conversationRepo = conversationRepo;
        this.objectMapper = objectMapper;
        this.python = python;
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

        // Auto-title the sidebar conversation (if present) using the case number
        UUID convId = parseUuid(request.getConversationId());
        if (convId != null) {
            maybeAutoTitleConversation(convId, userUuid, request);
        }

        String orgKey = resolveOrgKey(orgId, auth);
        ProcessDocResponse resp = docProcessing.process(request, userUuid.toString(), orgId, orgKey);
        return ResponseEntity.ok(resp);
    }

    /** Step 1: Research relevant authorities (statutes/rules/case law). */
    @PostMapping("/research")
    public ResponseEntity<?> researchAuthorities(
            @Valid @RequestBody DocRequestDTO request
    ) {
        normalizeIncoming(request);
        return ResponseEntity.ok(python.research(request));
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

        // parse snapshot (older records stored only the Fields object; newer records store the full DTO)
        DocRequestDTOHydrate.Fields fields;
        String templateId = null;
        com.fasterxml.jackson.databind.JsonNode selectedAuthorities = null;
        try {
            com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(json);
            com.fasterxml.jackson.databind.JsonNode fieldsNode = root.has("fields") ? root.get("fields") : root;
            fields = objectMapper.treeToValue(fieldsNode, DocRequestDTOHydrate.Fields.class);

            if (root.has("templateId") && !root.get("templateId").isNull()) {
                templateId = root.get("templateId").asText(null);
            }
            if (root.has("selectedAuthorities") && !root.get("selectedAuthorities").isNull()) {
                selectedAuthorities = root.get("selectedAuthorities");
            }
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
        resp.setTemplateId(templateId);
        resp.setSelectedAuthorities(selectedAuthorities);

        return ResponseEntity.ok(resp);
    }

    /**
     * Conversation-scoped hydrate: when a user clicks a conversation in the sidebar,
     * the UI calls this to restore Step 1 + Step 2 (incl. researched authorities).
     */
    @Transactional(readOnly = true)
    @GetMapping("/conversations/{conversationId}/latest")
    public ResponseEntity<?> latestSnapshotForConversation(
            @org.springframework.web.bind.annotation.PathVariable("conversationId") String conversationId,
            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader,
            Authentication auth
    ) {
        UUID convId = parseUuid(conversationId);
        if (convId == null) {
            return ResponseEntity.badRequest().body("{\"error\":\"Invalid conversationId\"}");
        }

        // Resolve user (optional but preferred)
        UUID userId = parseUuid(userIdHeader);
        if (userId == null && auth != null && auth.getPrincipal() instanceof AppUserPrincipal aup) {
            userId = aup.getId();
        } else if (userId == null && auth != null) {
            userId = findUserIdByEmail(auth.getName());
        }

        Optional<MotionEntity> opt = (userId != null)
                ? motionRepo.findTop1ByConversationIdAndCreatedByOrderByUpdatedAtDesc(convId, userId)
                : motionRepo.findTop1ByConversationIdOrderByUpdatedAtDesc(convId);

        if (opt.isEmpty()) {
            return ResponseEntity.noContent().build();
        }

        return ResponseEntity.ok(buildHydrateResponse(opt.get()));
    }

    /**
     * Save/Update a motion draft for a conversation. This persists:
     * - Step 1 motion fields
     * - Step 1 authority research results (if present)
     * - Step 2 selected authorities + template (if present)
     */
    @PostMapping("/conversations/{conversationId}/draft")
    public ResponseEntity<?> saveConversationDraft(
            @org.springframework.web.bind.annotation.PathVariable("conversationId") String conversationId,
            @Valid @RequestBody DocRequestDTO request,
            @RequestHeader(value = "X-Org-Id", required = false) String orgId,
            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader,
            Authentication auth
    ) {
        normalizeIncoming(request);

        UUID convId = parseUuid(conversationId);
        if (convId == null) {
            return ResponseEntity.badRequest().body("{\"error\":\"Invalid conversationId\"}");
        }

        // Determine user: header UUID > principal UUID > email lookup
        UUID userUuid = parseUuid(userIdHeader);
        if (userUuid == null && auth != null) {
            Object p = auth.getPrincipal();
            if (p instanceof AppUserPrincipal aup) {
                userUuid = aup.getId();
            } else {
                userUuid = findUserIdByEmail(auth.getName());
            }
        }
        if (userUuid == null) return ResponseEntity.status(401).build();

        // Ensure request carries the conversationId for downstream consistency
        request.setConversationId(convId.toString());

        // Auto-title the sidebar conversation when the user hasn't renamed it yet
        maybeAutoTitleConversation(convId, userUuid, request);

        // Auto-title the sidebar conversation if the user hasn't renamed it yet
        maybeAutoTitleConversation(convId, userUuid, request);

        MotionEntity motion = null;
        UUID motionId = parseUuid(request.getMotionId());
        if (motionId != null) {
            motion = motionRepo.findById(motionId).orElse(null);
            if (motion != null && motion.createdBy() != null && !motion.createdBy().equals(userUuid)) {
                // don't allow cross-user updates
                motion = null;
            }
        }
        if (motion == null) {
            // Create a new draft motion record
            var fields = request.getFields();
            var create = new com.company.aiapp.dto.CreateMotionRequest();
            create.setCaseNumber(trimOrEmpty(fields.getCase_number()));
            create.setCourt(trimOrEmpty(fields.getCourt()));
            create.setMotionType(trimOrEmpty(fields.getMotion_type()));
            create.setFacts(trimOrEmpty(fields.getFacts()));
            create.setPlaintiff(trimOrEmpty(fields.getPlaintiff()));
            create.setDefendants(fields.getDefendant());
            // folder/project
            create.setFolderId(request.getProjectId());

            var created = motions.create(create, userUuid.toString(), orgId);
            if (created != null && created.id != null) {
                motion = motionRepo.findById(created.id).orElse(null);
            }
        }

        if (motion == null) {
            return ResponseEntity.status(500).body("{\"error\":\"Failed to create motion draft\"}");
        }

        motion.conversationId(convId);
        motion.folderId(parseUuid(request.getProjectId()));
        motion.status(com.company.aiapp.domain.MotionStatus.DRAFT);

        try {
            motion.inputSnapshot(objectMapper.valueToTree(request));
        } catch (Exception ignored) {}

        if (request.getResearchedAuthorities() != null) {
            motion.researchedAuthorities(request.getResearchedAuthorities());
        }

        motionRepo.save(motion);

        DocHydrateResponse resp = buildHydrateResponse(motion);
        return ResponseEntity.ok(resp);
    }

    // =========== Helpers ==========//

    /**
     * If the conversation title still looks like an auto-generated default,
     * rename it using the motion's case number (and motion type if present).
     */
    private void maybeAutoTitleConversation(UUID conversationId, UUID userUuid, DocRequestDTO req) {
        if (conversationId == null || userUuid == null || req == null || req.getFields() == null) return;
        final String caseNo = trimOrEmpty(req.getFields().getCase_number());
        if (caseNo.isEmpty()) return;

        try {
            Conversation c = conversationRepo.findById(conversationId).orElse(null);
            if (c == null || c.getUser() == null || c.getUser().getId() == null) return;
            if (!c.getUser().getId().equals(userUuid)) return;

            String currentTitle = c.getTitle() == null ? "" : c.getTitle().trim();
            boolean looksDefault = currentTitle.isEmpty()
                    || currentTitle.equalsIgnoreCase("Untitled conversation")
                    || currentTitle.startsWith("Chat ");
            if (!looksDefault) return;

            String mt = trimOrEmpty(req.getFields().getMotion_type());
            String newTitle = mt.isEmpty() ? caseNo : (caseNo + " — " + mt);
            c.setTitle(newTitle);
            conversationRepo.save(c);
        } catch (Exception ignored) {
            // best-effort only
        }
    }

    private DocHydrateResponse buildHydrateResponse(MotionEntity e) {
        DocRequestDTOHydrate.Fields fields = null;
        String templateId = null;
        com.fasterxml.jackson.databind.JsonNode selectedAuthorities = null;

        try {
            if (e.getInputSnapshot() != null) {
                com.fasterxml.jackson.databind.JsonNode root = e.getInputSnapshot();
                com.fasterxml.jackson.databind.JsonNode fieldsNode = root.has("fields") ? root.get("fields") : root;
                fields = objectMapper.treeToValue(fieldsNode, DocRequestDTOHydrate.Fields.class);
                if (root.has("templateId") && !root.get("templateId").isNull()) {
                    templateId = root.get("templateId").asText(null);
                }
                if (root.has("selectedAuthorities") && !root.get("selectedAuthorities").isNull()) {
                    selectedAuthorities = root.get("selectedAuthorities");
                }
            }
        } catch (Exception ignored) {}

        if (fields == null) {
            fields = new DocRequestDTOHydrate.Fields();
            fields.setCase_number(e.caseRef() != null ? e.caseRef().caseNumber() : null);
            fields.setCourt(e.caseRef() != null ? e.caseRef().court() : null);
            fields.setMotion_type(e.motionType());
            fields.setFacts(e.facts());
            fields.setDefendant(List.of());
        } else if (fields.getDefendant() == null) {
            fields.setDefendant(List.of());
        }

        DocHydrateResponse resp = new DocHydrateResponse();
        resp.setMotionId(e.id());
        resp.setStatus(String.valueOf(e.status()));
        resp.setOutputPath(e.outputDocxPath());
        resp.setFields(fields);
        resp.setTemplateId(templateId);
        resp.setSelectedAuthorities(selectedAuthorities);
        resp.setResearchedAuthorities(e.researchedAuthorities());
        resp.setOutputMetadata(e.outputMetadata());
        return resp;
    }
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

    /**
     * Templates are org-wide. If X-Org-Id is provided we use it as the org key; otherwise we derive
     * the org key from the authenticated user's email domain.
     */
    private static String resolveOrgKey(String orgHeader, Authentication auth) {
        if (orgHeader != null && !orgHeader.trim().isEmpty()) {
            return orgHeader.trim();
        }
        String email = null;
        if (auth != null) {
            Object p = auth.getPrincipal();
            if (p instanceof AppUserPrincipal aup) {
                email = aup.getEmail();
            } else {
                email = auth.getName();
            }
        }
        if (email == null || email.isBlank()) return "public";
        int at = email.indexOf('@');
        if (at < 0 || at == email.length() - 1) return "public";
        return email.substring(at + 1).toLowerCase();
    }

    /** Normalizes the incoming DTO so downstream services receive a stable shape. */
    private static void normalizeIncoming(DocRequestDTO dto) {
        if (dto == null) return;

        dto.setProjectId(trimOrEmpty(dto.getProjectId()));
        dto.setSubfolder(trimOrEmpty(dto.getSubfolder()));
        dto.setRequestedFileName(emptyToNull(trimOrEmpty(dto.getRequestedFileName())));

        // Step-2 fields
        dto.setTemplateId(emptyToNull(trimOrEmpty(dto.getTemplateId())));

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
