package com.company.aiapp.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.company.aiapp.domain.TemplateEntity;

@Repository
public interface TemplateRepository extends JpaRepository<TemplateEntity, UUID> {
    List<TemplateEntity> findAllByOrgKeyOrderByUpdatedAtDesc(String orgKey);

    Optional<TemplateEntity> findByIdAndOrgKey(UUID id, String orgKey);

    boolean existsByIdAndOrgKey(UUID id, String orgKey);
}
