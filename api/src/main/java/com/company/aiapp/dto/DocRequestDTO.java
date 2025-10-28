package com.company.aiapp.dto;

import java.util.List;

import lombok.Data;

@Data
public class DocRequestDTO {
  public String projectId;
  public String subfolder;           // optional
  public String requestedFileName;   // optional
  public Fields fields;

  @Data
  public static class Fields {
    public String motion_type;
    public String facts;
    public String case_number;
    public String court;
    public String plaintiff;
    public List<String> defendant; // already an array on the FE
  }
}