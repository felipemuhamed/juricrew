package com.company.aiapp.domain;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.Accessors;

import java.time.OffsetDateTime;
import java.util.UUID;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Accessors(fluent = true, chain = true)
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@Entity
@Table(name = "parties", indexes = @Index(name = "ix_parties_case", columnList = "case_id"))
public class PartyEntity {

  @Id
  @EqualsAndHashCode.Include
  private UUID id = UUID.randomUUID();

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "case_id", nullable = false)
  private CaseEntity caseRef;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 16)
  private PartyRole role; // PLAINTIFF | DEFENDANT

  @Column(nullable = false, length = 256)
  private String name;

  @Column(nullable = false)
  private OffsetDateTime createdAt = OffsetDateTime.now();

  @PrePersist
  void onCreate() {
    if (createdAt == null) createdAt = OffsetDateTime.now();
  }
}