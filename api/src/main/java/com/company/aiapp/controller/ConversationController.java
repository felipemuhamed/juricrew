// src/main/java/com/company/aiapp/controller/ConversationController.java
package com.company.aiapp.controller;

import com.company.aiapp.dto.ConversationDtos.*;
import com.company.aiapp.entity.Conversation;
import com.company.aiapp.service.ConversationService;
import com.company.aiapp.service.ProjectService;
import com.company.aiapp.service.UserService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/conversations")
public class ConversationController {

    private final ConversationService convs;
    private final UserService users;
    private final ProjectService projects;

    public ConversationController(
            ConversationService convs,
            UserService users,
            ProjectService projects
    ) {
        this.convs = convs;
        this.users = users;
        this.projects = projects;
    }

    @PostMapping
    public ResponseEntity<?> create(
            @AuthenticationPrincipal UserDetails principal,
            @Valid @RequestBody CreateConversationReq req
    ) {
        var u = users.getByEmailOrThrow(principal.getUsername());

        // ✔ pass projectId (can be null) to match ConversationService.create signature
        Conversation c = convs.create(u, req.title(), req.projectId());

        var body = new ConversationResp(
                c.getId(),
                c.getTitle(),
                c.getUpdatedAt(),
                c.getProject() == null ? null : c.getProject().getId(),
                c.isArchived()
        );

        return ResponseEntity
                .created(URI.create("/conversations/" + c.getId()))
                .body(body);
    }

    @GetMapping
    public ResponseEntity<?> list(
            @AuthenticationPrincipal UserDetails principal,
            @RequestParam(required = false) UUID projectId,
            @RequestParam(required = false, defaultValue = "false") boolean archived
    ) {
        var u = users.getByEmailOrThrow(principal.getUsername());

        List<Conversation> list;
        if (archived) {
            list = convs.listArchived(u);
        } else if (projectId != null) {
            var p = projects.ownedOrThrow(u, projectId);
            list = convs.listByProject(u, p);
        } else {
            list = convs.list(u);
        }

        var resp = list.stream()
                .map(c -> new ConversationResp(
                        c.getId(),
                        c.getTitle(),
                        c.getUpdatedAt(),
                        c.getProject() == null ? null : c.getProject().getId(),
                        c.isArchived()
                ))
                .toList();

        return ResponseEntity.ok(resp);
    }

    @PatchMapping("/{id}/archive")
    public ResponseEntity<?> archive(
            @AuthenticationPrincipal UserDetails principal,
            @PathVariable UUID id,
            @RequestBody ArchiveConversationReq req
    ) {
        var u = users.getByEmailOrThrow(principal.getUsername());
        convs.setArchived(u, id, req.archived());
        return ResponseEntity.ok().build();
    }

    @PatchMapping("/{id}/move")
    public ResponseEntity<?> move(
            @AuthenticationPrincipal UserDetails principal,
            @PathVariable UUID id,
            @RequestBody MoveConversationReq req
    ) {
        var u = users.getByEmailOrThrow(principal.getUsername());
        var p = (req.projectId() == null) ? null : projects.ownedOrThrow(u, req.projectId());
        convs.moveToProject(u, id, p);
        return ResponseEntity.ok().build();
    }

    @PatchMapping("/{id}/rename")
    public ResponseEntity<?> rename(
            @AuthenticationPrincipal UserDetails principal,
            @PathVariable UUID id,
            @Valid @RequestBody RenameConversationReq req
    ) {
        var u = users.getByEmailOrThrow(principal.getUsername());
        var c = convs.rename(u, id, req.title());
        return ResponseEntity.ok(new ConversationResp(
                c.getId(),
                c.getTitle(),
                c.getUpdatedAt(),
                c.getProject() == null ? null : c.getProject().getId(),
                c.isArchived()
        ));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(
            @AuthenticationPrincipal UserDetails principal,
            @PathVariable UUID id
    ) {
        var u = users.getByEmailOrThrow(principal.getUsername());
        convs.softDelete(u, id);
        return ResponseEntity.noContent().build();
    }
}