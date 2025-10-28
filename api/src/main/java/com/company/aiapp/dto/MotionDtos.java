package com.company.aiapp.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public class MotionDtos {

	public record MoveMotionReq(UUID projectId) {
	}

	public record MotionResp(UUID id, String caseNumber, String motionType, String status, OffsetDateTime updatedAt,
			UUID projectId) {
	}
}
