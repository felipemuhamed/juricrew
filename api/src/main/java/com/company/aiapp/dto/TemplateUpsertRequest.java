package com.company.aiapp.dto;

import com.fasterxml.jackson.databind.JsonNode;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class TemplateUpsertRequest {

    @NotBlank
    private String name;

    private String description;

    @NotBlank
    private String markdown;

    /** Optional builder JSON (helps the UI re-hydrate the guided form). */
    private JsonNode builderJson;
}
