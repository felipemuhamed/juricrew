package com.company.aiapp.repo;

import java.util.List;
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

	// All motions filed in a given project/folder (most recent first)
	List<MotionEntity> findByFolderIdOrderByUpdatedAtDesc(UUID folderId);

	// Unfiled motions (no folder)
	List<MotionEntity> findByFolderIdIsNullOrderByUpdatedAtDesc();

	// (Optional) everything, most recent first
	List<MotionEntity> findAllByOrderByUpdatedAtDesc();
}