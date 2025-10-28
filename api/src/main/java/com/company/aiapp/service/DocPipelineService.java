package com.company.aiapp.service;

import com.company.aiapp.config.storage.FileStorage;
import com.company.aiapp.dto.DocRequestDTO;
import com.company.aiapp.dto.DocResponseDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Orchestrates: persist input JSON -> call external processor -> store DOCX -> return paths.
 * Folders are organized as:
 *   users/{userId}/{projectId}/{subfolder?}/{requestId}/input.json
 *   users/{userId}/{projectId}/{subfolder?}/{requestId}/output.docx
 */
@Service
public class DocPipelineService {

    private final FileStorage storage;
    private final ExternalProcessorClient external;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public DocPipelineService(FileStorage storage, ExternalProcessorClient external) {
        this.storage = storage;
        this.external = external;
    }

    
    public DocResponseDTO process(DocRequestDTO dto, Authentication auth) {
        String userId = currentUserId(auth);
        String requestId = UUID.randomUUID().toString();

        String dateStamp = OffsetDateTime.now()
                .format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"));

        String baseName = (dto.getRequestedFileName() != null && !dto.getRequestedFileName().isBlank())
                ? dto.getRequestedFileName().trim()
                : "document-" + dateStamp;

        Path baseDir = Path.of("users", userId, dto.getProjectId());
        if (dto.getSubfolder() != null && !dto.getSubfolder().isBlank()) {
            baseDir = baseDir.resolve(dto.getSubfolder().trim());
        }
        baseDir = baseDir.resolve(requestId);

        Path inputRel  = baseDir.resolve("input.json");
        Path outputRel = baseDir.resolve(baseName + ".docx");

        // ---- 1) Adapt typed DTO.Fields -> Map<String,Object> (what your legacy flow expects)
        Map<String, Object> fieldsMap = new LinkedHashMap<>();
        if (dto.getFields() != null) {
            var f = dto.getFields();
            fieldsMap.put("motion_type",  safe(f.getMotion_type()));
            fieldsMap.put("facts",        safe(f.getFacts()));
            fieldsMap.put("case_number",  safe(f.getCase_number()));
            fieldsMap.put("court",        safe(f.getCourt()));
            fieldsMap.put("plaintiff",    safe(f.getPlaintiff()));
            fieldsMap.put("defendant",    (f.getDefendant() != null) ? f.getDefendant() : List.of());
        } else {
            // keep structure predictable even if FE sent null "fields"
            fieldsMap.put("motion_type",  "");
            fieldsMap.put("facts",        "");
            fieldsMap.put("case_number",  "");
            fieldsMap.put("court",        "");
            fieldsMap.put("plaintiff",    "");
            fieldsMap.put("defendant",    List.of());
        }

        // ---- 2) Save input JSON (pretty)
        try {
            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(fieldsMap);
            storage.saveJson(inputRel, json);
        } catch (Exception e) {
            throw new RuntimeException("Failed to save input JSON", e);
        }

        // ---- 3) Generate DOCX via external service (expects Map)
        byte[] docxBytes = external.generateDocx(fieldsMap);
        if (docxBytes == null || docxBytes.length == 0) {
            throw new RuntimeException("External processor returned empty document");
        }

        // ---- 4) Save output DOCX
        try {
            storage.saveBytes(outputRel, docxBytes);
        } catch (Exception e) {
            throw new RuntimeException("Failed to save output DOCX", e);
        }

        return new DocResponseDTO(
                requestId,
                inputRel.toString().replace('\\','/'),
                outputRel.toString().replace('\\','/')
        );
    }

    /** Null-safe trim helper */
    private static String safe(String s) {
        return (s == null) ? "" : s.trim();
    }


    private String currentUserId(Authentication auth) {
        // Keep your existing user principal model; adapt if you store ID elsewhere.
        // Common patterns: username as ID, or a custom UserDetails with getId()
        return auth.getName();
    }
}