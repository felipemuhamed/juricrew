package com.company.aiapp.repo.projection;

import java.util.UUID;

public interface LatestDocView {
    UUID getId();
    String getStatus();          // enum name
    String getOutputDocxPath();  // relative path for /docs/download
}