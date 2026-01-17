package com.company.aiapp.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.Accessors;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Accessors(fluent = true, chain = true)
@Entity
@Table(
    name = "templates",
    indexes = {
        @Index(name = "ix_templates_org", columnList = "orgKey"),
        @Index(name = "ix_templates_org_name", columnList = "orgKey,name")
    }
)
public class TemplateEntity {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    /**
     * Organization scoping key.
     *
     * Today we derive this from the authenticated user's email domain when X-Org-Id is not provided.
     * This supports "org-wide" templates without requiring a separate org table.
     */
    @Column(nullable = false, length = 128)
    private String orgKey;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(length = 600)
    private String description;

    /** S3 virtual path returned by FileStorage.resolve/saveBytes (e.g., /s3/bucket/org_x/templates/<id>.md) */
    @Column(nullable = false, length = 1024)
    private String markdownPath;

    /** Optional structured builder config used by the UI (JSON). */
    @Column(columnDefinition = "text")
    @JdbcTypeCode(SqlTypes.JSON)
    private JsonNode builderJson;

    /** Optional audit fields. */
    private UUID createdBy;

    @Column(nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    @PrePersist
    void onCreate() {
        final OffsetDateTime now = OffsetDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
