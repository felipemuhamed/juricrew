package com.company.aiapp.dto;

import com.company.aiapp.domain.MotionStatus;
import java.util.UUID;

public record LatestDocOnly(UUID id, MotionStatus status, String outputDocxPath) {
}