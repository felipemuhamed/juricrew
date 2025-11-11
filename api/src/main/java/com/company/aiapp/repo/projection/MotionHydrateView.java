package com.company.aiapp.repo.projection;

import java.util.UUID;

// Interface-based projection for native queries
public interface MotionHydrateView {
    UUID getId();
    String getInputSnapshot();   // jsonb -> text
    String getOutputDocxPath();  // may be null
    String getStatus();          // READY / GENERATING / DRAFT / REJECTED
}
