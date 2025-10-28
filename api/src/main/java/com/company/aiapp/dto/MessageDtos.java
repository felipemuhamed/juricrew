package com.company.aiapp.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class MessageDtos {
  // role limited to "user" or "assistant"; adjust if you have other roles
  public record PostMessageReq(
      @Pattern(regexp = "user|assistant", message = "role must be 'user' or 'assistant'")
      String role,
      @NotBlank
      String content
  ) {}
}