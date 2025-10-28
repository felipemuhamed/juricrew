// src/main/java/com/company/aiapp/repo/ConversationRepo.java
package com.company.aiapp.repo;

import com.company.aiapp.entity.AppUser;
import com.company.aiapp.entity.Conversation;
import com.company.aiapp.entity.Project;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConversationRepo extends JpaRepository<Conversation, UUID> {

  // list all (not deleted) ordered by last update
  List<Conversation> findByUserAndDeletedAtIsNullOrderByUpdatedAtDesc(AppUser user);

  // list archived / not archived (not deleted)
  List<Conversation> findByUserAndArchivedAndDeletedAtIsNullOrderByUpdatedAtDesc(AppUser user, boolean archived);

  // list by folder (not deleted)
  List<Conversation> findByUserAndProjectAndDeletedAtIsNullOrderByUpdatedAtDesc(AppUser user, Project project);

  Optional<Conversation> findByIdAndUser(UUID id, AppUser user);
}