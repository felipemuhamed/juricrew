package com.company.aiapp.controller;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

import com.company.aiapp.dto.ProjectDtos.CreateProjectReq;
import com.company.aiapp.dto.ProjectDtos.ProjectResp;
import com.company.aiapp.dto.ProjectDtos.RenameProjectReq;
import com.company.aiapp.entity.Project;
import com.company.aiapp.entity.AppUser;
import com.company.aiapp.service.ProjectIndexService;
import com.company.aiapp.service.ProjectService;
import com.company.aiapp.service.UserService;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/projects")
public class ProjectController {

  private final ProjectService projects;
  private final UserService users;
  private final ProjectIndexService indexer;

  public ProjectController(ProjectService projects, UserService users, ProjectIndexService indexer) {
    this.projects = projects;
    this.users = users;
    this.indexer = indexer;
  }

  @PostMapping
  public ResponseEntity<ProjectResp> create(@AuthenticationPrincipal UserDetails principal,
                                            @RequestBody CreateProjectReq req) {
    var u = users.getByEmailOrThrow(principal.getUsername());
    var p = projects.create(u, req.name(), req.parentId());
    return ResponseEntity.ok(
        new ProjectResp(p.getId(), p.getName(), p.getParent() == null ? null : p.getParent().getId())
    );
  }

  @GetMapping
  public ResponseEntity<List<ProjectResp>> list(@AuthenticationPrincipal UserDetails principal) {
    var u = users.getByEmailOrThrow(principal.getUsername());
    var list = projects.list(u).stream()
        .map(p -> new ProjectResp(p.getId(), p.getName(), p.getParent() == null ? null : p.getParent().getId()))
        .toList();
    return ResponseEntity.ok(list);
  }

  @PatchMapping("/{id}")
  public ResponseEntity<ProjectResp> rename(@AuthenticationPrincipal UserDetails principal,
                                            @PathVariable UUID id,
                                            @RequestBody RenameProjectReq req) {
    var u = users.getByEmailOrThrow(principal.getUsername());
    var p = projects.rename(u, id, req.name());
    return ResponseEntity.ok(
        new ProjectResp(p.getId(), p.getName(), p.getParent() == null ? null : p.getParent().getId())
    );
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@AuthenticationPrincipal UserDetails principal,
                                     @PathVariable UUID id) {
    var u = users.getByEmailOrThrow(principal.getUsername());
    projects.delete(u, id);
    return ResponseEntity.noContent().build();
  }

  /**
   * NEW: upload a ZIP of source files for indexing/retrieval.
   * The extension sends Content-Type: application/zip.
   */
  @PostMapping(
      value = "/{id}/index",
      consumes = { "application/zip", MediaType.APPLICATION_OCTET_STREAM_VALUE }
  )
  public ResponseEntity<Void> index(@AuthenticationPrincipal UserDetails principal,
                                    @PathVariable UUID id,
                                    HttpServletRequest request) throws IOException {
    AppUser u = users.getByEmailOrThrow(principal.getUsername());
    Project p = projects.ownedOrThrow(u, id);

    indexer.indexZip(u, p, request.getInputStream());
    // 202 Accepted (async) or 204 No Content (sync) are both fine; the extension checks resp.ok
    return ResponseEntity.accepted().build();
  }


  // Alias route used by the new UI (explicit /rename path)
  @PatchMapping("/{id}/rename")
  public ResponseEntity<ProjectResp> renameExplicit(@AuthenticationPrincipal UserDetails principal,
                                                    @PathVariable UUID id,
                                                    @RequestBody RenameProjectReq req) {
    var u = users.getByEmailOrThrow(principal.getUsername());
    var p = projects.rename(u, id, req.name());
    return ResponseEntity.ok(
        new ProjectResp(p.getId(), p.getName(), p.getParent() == null ? null : p.getParent().getId())
    );
  }
}
