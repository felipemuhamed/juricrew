package com.company.aiapp.service;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

import com.company.aiapp.dto.TemplateDetailDto;
import com.company.aiapp.dto.TemplateSummaryDto;
import com.company.aiapp.dto.TemplateUpsertRequest;

public interface TemplateService {

    List<TemplateSummaryDto> list(String orgKey);

    TemplateDetailDto get(String orgKey, UUID templateId) throws IOException;

    TemplateSummaryDto create(String orgKey, UUID createdBy, TemplateUpsertRequest req) throws IOException;

    TemplateSummaryDto update(String orgKey, UUID templateId, TemplateUpsertRequest req) throws IOException;

    void delete(String orgKey, UUID templateId) throws IOException;

    /** Loads markdown only (for the Python generator). */
    String loadMarkdown(String orgKey, UUID templateId) throws IOException;
}
