package com.company.aiapp.dto;

public record DocResponseDTO(
        String requestId,
        String inputPath,      // relative storage path for input JSON
        String outputPath      // relative storage path for output DOCX
) {}