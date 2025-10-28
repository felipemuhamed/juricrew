package com.company.aiapp.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.company.aiapp.entity.AppUser;
import com.company.aiapp.entity.Project;

import org.springframework.data.jpa.repository.JpaRepository;

//ProjectRepository.java
public interface ProjectRepository extends JpaRepository<Project, UUID> {
	  List<Project> findByUserOrderByUpdatedAtDesc(AppUser user);
	  Optional<Project> findByIdAndUser(UUID id, AppUser user);
	}
