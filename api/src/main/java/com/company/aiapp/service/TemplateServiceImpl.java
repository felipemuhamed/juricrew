package com.company.aiapp.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

import com.company.aiapp.config.storage.FileStorage;
import com.company.aiapp.domain.TemplateEntity;
import com.company.aiapp.dto.TemplateDetailDto;
import com.company.aiapp.dto.TemplateSummaryDto;
import com.company.aiapp.dto.TemplateUpsertRequest;
import com.company.aiapp.repo.TemplateRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class TemplateServiceImpl implements TemplateService {

    private final TemplateRepository repo;
    private final FileStorage storage;

    @Override
    @Transactional(readOnly = true)
    public List<TemplateSummaryDto> list(String orgKey) {
        return repo.findAllByOrgKeyOrderByUpdatedAtDesc(orgKey).stream()
            .map(t -> new TemplateSummaryDto(t.id(), t.name(), t.description(), t.updatedAt()))
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public TemplateDetailDto get(String orgKey, UUID templateId) throws IOException {
        TemplateEntity t = repo.findByIdAndOrgKey(templateId, orgKey)
            .orElseThrow(() -> new IllegalArgumentException("Template not found"));

        String markdown = new String(storage.loadBytes(Path.of(t.markdownPath())), StandardCharsets.UTF_8);
        return new TemplateDetailDto(t.id(), t.name(), t.description(), markdown, t.builderJson(), t.updatedAt());
    }

    @Override
    @Transactional
    public TemplateSummaryDto create(String orgKey, UUID createdBy, TemplateUpsertRequest req) throws IOException {
        UUID id = UUID.randomUUID();
        String orgSegment = orgSegment(orgKey);
        Path rel = Path.of("users", orgSegment, "templates", id + ".md");

        Path saved = storage.saveBytes(rel, req.getMarkdown().getBytes(StandardCharsets.UTF_8));

        TemplateEntity t = TemplateEntity.builder()
            .id(id)
            .orgKey(orgKey)
            .name(req.getName().trim())
            .description(trimToNull(req.getDescription()))
            .markdownPath(saved.toString())
            .builderJson(req.getBuilderJson())
            .createdBy(createdBy)
            .build();

        repo.save(t);
        return new TemplateSummaryDto(t.id(), t.name(), t.description(), t.updatedAt());
    }

    @Override
    @Transactional
    public TemplateSummaryDto update(String orgKey, UUID templateId, TemplateUpsertRequest req) throws IOException {
        TemplateEntity t = repo.findByIdAndOrgKey(templateId, orgKey)
            .orElseThrow(() -> new IllegalArgumentException("Template not found"));

        // If markdown path is missing (shouldn't happen), re-create it.
        String pathStr = t.markdownPath();
        if (pathStr == null || pathStr.isBlank()) {
            String orgSegment = orgSegment(orgKey);
            Path rel = Path.of("users", orgSegment, "templates", t.id() + ".md");
            pathStr = storage.resolve(rel).toString();
            t.markdownPath(pathStr);
        }

        storage.saveBytes(Path.of(pathStr), req.getMarkdown().getBytes(StandardCharsets.UTF_8));

        t.name(req.getName().trim());
        t.description(trimToNull(req.getDescription()));
        t.builderJson(req.getBuilderJson());

        repo.save(t);
        return new TemplateSummaryDto(t.id(), t.name(), t.description(), t.updatedAt());
    }

    @Override
    @Transactional
    public void delete(String orgKey, UUID templateId) throws IOException {
        TemplateEntity t = repo.findByIdAndOrgKey(templateId, orgKey)
            .orElseThrow(() -> new IllegalArgumentException("Template not found"));

        try {
            if (t.markdownPath() != null && !t.markdownPath().isBlank()) {
                storage.delete(Path.of(t.markdownPath()));
            }
        } finally {
            repo.delete(t);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public String loadMarkdown(String orgKey, UUID templateId) throws IOException {
        TemplateEntity t = repo.findByIdAndOrgKey(templateId, orgKey)
            .orElseThrow(() -> new IllegalArgumentException("Template not found"));
        return new String(storage.loadBytes(Path.of(t.markdownPath())), StandardCharsets.UTF_8);
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isBlank() ? null : t;
    }

    private static String orgSegment(String orgKey) {
        // stored under users/<orgSegment>/templates/... to be compatible with S3FileStorage's key normalization.
        return "org_" + slugOrDefault(orgKey, "public");
    }

    private static String slugOrDefault(String s, String def) {
        String sl = slug(s);
        return (sl == null || sl.isBlank()) ? def : sl;
    }

    private static String slug(String s) {
        if (s == null) return null;
        String t = s.toLowerCase().replaceAll("[^a-z0-9]+", "_");
        t = t.replaceAll("_+", "_");
        if (t.startsWith("_")) t = t.substring(1);
        if (t.endsWith("_")) t = t.substring(0, t.length() - 1);
        return t.isBlank() ? null : t;
    }
}
