// src/main/java/com/company/aiapp/service/UserService.java
package com.company.aiapp.service;

import com.company.aiapp.entity.AppUser;
import com.company.aiapp.exception.UserAlreadyExistsException;
import com.company.aiapp.repo.AppUserRepo;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
public class UserService {
  private final AppUserRepo repo;
  private final PasswordEncoder encoder;

  public UserService(AppUserRepo repo, PasswordEncoder encoder) {
    this.repo = repo;
    this.encoder = encoder;
  }

  /** Convenience check for controllers or other services */
  public boolean existsByEmailIgnoreCase(String email) {
    return repo.existsByEmailIgnoreCase(email);
  }

  @Transactional
  public AppUser register(String email, String rawPassword, String displayName) {
    if (repo.existsByEmailIgnoreCase(email)) {
      // Throw specific exception -> handled as 409 by GlobalExceptionHandler
      throw new UserAlreadyExistsException(email);
    }
    AppUser u = new AppUser();
    u.setEmail(email.trim());
    u.setPasswordHash(encoder.encode(rawPassword));
    u.setDisplayName(displayName);
    return repo.save(u);
  }

  /** Used by AuthController.login(...) */
  public AppUser getByEmailOrThrow(String email) {
    return repo.findByEmail(email)
        .orElseThrow(() -> new UsernameNotFoundException("User not found: " + email));
  }

  public Optional<AppUser> findByEmail(String email) {
    return repo.findByEmail(email);
  }
}
