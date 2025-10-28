package com.company.aiapp.dto;

import java.util.UUID;

public class ProjectDtos {
  // allow creating a folder with an optional parent
  public record CreateProjectReq(String name, UUID parentId) {}

  public record RenameProjectReq(String name) {}

  // include parentId in the response so the UI can build a tree
  public record ProjectResp(UUID id, String name, UUID parentId) {}
}
