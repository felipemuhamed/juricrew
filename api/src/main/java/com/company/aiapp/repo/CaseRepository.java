package com.company.aiapp.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

import com.company.aiapp.domain.CaseEntity;

public interface CaseRepository extends JpaRepository<CaseEntity, UUID> {
  Optional<CaseEntity> findByOrgIdAndCaseNumber(UUID orgId, String caseNumber);
}