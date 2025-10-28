package com.company.aiapp.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public class ChatDtos {
	public record ChatReq(@NotNull UUID conversationId) {
	}

	public record ChatResp(String answer, int latencyMs) {
	}
}
