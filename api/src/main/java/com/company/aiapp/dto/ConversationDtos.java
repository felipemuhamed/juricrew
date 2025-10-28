// src/main/java/com/company/aiapp/dto/ConversationDtos.java
package com.company.aiapp.dto;

import java.time.Instant;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;

public class ConversationDtos {
	public record CreateConversationReq(String title, UUID projectId) {}
	  public record MoveConversationReq(UUID projectId) {}
	  public record ArchiveConversationReq(boolean archived) {}
	  public record ConversationResp(
	      UUID id,
	      String title,
	      Instant updatedAt,
	      UUID projectId,
	      boolean archived
	  ) {}
	  
	  public record RenameConversationReq(@NotBlank String title) {}
}
