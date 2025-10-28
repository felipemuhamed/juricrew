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
@Accessors(fluent = true, chain = true) // <-- enables nc.caseNumber("...") style
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@Entity
@Table(name = "cases",
       indexes = {
         @Index(name = "ux_cases_org_case", columnList = "orgId,caseNumber", unique = true)
       })
public class CaseEntity {

  @Id
  @EqualsAndHashCode.Include
  private UUID id = UUID.randomUUID();

  @Column(nullable = false, length = 128)
  private String caseNumber;

  private String court;

  private String jurisdictionCountry;
  private String jurisdictionState;
  private String jurisdictionCounty;

  private String judge;
  private String division;

  private String status;

  private UUID orgId;
  private UUID createdBy;

  @Column(nullable = false)
  private OffsetDateTime createdAt = OffsetDateTime.now();

  @Column(nullable = false)
  private OffsetDateTime updatedAt = OffsetDateTime.now();

  @PreUpdate
  void onUpdate() {
    updatedAt = OffsetDateTime.now();
  }
}