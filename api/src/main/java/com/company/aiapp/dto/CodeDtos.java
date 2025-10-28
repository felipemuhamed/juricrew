package com.company.aiapp.dto;

import jakarta.validation.constraints.NotBlank;

public class CodeDtos {
  public record CompleteReq(@NotBlank String prompt) {}
}