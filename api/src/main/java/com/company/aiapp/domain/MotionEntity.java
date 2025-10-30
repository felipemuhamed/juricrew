package com.company.aiapp.domain;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.Accessors;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Accessors(fluent = true, chain = true)
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@Entity
@Table(name = "motions", indexes = { @Index(name = "ix_motions_case", columnList = "case_id"),
		@Index(name = "ix_motions_folder", columnList = "folderId") })
public class MotionEntity {

	@Id
	@EqualsAndHashCode.Include
	private UUID id = UUID.randomUUID();

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "case_id", nullable = false)
	private CaseEntity caseRef;

	@Column(nullable = false, length = 128)
	private String motionType;

	@Lob
	private String facts;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 32)
	@Builder.Default
	private MotionStatus status = MotionStatus.DRAFT;

	@Enumerated(EnumType.STRING)
	@Column(length = 16)
	@Builder.Default
	private Priority priority = Priority.MEDIUM;

	private LocalDate dueDate;
	private LocalDate hearingDate;

	@Lob
	private String tags;

	@Lob
	private String notes;

	private String templateKey;
	private String templateVersion;

	@Column(name = "input_snapshot", columnDefinition = "jsonb")
	@JdbcTypeCode(SqlTypes.JSON)
	private JsonNode inputSnapshot;

	@Lob
	private String outputDocxPath;
	@Lob
	private String outputPdfPath;
	@Lob
	private String generationLog;

	private UUID orgId;
	private UUID folderId;
	private UUID createdBy;

	@Column(nullable = false)
	private OffsetDateTime createdAt = OffsetDateTime.now();

	@Column(nullable = false)
	private OffsetDateTime updatedAt = OffsetDateTime.now();

	private OffsetDateTime generatedAt;
	private OffsetDateTime filedAt;

	public JsonNode getInputSnapshot() {
		return inputSnapshot;
	}

	public MotionEntity setInputSnapshot(JsonNode inputSnapshot) {
		this.inputSnapshot = inputSnapshot;
		return this;
	}

	@PrePersist
	void onCreate() {
		final OffsetDateTime now = OffsetDateTime.now();
		if (createdAt == null)
			createdAt = now;
		if (updatedAt == null)
			updatedAt = now;
	}

	@PreUpdate
	void onUpdate() {
		updatedAt = OffsetDateTime.now();
	}
}
