package com.company.aiapp.dto;

import java.util.UUID;

public class MotionResponse {
  public UUID id;
  public UUID caseId;
  public String title; // e.g., "<caseNumber> - <motionType>"
  public String status;
}