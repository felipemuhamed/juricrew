// src/main/java/com/company/aiapp/entity/Conversation.java
package com.company.aiapp.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "conversation")
@Getter
@Setter
public class Conversation {

  @Id
  @GeneratedValue
  private UUID id;

  @ManyToOne(optional = false)
  @JoinColumn(name = "user_id")
  private AppUser user;

  private String title;

  @Column(name = "metadata", columnDefinition = "jsonb", nullable = false)
  @JdbcTypeCode(SqlTypes.JSON)
  private Map<String, Object> metadata = new HashMap<>();

  // NEW: optional folder
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "project_id")
  private Project project;

  // NEW: archived flag
  @Column(nullable = false)
  private boolean archived = false;

  // NEW: soft-delete timestamp
  @Column(name = "deleted_at")
  private Instant deletedAt;

  @PrePersist
  void ensureMetadata() {
    if (metadata == null) metadata = new HashMap<>();
  }

  @CreationTimestamp
  private Instant createdAt;

  @UpdateTimestamp
  private Instant updatedAt;
}