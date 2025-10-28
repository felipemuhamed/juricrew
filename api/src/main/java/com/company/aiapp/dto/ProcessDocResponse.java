package com.company.aiapp.dto;

import java.util.UUID;

public class ProcessDocResponse {
  public UUID motionId;
  public String status;     // DRAFT/GENERATING/READY/REJECTED
  public String outputPath; // what FE passes to download endpoint

  public ProcessDocResponse() { }

  public ProcessDocResponse(UUID motionId, String status, String outputPath) {
    this.motionId = motionId;
    this.status = status;
    this.outputPath = outputPath;
  }
}