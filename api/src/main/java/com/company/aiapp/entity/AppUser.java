package com.company.aiapp.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_user")
@Getter
@Setter
public class AppUser {
	
	@Id
	@GeneratedValue
	private UUID id;
	
	@Column(nullable = false, unique = true)
	private String email;
	
	@Column(name = "password_hash", nullable = false)
	private String passwordHash;
	
	private String displayName;
	
	@CreationTimestamp
	private Instant createdAt;
}
