package com.company.aiapp.service;

import com.company.aiapp.entity.AppUser;
import com.company.aiapp.entity.Conversation;
import com.company.aiapp.entity.Project;
import com.company.aiapp.repo.ConversationRepo;
import com.company.aiapp.repo.ProjectRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
public class ConversationService {
	private final ConversationRepo convRepo;
	private final ProjectRepository projects;

	public ConversationService(ConversationRepo convRepo, ProjectRepository projects) {
		this.convRepo = convRepo;
		this.projects = projects;
	}

	// NEW: create with optional folder
	public Conversation create(AppUser user, String title, UUID projectIdOrNull) {
		Conversation c = new Conversation();
		c.setUser(user);
		c.setTitle(title);
		if (projectIdOrNull != null) {
			Project p = projects.findByIdAndUser(projectIdOrNull, user)
					.orElseThrow(() -> new IllegalArgumentException("Folder not found"));
			c.setProject(p);
		}
		return convRepo.save(c);
	}

	// Keep your existing helpers
	public List<Conversation> list(AppUser user) {
		return convRepo.findByUserAndDeletedAtIsNullOrderByUpdatedAtDesc(user);
	}

	public List<Conversation> listArchived(AppUser user) {
		return convRepo.findByUserAndArchivedAndDeletedAtIsNullOrderByUpdatedAtDesc(user, true);
	}

	public List<Conversation> listByProject(AppUser user, Project p) {
		return convRepo.findByUserAndProjectAndDeletedAtIsNullOrderByUpdatedAtDesc(user, p);
	}

	public Conversation getOwnedOrThrow(AppUser user, UUID id) {
		var c = convRepo.findById(id).orElseThrow(() -> new RuntimeException("Conversation not found"));
		if (!c.getUser().getId().equals(user.getId()))
			throw new RuntimeException("Forbidden");
		return c;
	}

	public Conversation setArchived(AppUser user, UUID convId, boolean archived) {
		var c = getOwnedOrThrow(user, convId);
		c.setArchived(archived);
		return convRepo.save(c);
	}

	public Conversation moveToProject(AppUser user, UUID convId, Project projectOrNull) {
		var c = getOwnedOrThrow(user, convId);
		c.setProject(projectOrNull);
		return convRepo.save(c);
	}

	public void softDelete(AppUser user, UUID convId) {
		var c = getOwnedOrThrow(user, convId);
		c.setDeletedAt(java.time.Instant.now());
		convRepo.save(c);
	}

	public Conversation save(Conversation c) {
		return convRepo.save(c);
	}
	
	public Conversation rename(AppUser user, UUID convId, String title) {
		  var c = getOwnedOrThrow(user, convId);
		  c.setTitle(title);
		  return convRepo.save(c);
		}
}