package com.company.aiapp.controller;

import java.util.List;
import java.util.UUID;

import com.company.aiapp.domain.MotionEntity;
import com.company.aiapp.dto.CreateMotionRequest;
import com.company.aiapp.dto.MotionDtos.MotionResp;
import com.company.aiapp.dto.MotionDtos.MoveMotionReq;
import com.company.aiapp.dto.MotionResponse;
import com.company.aiapp.entity.AppUser;
import com.company.aiapp.entity.Project;
import com.company.aiapp.repo.MotionRepository;
import com.company.aiapp.service.MotionService;
import com.company.aiapp.service.ProjectService;
import com.company.aiapp.service.UserService;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/motions")
public class MotionController {

  private final MotionService motionsService;
  private final MotionRepository motionsRepo;
  private final UserService users;
  private final ProjectService projects;

  public MotionController(
      MotionRepository motionsRepo,
      UserService users,
      ProjectService projects,
      MotionService motionsService
  ) {
    this.motionsRepo = motionsRepo;
    this.users = users;
    this.projects = projects;
    this.motionsService = motionsService;
  }

  @PostMapping
  public ResponseEntity<MotionResponse> create(@RequestBody CreateMotionRequest req,
                                               @RequestHeader("X-Org-Id") String orgId,
                                               @RequestHeader("X-User-Id") String userId) {
    return ResponseEntity.ok(motionsService.create(req, userId, orgId));
  }

  @GetMapping
  public ResponseEntity<List<MotionResp>> list(
      @AuthenticationPrincipal UserDetails principal,
      @RequestParam(required = false) UUID projectId
  ) {
    AppUser u = users.getByEmailOrThrow(principal.getUsername());

    List<MotionEntity> list;
    if (projectId != null) {
      // validate ownership of folder
      Project p = projects.ownedOrThrow(u, projectId);
      // ✅ uses native-query helper
      list = motionsRepo.findByFolderOrderByUpdatedDesc(p.getId());
    } else {
      // ✅ all motions ordered by updatedAt (native-query helper)
      list = motionsRepo.findAllOrderByUpdatedDesc();
      // If you ever want “only unfiled” instead, add a native helper and swap here.
    }

    var resp = list.stream().map(this::toResp).toList();
    return ResponseEntity.ok(resp);
  }

  @PatchMapping("/{id}/move")
  public ResponseEntity<Void> move(
      @AuthenticationPrincipal UserDetails principal,
      @PathVariable UUID id,
      @RequestBody MoveMotionReq req
  ) {
    AppUser u = users.getByEmailOrThrow(principal.getUsername());
    MotionEntity m = motionsRepo.findById(id).orElseThrow();

    // validate destination (or allow null to unfile)
    UUID dest = null;
    if (req.projectId() != null) {
      Project p = projects.ownedOrThrow(u, req.projectId());
      dest = p.getId();
    }

    m.folderId(dest);
    motionsRepo.save(m);
    return ResponseEntity.ok().build();
  }

  // ---- mapper ----
  private MotionResp toResp(MotionEntity m) {
    String caseNumber = (m.caseRef() != null && m.caseRef().caseNumber() != null)
        ? m.caseRef().caseNumber()
        : null;

    return new MotionResp(
        m.id(),
        caseNumber,
        m.motionType(),
        m.status() == null ? null : m.status().name(),
        m.updatedAt(),
        m.folderId()
    );
  }
}
