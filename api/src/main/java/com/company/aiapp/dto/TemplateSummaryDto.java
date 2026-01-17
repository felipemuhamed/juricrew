package com.company.aiapp.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class TemplateSummaryDto {
    private UUID id;
    private String name;
    private String description;
    private OffsetDateTime updatedAt;
}
