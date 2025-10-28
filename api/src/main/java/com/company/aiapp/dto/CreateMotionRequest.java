package com.company.aiapp.dto;

import java.time.LocalDate;
import java.util.List;

public class CreateMotionRequest {
  public String motionType;
  public String facts;

  public String caseNumber;
  public String court;

  public String plaintiff;
  public List<String> defendants;

  // optional niceties
  public String jurisdictionCountry;
  public String jurisdictionState;
  public String jurisdictionCounty;
  public String judge;
  public String division;

  public String priority;     // LOW|MEDIUM|HIGH
  public LocalDate dueDate;
  public LocalDate hearingDate;
  public List<String> tags;
  public String notes;

  public String templateKey;
  public String templateVersion;

  public String folderId;     // UUID string
}