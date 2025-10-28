package com.company.aiapp.service;

import com.company.aiapp.entity.*;
import com.company.aiapp.repo.ProjectRepository;
import org.springframework.stereotype.Service;

import io.micrometer.common.lang.Nullable;

import java.util.*;

@Service
public class ProjectService {
  private final ProjectRepository repo;

  public ProjectService(ProjectRepository repo) { this.repo = repo; }

  public Project create(AppUser u, String name, @Nullable UUID parentId) {
	  var p = new Project();
	  p.setUser(u);
	  p.setName(name);
	  if (parentId != null) {
	    var parent = repo.findByIdAndUser(parentId, u)
	        .orElseThrow(() -> new IllegalArgumentException("Parent not found"));
	    p.setParent(parent);
	  }
	  return repo.save(p);
	}

  public List<Project> list(AppUser u) { return repo.findByUserOrderByUpdatedAtDesc(u); }

  public Project ownedOrThrow(AppUser u, UUID id) {
    return repo.findByIdAndUser(id, u).orElseThrow(() -> new IllegalArgumentException("Project not found"));
  }

  public Project rename(AppUser u, UUID id, String name) {
    var p = ownedOrThrow(u, id);
    p.setName(name);
    return repo.save(p);
  }

  public void delete(AppUser u, UUID id) {
    var p = ownedOrThrow(u, id);
    repo.delete(p); // conversations get project_id set to NULL by FK rule
  }
}