package com.company.aiapp.repo;

import com.company.aiapp.entity.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface AppUserRepo extends JpaRepository<AppUser, UUID> {
  Optional<AppUser> findByEmail(String email);
  boolean existsByEmailIgnoreCase(String email);
}