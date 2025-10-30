package com.company.aiapp.service;

import java.util.UUID;

import com.company.aiapp.repo.AppUserRepo;
import com.company.aiapp.security.AppUserPrincipal;

import org.springframework.security.core.userdetails.*;
import org.springframework.stereotype.Service;

@Service
public class AppUserDetailsService implements UserDetailsService {

	private final AppUserRepo repo;

	public AppUserDetailsService(AppUserRepo repo) {
		this.repo = repo;
	}

	@Override
	public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
		return repo.findByEmail(username).map(AppUserPrincipal::new)
				.orElseThrow(() -> new UsernameNotFoundException("User not found"));
	}

	private UUID findUserIdByEmail(String email) {
		if (email == null || email.isBlank())
			return null;
		return repo.findByEmail(email.trim()).map(u -> u.getId()) // or getUserId()/getUuid() per your entity
				.orElse(null);
	}
}