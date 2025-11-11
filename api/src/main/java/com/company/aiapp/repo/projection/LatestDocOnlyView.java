package com.company.aiapp.repo.projection;

import java.util.UUID;

import com.company.aiapp.domain.MotionStatus;

/** Projection mapped from native queries (column aliases must match these names). */
public interface LatestDocOnlyView {
    UUID getId();
    MotionStatus getStatus();          // enum stored as text/varchar in DB
    String getOutputDocxPath();  // maps to output_docx_path
}