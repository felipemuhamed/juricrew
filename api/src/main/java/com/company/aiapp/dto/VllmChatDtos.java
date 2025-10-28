package com.company.aiapp.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public final class VllmChatDtos {
  private VllmChatDtos() {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record VllmChatRequest(
      String model,
      List<VllmMessage> messages,
      Boolean stream,
      @JsonProperty("max_tokens") Integer maxTokens,
      Double temperature
  ) {
    public static VllmChatRequest of(String model, List<VllmMessage> messages,
                                     Integer maxTokens, Double temperature) {
      return new VllmChatRequest(model, messages, false, maxTokens, temperature);
    }
  }

  public record VllmMessage(String role, String content) {}
  public record VllmChatResponse(List<VllmChoice> choices) {}
  public record VllmChoice(VllmMessage message) {}
}