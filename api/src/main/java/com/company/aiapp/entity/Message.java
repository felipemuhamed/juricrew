package com.company.aiapp.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "message")
@Getter
@Setter
public class Message {

	@Id
	@GeneratedValue
	private UUID id;

	@ManyToOne(optional = false)
	@JoinColumn(name = "conversation_id")
	private Conversation conversation;

	@Column(nullable = false)
	private String role;

	@Column(nullable = false, columnDefinition = "text")
	private String content;

	private String model;

	private Integer latencyMs;

	@Column(name = "metadata", columnDefinition = "jsonb", nullable = false)
	@JdbcTypeCode(SqlTypes.JSON)
	private Map<String, Object> metadata = new HashMap<>();

	@PrePersist
	void ensureMetadata() {
		if (metadata == null)
			metadata = new HashMap<>();
	}

	@CreationTimestamp
	private Instant createdAt;
}
