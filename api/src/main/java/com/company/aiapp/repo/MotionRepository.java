package com.company.aiapp.repo;

import com.company.aiapp.domain.MotionEntity;
import com.company.aiapp.repo.projection.LatestDocOnlyView;
import com.company.aiapp.repo.projection.LatestDocView;
import com.company.aiapp.repo.projection.MotionHydrateView;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MotionRepository extends JpaRepository<MotionEntity, UUID> {

  // ===== Conversation-scoped hydrate =====

  Optional<MotionEntity> findTop1ByConversationIdAndCreatedByOrderByUpdatedAtDesc(UUID conversationId, UUID createdBy);

  Optional<MotionEntity> findTop1ByConversationIdOrderByUpdatedAtDesc(UUID conversationId);

  // ===== HYDRATE (with inputSnapshot / no LOB streaming at runtime) =====

  @Query("""
      select m.id as id,
             m.status as status,
             m.outputDocxPath as outputDocxPath,
             m.inputSnapshot as inputSnapshot
        from MotionEntity m
       where m.createdBy = :userId
         and m.caseRef.caseNumber = :caseNumber
    order by m.generatedAt desc
    """)
  Optional<MotionHydrateView> findHydrateByCreatedByAndCase(@Param("userId") UUID userId,
                                                            @Param("caseNumber") String caseNumber);

  @Query("""
      select m.id as id,
             m.status as status,
             m.outputDocxPath as outputDocxPath,
             m.inputSnapshot as inputSnapshot
        from MotionEntity m
       where m.createdBy = :userId
         and m.caseRef.caseNumber = :caseNumber
         and m.folderId = :folderId
    order by m.generatedAt desc
    """)
  Optional<MotionHydrateView> findHydrateByCreatedByAndCaseAndFolder(@Param("userId") UUID userId,
                                                                     @Param("caseNumber") String caseNumber,
                                                                     @Param("folderId") UUID folderId);

  @Query("""
      select m.id as id,
             m.status as status,
             m.outputDocxPath as outputDocxPath,
             m.inputSnapshot as inputSnapshot
        from MotionEntity m
       where m.caseRef.caseNumber = :caseNumber
    order by m.generatedAt desc
    """)
  Optional<MotionHydrateView> findHydrateByCase(@Param("caseNumber") String caseNumber);

  @Query("""
      select m.id as id,
             m.status as status,
             m.outputDocxPath as outputDocxPath,
             m.inputSnapshot as inputSnapshot
        from MotionEntity m
       where m.caseRef.caseNumber = :caseNumber
         and m.folderId = :folderId
    order by m.generatedAt desc
    """)
  Optional<MotionHydrateView> findHydrateByCaseAndFolder(@Param("caseNumber") String caseNumber,
                                                         @Param("folderId") UUID folderId);

  // ===== LITE (no LOBs) — used by /docs/latest =====

  @Query("""
      select m.id as id,
             cast(m.status as string) as status,
             m.outputDocxPath as outputDocxPath
        from MotionEntity m
       where m.createdBy = :userId
         and m.caseRef.caseNumber = :caseNumber
    order by m.generatedAt desc
    """)
  Optional<LatestDocView> findLiteByCreatedByAndCaseOrderByGeneratedAtDesc(@Param("userId") UUID userId,
                                                                           @Param("caseNumber") String caseNumber);

  @Query("""
      select m.id as id,
             cast(m.status as string) as status,
             m.outputDocxPath as outputDocxPath
        from MotionEntity m
       where m.createdBy = :userId
         and m.caseRef.caseNumber = :caseNumber
         and m.folderId = :folderId
    order by m.generatedAt desc
    """)
  Optional<LatestDocView> findLiteByCreatedByAndCaseAndFolderOrderByGeneratedAtDesc(@Param("userId") UUID userId,
                                                                                    @Param("caseNumber") String caseNumber,
                                                                                    @Param("folderId") UUID folderId);

  @Query("""
      select m.id as id,
             cast(m.status as string) as status,
             m.outputDocxPath as outputDocxPath
        from MotionEntity m
       where m.caseRef.caseNumber = :caseNumber
    order by m.generatedAt desc
    """)
  Optional<LatestDocView> findLiteByCaseOrderByGeneratedAtDesc(@Param("caseNumber") String caseNumber);

  @Query("""
      select m.id as id,
             cast(m.status as string) as status,
             m.outputDocxPath as outputDocxPath
        from MotionEntity m
       where m.caseRef.caseNumber = :caseNumber
         and m.folderId = :folderId
    order by m.generatedAt desc
    """)
  Optional<LatestDocView> findLiteByCaseAndFolderOrderByGeneratedAtDesc(@Param("caseNumber") String caseNumber,
                                                                        @Param("folderId") UUID folderId);

  // ===== Lists for the “motions” page =====

  /** All motions inside a project (folder), newest first. */
  @Query("select m from MotionEntity m where m.folderId = :folderId order by m.updatedAt desc")
  List<MotionEntity> findByFolderOrderByUpdatedDesc(@Param("folderId") UUID folderId);

  /** All motions (any folder or unfiled), newest first. */
  @Query("select m from MotionEntity m order by m.updatedAt desc")
  List<MotionEntity> findAllOrderByUpdatedDesc();

  // ===== Native: “latest doc only” compact projection (nullable filters) =====

  @Query(value = """
		  select
		    m.id                       as id,
		    cast(m.status as varchar)  as status,
		    m.output_docx_path         as outputDocxPath
		  from motions m
		  join cases c on c.id = m.case_id
		  where (:userId  is null or m.created_by = :userId)
		    and c.case_number = :caseNumber
		    and (:folderId is null or m.folder_id = :folderId)
		  order by m.generated_at desc nulls last, m.updated_at desc
		  limit 1
		  """, nativeQuery = true)
		Optional<LatestDocOnlyView> findLatestDocOnlyNative(@Param("userId") UUID userId,
		                                                    @Param("caseNumber") String caseNumber,
		                                                    @Param("folderId") UUID folderId);

}
