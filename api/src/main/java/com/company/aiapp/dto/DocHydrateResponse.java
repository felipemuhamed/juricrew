package com.company.aiapp.dto;

import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class DocHydrateResponse {
  private UUID motionId;      // for future ops if you need
  private String status;      // READY/GENERATING/DRAFT/REJECTED
  private String outputPath;  // S3 or relative path (for /docs/download?path=)

  // Step 1 fields
  private DocRequestDTOHydrate.Fields fields;

  // Step 2 fields (optional for older motions)
  private String templateId;
  private JsonNode selectedAuthorities;

  // Step 1: saved authority research results
  private JsonNode researchedAuthorities;

  // Output metadata (bucket/key/fileName/etc)
  private JsonNode outputMetadata;
}
