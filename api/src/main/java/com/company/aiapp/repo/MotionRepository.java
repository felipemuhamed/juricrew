package com.company.aiapp.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.company.aiapp.domain.MotionEntity;
import com.company.aiapp.dto.LatestDocOnly;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MotionRepository extends JpaRepository<MotionEntity, UUID> {

	@Query("""
			select new com.company.aiapp.dto.LatestDocOnly(m.id, m.status, m.outputDocxPath)
			from MotionEntity m
			join m.caseRef c
			where lower(c.caseNumber) = lower(:caseNumber)
			order by m.generatedAt desc nulls last, m.updatedAt desc
			""")
	List<LatestDocOnly> findLatestDocOnly(@Param("caseNumber") String caseNumber, Pageable pageable);

	// latest by owner + caseNumber
	Optional<MotionEntity> findTopByCreatedByAndCaseRef_CaseNumberOrderByGeneratedAtDesc(UUID createdBy,
			String caseNumber);

	// latest by owner + caseNumber + folder (project)
	Optional<MotionEntity> findTopByCreatedByAndCaseRef_CaseNumberAndFolderIdOrderByGeneratedAtDesc(UUID createdBy,
			String caseNumber, UUID folderId);

	// optional orgId variants
	Optional<MotionEntity> findTopByOrgIdAndCaseRef_CaseNumberOrderByGeneratedAtDesc(UUID orgId, String caseNumber);

	Optional<MotionEntity> findTopByOrgIdAndCaseRef_CaseNumberAndFolderIdOrderByGeneratedAtDesc(UUID orgId,
			String caseNumber, UUID folderId);

	// *** Added to satisfy MotionController usage ***

	// All motions across the system ordered by updatedAt desc
	List<MotionEntity> findAllByOrderByUpdatedAtDesc();

	// Motions within a specific folder ordered by updatedAt desc
	List<MotionEntity> findByFolderIdOrderByUpdatedAtDesc(UUID folderId);

	// (Optional) If you want pagination for either of the above:
	List<MotionEntity> findAllByOrderByUpdatedAtDesc(Pageable pageable);

	List<MotionEntity> findByFolderIdOrderByUpdatedAtDesc(UUID folderId, Pageable pageable);

	// (Optional) If you allow "unfiled" motions (no folder):
	List<MotionEntity> findByFolderIdIsNullOrderByUpdatedAtDesc();
}
