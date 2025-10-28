package com.company.aiapp.service;

import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.UUID;

import com.company.aiapp.config.storage.FileStorage;
import com.company.aiapp.domain.MotionEntity;
import com.company.aiapp.domain.MotionStatus;
import com.company.aiapp.dto.CreateMotionRequest;
import com.company.aiapp.dto.DocRequestDTO;
import com.company.aiapp.dto.ProcessDocResponse;
import com.company.aiapp.ext.PythonDocClient;
import com.company.aiapp.repo.MotionRepository;

import com.fasterxml.jackson.databind.JsonNode; // <-- add
import com.fasterxml.jackson.databind.ObjectMapper; // <-- add
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
	private final ObjectMapper objectMapper; // <-- add

	@Value("${app.storage.prefix:pleadings}")
	private String storagePrefix;

	@Override
	@Transactional
	public ProcessDocResponse process(DocRequestDTO dto, String userId, String orgId) {
		// 1) Persist motion/case/parties first (status DRAFT -> GENERATING)
		CreateMotionRequest req = new CreateMotionRequest();
		req.motionType = safe(dto.fields.motion_type);
		req.facts = safe(dto.fields.facts);
		req.caseNumber = safe(dto.fields.case_number);
		req.court = safe(dto.fields.court);
		req.plaintiff = safe(dto.fields.plaintiff);
		req.defendants = dto.fields.defendant; // FE already sends an array
		req.priority = "MEDIUM";

		// create initial motion record
		var created = motionService.create(req, userId, orgId);

		// look up the newly created entity to update its status + folder + snapshot
		MotionEntity m = motionRepo.findById(created.id).orElseThrow();

		// link to the selected folder (project) if any
		UUID folderId = parseUuidOrNull(dto.getProjectId());
		m.folderId(folderId);

		// mark as generating
		m.status(MotionStatus.GENERATING);

		// keep a copy of input fields as JSON for pre-fill / auditing
		JsonNode snapshot = objectMapper.valueToTree(dto.fields);
		m.setInputSnapshot(snapshot);

		motionRepo.save(m);

		// 2) Call Python generator
		PythonDocClient.GenResult gen = python.generate(dto);

		// 3) Save DOCX and update motion record
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
				// generation failed or returned no data
				m.status(MotionStatus.REJECTED).generationLog(gen != null ? gen.error : "No response from generator");
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