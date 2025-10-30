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

	@Value("${app.storage.prefix:pleadings}")
	private String storagePrefix;

	@Override
	@Transactional
	public ProcessDocResponse process(DocRequestDTO dto, String userId, String orgId) {
		// ---- 1) Persist motion/case/parties first (status DRAFT -> GENERATING)
		final DocRequestDTO.Fields f = dto.getFields();
		final List<String> defendants = f.getDefendant() == null ? Collections.emptyList() : f.getDefendant();

		CreateMotionRequest req = new CreateMotionRequest();
		req.motionType = safe(f.getMotion_type());
		req.facts = safe(f.getFacts());
		req.caseNumber = safe(f.getCase_number());
		req.court = safe(f.getCourt());
		req.plaintiff = safe(f.getPlaintiff());
		req.defendants = defendants;
		req.priority = "MEDIUM";

		var created = motionService.create(req, userId, orgId);

		// Load the entity we just created to enrich/update it
		MotionEntity m = motionRepo.findById(created.id).orElseThrow();

		// Ensure ownership/org are persisted (owner scoping for /docs/latest)
		m.createdBy(parseUuidOrNull(userId));
		m.orgId(parseUuidOrNull(orgId));

		// Link to selected folder (project), if provided
		UUID folderId = parseUuidOrNull(dto.getProjectId());
		m.folderId(folderId);

		// Mark as generating and snapshot inputs
		m.status(MotionStatus.GENERATING);
		JsonNode snapshot = objectMapper.valueToTree(f);
		m.setInputSnapshot(snapshot);

		motionRepo.save(m);

		// ---- 2) Call Python generator
		PythonDocClient.GenResult gen = python.generate(dto);

		// ---- 3) Save DOCX and update motion record
		try {
			if (gen != null && "READY".equalsIgnoreCase(gen.status) && gen.docxBytes != null) {
				String userLike = slugOrDefault(dto.getProjectId(), "public");
				String sub = joinPath(trimToNull(storagePrefix), trimToNull(slug(dto.getSubfolder())));
				String fileName = timestamped(gen.suggestedName);

				final Path relativePath = (sub == null) ? Path.of("users", userLike, fileName)
						: Path.of("users", userLike, sub, fileName);

				Path resolved = fileStorage.saveBytes(relativePath, gen.docxBytes);

				m.status(MotionStatus.READY).outputDocxPath(resolved.toString()).generatedAt(OffsetDateTime.now());
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