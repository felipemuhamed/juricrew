package com.company.aiapp.service;

import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import com.company.aiapp.config.storage.FileStorage;
import com.company.aiapp.domain.MotionEntity;
import com.company.aiapp.domain.MotionStatus;
import com.company.aiapp.dto.CreateMotionRequest;
import com.company.aiapp.dto.DocRequestDTO;
import com.company.aiapp.dto.ProcessDocResponse;
import com.company.aiapp.ext.PythonDocClient;
import com.company.aiapp.repo.MotionRepository;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class DocProcessingServiceImpl implements DocProcessingService {

	private final MotionService motionService;
	private final MotionRepository motionRepo;
	private final PythonDocClient python;
	private final FileStorage fileStorage;
	private final ObjectMapper objectMapper;
	private final TemplateService templates;

	@Value("${app.storage.prefix:pleadings}")
	private String storagePrefix;

	@Override
	@Transactional
	public ProcessDocResponse process(DocRequestDTO dto, String userId, String orgId, String orgKey) {
		// ---- 1) Persist motion/case/parties first (status DRAFT -> GENERATING)
		final DocRequestDTO.Fields f = dto.getFields();
		final List<String> defendants = f.getDefendant() == null ? Collections.emptyList() : f.getDefendant();

		UUID ownerId = parseUuidOrNull(userId);
		UUID orgUuid = parseUuidOrNull(orgId);
		UUID conversationId = parseUuidOrNull(dto.getConversationId());

		MotionEntity m = null;
		UUID existingMotionId = parseUuidOrNull(dto.getMotionId());
		if (existingMotionId != null) {
			m = motionRepo.findById(existingMotionId).orElse(null);
			if (m != null && m.createdBy() != null && ownerId != null && !m.createdBy().equals(ownerId)) {
				m = null; // don't allow cross-user updates
			}
		}

		if (m == null) {
			CreateMotionRequest req = new CreateMotionRequest();
			req.motionType = safe(f.getMotion_type());
			req.facts = safe(f.getFacts());
			req.caseNumber = safe(f.getCase_number());
			req.court = safe(f.getCourt());
			req.plaintiff = safe(f.getPlaintiff());
			req.defendants = defendants;
			req.priority = "MEDIUM";

			var created = motionService.create(req, userId, orgId);
			m = motionRepo.findById(created.id).orElseThrow();
		}

		// Ensure ownership/org are persisted (owner scoping for /docs/latest)
		m.createdBy(ownerId);
		m.orgId(orgUuid);
		if (conversationId != null) {
			m.conversationId(conversationId);
		}

		// Link to selected folder (project), if provided
		UUID folderId = parseUuidOrNull(dto.getProjectId());
		m.folderId(folderId);

		// Mark as generating and snapshot inputs (store full DTO so the UI can restore step-2 later)
		m.status(MotionStatus.GENERATING);
		JsonNode snapshot = objectMapper.valueToTree(dto);
		m.setInputSnapshot(snapshot);
		// Persist research results so the UI can restore Step 2 without re-running research
		if (dto.getResearchedAuthorities() != null) {
			m.researchedAuthorities(dto.getResearchedAuthorities());
		}

		motionRepo.save(m);

		// ---- 2) Validate + load template markdown
		UUID templateUuid = parseUuidOrNull(dto.getTemplateId());
		if (templateUuid == null) {
			m.status(MotionStatus.REJECTED).generationLog("templateId is required");
			motionRepo.save(m);
			return new ProcessDocResponse(m.id(), m.status().name(), null);
		}

		final String resolvedOrgKey = (orgKey == null || orgKey.isBlank()) ? "public" : orgKey;

		final String firmTemplateMarkdown;
		try {
			firmTemplateMarkdown = templates.loadMarkdown(resolvedOrgKey, templateUuid);
		} catch (Exception e) {
			m.status(MotionStatus.REJECTED).generationLog("Failed to load template: " + e.getMessage());
			motionRepo.save(m);
			return new ProcessDocResponse(m.id(), m.status().name(), null);
		}

		// ---- 3) Call Python generator
		PythonDocClient.GenResult gen = python.generate(dto, firmTemplateMarkdown);

		// ---- 4) Save DOCX and update motion record
		try {
			if (gen != null && "READY".equalsIgnoreCase(gen.status) && gen.docxBytes != null) {
				String userLike = slugOrDefault(dto.getProjectId(), "public");
				String sub = joinPath(trimToNull(storagePrefix), trimToNull(slug(dto.getSubfolder())));
				String fileName = timestamped(gen.suggestedName);

				final Path relativePath = (sub == null) ? Path.of("users", userLike, fileName)
						: Path.of("users", userLike, sub, fileName);

				Path resolved = fileStorage.saveBytes(relativePath, gen.docxBytes);
				String resolvedPath = resolved.toString();

				m.status(MotionStatus.READY)
				 .outputDocxPath(resolvedPath)
				 .outputMetadata(buildOutputMetadata(resolvedPath, fileName))
				 .generatedAt(OffsetDateTime.now());
				motionRepo.save(m);

				return new ProcessDocResponse(m.id(), m.status().name(), m.outputDocxPath());
			} else {
				String errMsg = (gen != null ? gen.error : "No response from generator");
				m.status(MotionStatus.REJECTED).generationLog(errMsg);
				motionRepo.save(m);
				return new ProcessDocResponse(m.id(), m.status().name(), null);
			}
		} catch (Exception e) {
			m.status(MotionStatus.REJECTED).generationLog("Failed to store DOCX: " + e.getMessage());
			motionRepo.save(m);
			return new ProcessDocResponse(m.id(), m.status().name(), null);
		}
	}

	// --------------- helpers ----------------

	private JsonNode buildOutputMetadata(String resolvedPath, String fileName) {
		ObjectNode node = objectMapper.createObjectNode();
		if (resolvedPath != null) {
			node.put("path", resolvedPath);
			// Our S3 storage resolves as: /s3/{bucket}/{key}
			if (resolvedPath.startsWith("/s3/")) {
				String[] parts = resolvedPath.split("/", 4);
				if (parts.length >= 4) {
					node.put("storage", "s3");
					node.put("bucket", parts[2]);
					node.put("key", parts[3]);
				}
			} else {
				node.put("storage", "fs");
			}
		}
		if (fileName != null) {
			node.put("fileName", fileName);
		}
		node.put("contentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
		return node;
	}

	private static String safe(String s) {
		return s == null ? "" : s.trim();
	}

	private static String slug(String s) {
		if (s == null)
			return null;
		String t = s.toLowerCase().replaceAll("[^a-z0-9]+", "_");
		t = t.replaceAll("_+", "_");
		if (t.startsWith("_"))
			t = t.substring(1);
		if (t.endsWith("_"))
			t = t.substring(0, t.length() - 1);
		return t.isBlank() ? null : t;
	}

	private static String slugOrDefault(String s, String def) {
		String sl = slug(s);
		return (sl == null || sl.isBlank()) ? def : sl;
	}

	private static String trimToNull(String s) {
		if (s == null)
			return null;
		String t = s.trim();
		return t.isBlank() ? null : t;
	}

	private static String joinPath(String a, String b) {
		if (a == null && b == null)
			return null;
		if (a == null)
			return b;
		if (b == null)
			return a;
		return a + "/" + b;
	}

	private static String timestamped(String name) {
		long ts = System.currentTimeMillis();
		if (name == null || name.isBlank()) {
			return ts + "_pleading.docx";
		}
		String n = name.toLowerCase().endsWith(".docx") ? name : name + ".docx";
		return ts + "_" + n;
	}

	private static UUID parseUuidOrNull(String s) {
		if (s == null || s.isBlank())
			return null;
		try {
			return UUID.fromString(s.trim());
		} catch (Exception ignore) {
			return null;
		}
	}
}
