package com.company.aiapp.controller;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

import com.company.aiapp.dto.TemplateDetailDto;
import com.company.aiapp.dto.TemplateSummaryDto;
import com.company.aiapp.dto.TemplateUpsertRequest;
import com.company.aiapp.security.AppUserPrincipal;
import com.company.aiapp.service.TemplateService;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/templates")
public class TemplateController {

    private final TemplateService templates;

    public TemplateController(TemplateService templates) {
        this.templates = templates;
    }

    @GetMapping
    public List<TemplateSummaryDto> list(
        @RequestHeader(value = "X-Org-Id", required = false) String orgHeader,
        Authentication auth
    ) {
        String orgKey = resolveOrgKey(orgHeader, auth);
        return templates.list(orgKey);
    }

    @GetMapping("/{id}")
    public TemplateDetailDto get(
        @PathVariable("id") UUID id,
        @RequestHeader(value = "X-Org-Id", required = false) String orgHeader,
        Authentication auth
    ) throws IOException {
        String orgKey = resolveOrgKey(orgHeader, auth);
        return templates.get(orgKey, id);
    }

    @PostMapping
    public TemplateSummaryDto create(
        @Valid @RequestBody TemplateUpsertRequest req,
        @RequestHeader(value = "X-Org-Id", required = false) String orgHeader,
        Authentication auth
    ) throws IOException {
        String orgKey = resolveOrgKey(orgHeader, auth);
        UUID createdBy = resolveUserId(auth);
        return templates.create(orgKey, createdBy, req);
    }

    @PutMapping("/{id}")
    public TemplateSummaryDto update(
        @PathVariable("id") UUID id,
        @Valid @RequestBody TemplateUpsertRequest req,
        @RequestHeader(value = "X-Org-Id", required = false) String orgHeader,
        Authentication auth
    ) throws IOException {
        String orgKey = resolveOrgKey(orgHeader, auth);
        return templates.update(orgKey, id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
        @PathVariable("id") UUID id,
        @RequestHeader(value = "X-Org-Id", required = false) String orgHeader,
        Authentication auth
    ) throws IOException {
        String orgKey = resolveOrgKey(orgHeader, auth);
        templates.delete(orgKey, id);
        return ResponseEntity.noContent().build();
    }

    private static UUID resolveUserId(Authentication auth) {
        if (auth == null) return null;
        Object p = auth.getPrincipal();
        if (p instanceof AppUserPrincipal aup) return aup.getId();
        return null;
    }

    private static String resolveOrgKey(String orgHeader, Authentication auth) {
        if (orgHeader != null && !orgHeader.trim().isEmpty()) {
            return orgHeader.trim();
        }
        String email = null;
        if (auth != null) {
            Object p = auth.getPrincipal();
            if (p instanceof AppUserPrincipal aup) {
                email = aup.getEmail();
            } else {
                email = auth.getName();
            }
        }
        if (email == null || email.isBlank()) return "public";
        int at = email.indexOf('@');
        if (at < 0 || at == email.length() - 1) return "public";
        return email.substring(at + 1).toLowerCase();
    }
}
