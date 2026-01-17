package com.company.aiapp.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class TemplateDetailDto {
    private UUID id;
    private String name;
    private String description;
    private String markdown;
    private JsonNode builderJson;
    private OffsetDateTime updatedAt;
}
