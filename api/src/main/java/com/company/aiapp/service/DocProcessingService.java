package com.company.aiapp.service;

import com.company.aiapp.dto.DocRequestDTO;
import com.company.aiapp.dto.ProcessDocResponse;

public interface DocProcessingService {
  ProcessDocResponse process(DocRequestDTO dto, String userId, String orgId);
}