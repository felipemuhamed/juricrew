package com.company.aiapp.service;

import java.io.IOException;
import java.io.InputStream;

import com.company.aiapp.entity.AppUser;
import com.company.aiapp.entity.Project;

public interface ProjectIndexService {
  /**
   * Ingest a ZIP stream of project files and index them for retrieval.
   * Implement this to push to your embeddings/vector store, etc.
   */
  void indexZip(AppUser owner, Project project, InputStream zipStream) throws IOException;
}