package com.company.aiapp.service;

import java.util.Optional;
import java.util.UUID;

import com.company.aiapp.dto.CreateMotionRequest;
import com.company.aiapp.dto.LatestDocOnly;
import com.company.aiapp.dto.MotionResponse;

public interface MotionService {
	MotionResponse create(CreateMotionRequest req, String authUserId, String orgId);
	
	Optional<LatestDocOnly> findLatestDocOnlyByCaseNumber(String caseNumber, UUID userId, UUID folderId);
}