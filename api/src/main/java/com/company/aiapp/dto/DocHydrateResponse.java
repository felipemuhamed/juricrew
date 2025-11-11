package com.company.aiapp.dto;

import java.util.UUID;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class DocHydrateResponse {
  private UUID motionId;      // for future ops if you need
  private String status;      // READY/GENERATING/DRAFT/REJECTED
  private String outputPath;  // S3 or relative path (for /docs/download?path=)
  private DocRequestDTOHydrate.Fields fields; // your form fields object
}