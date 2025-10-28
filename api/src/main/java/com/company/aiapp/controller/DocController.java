package com.company.aiapp.controller;

import com.company.aiapp.config.storage.FileStorage;
import com.company.aiapp.dto.DocRequestDTO;
import com.company.aiapp.dto.DocResponseDTO;
import com.company.aiapp.dto.ProcessDocResponse;
import com.company.aiapp.service.DocPipelineService;
import com.company.aiapp.service.DocProcessingService;
import com.company.aiapp.service.MotionService;

import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;

import java.nio.file.Path;

@RestController
@RequestMapping("/docs")
public class DocController {

	private final DocPipelineService pipeline; // legacy pipeline (kept)
	private final DocProcessingService docProcessing; // new motion-aware flow
	private final FileStorage storage;
	private final MotionService motions;

	@Value("${app.external.processor.baseUrl}")
	private String ragBaseUrl;

	public DocController(DocPipelineService pipeline, DocProcessingService docProcessing, FileStorage storage,
			MotionService motions) {
		this.pipeline = pipeline;
		this.docProcessing = docProcessing;
		this.storage = storage;
		this.motions = motions;
	}

	/**
	 * NEW: Motion-aware processing endpoint. - Persists Case/Motion/Parties - Calls
	 * Python generator on port 5000 with the same payload - Updates motion
	 * status/output paths - Returns { motionId, status, outputPath }
	 *
	 * Optional headers: X-Org-Id : tenant/org UUID X-User-Id : current user UUID
	 *
	 * If you already extract these from JWT, you can drop the headers and adapt
	 * DocProcessingService to read them from Authentication instead.
	 */
	@PostMapping("/process")
	public ResponseEntity<ProcessDocResponse> process(@Valid @RequestBody DocRequestDTO request,
			@RequestHeader(value = "X-Org-Id", required = false) String orgId,
			@RequestHeader(value = "X-User-Id", required = false) String userId, Authentication auth) {

		// Fallbacks if you prefer to derive IDs from Authentication
		if (userId == null && auth != null) {
			userId = auth.getName(); // adapt to your principal as needed
		}
		// orgId could also be derived from JWT claims/tenant resolver.

		ProcessDocResponse resp = docProcessing.process(request, userId, orgId);
		return ResponseEntity.ok(resp);
	}

	/**
	 * LEGACY: your original pipeline for backward compatibility. Kept under
	 * /docs/process-legacy so existing unit tests/tools can still run if needed.
	 */
	@PostMapping("/process-legacy")
	public DocResponseDTO processLegacy(@Valid @RequestBody DocRequestDTO request, Authentication auth) {
		return pipeline.process(request, auth);
	}

	@PostMapping(value = "/rag/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
	public ResponseEntity<String> ragUpload(@RequestPart("file") MultipartFile file) {
		try {
			WebClient client = WebClient.builder().baseUrl(ragBaseUrl).build();

			MultipartBodyBuilder mb = new MultipartBodyBuilder();
			mb.part("file", file.getResource()).filename(file.getOriginalFilename())
					.contentType(file.getContentType() == null ? MediaType.APPLICATION_OCTET_STREAM
							: MediaType.parseMediaType(file.getContentType()));

			String upstream = client.post().uri("/rag/upload").contentType(MediaType.MULTIPART_FORM_DATA)
					.body(BodyInserters.fromMultipartData(mb.build())).retrieve().bodyToMono(String.class).block();

			return ResponseEntity.ok(upstream == null ? "{}" : upstream);
		} catch (Exception ex) {
			return ResponseEntity.status(413)
	        .body("{\"error\":\"File too large. Ask an admin to increase max upload size.\"}");
		}
	}

	/**
	 * Simple downloader to serve generated DOCX back to the UI. Example: GET
	 * /docs/download?path=users/{userId}/{projectId}/.../output.docx
	 */
	@GetMapping("/download")
	public ResponseEntity<ByteArrayResource> download(@RequestParam("path") String relativePath) throws Exception {
		Path rel = Path.of(relativePath);
		byte[] bytes = storage.loadBytes(rel);
		String fileName = rel.getFileName().toString();

		return ResponseEntity.ok()
				.contentType(MediaType
						.parseMediaType("application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
				.header(HttpHeaders.CONTENT_DISPOSITION,
						ContentDisposition.attachment().filename(fileName).build().toString())
				.body(new ByteArrayResource(bytes));
	}

	/**
	 * Returns the latest generated/saved doc for a case number (or DRAFT if none).
	 */
	@GetMapping("/latest")
	public ResponseEntity<ProcessDocResponse> latestByCase(@RequestParam("caseNumber") String caseNumber) {
		return motions.findLatestDocOnlyByCaseNumber(caseNumber).map(
				row -> ResponseEntity.ok(new ProcessDocResponse(row.id(), row.status().name(), row.outputDocxPath())))
				.orElseGet(() -> ResponseEntity.ok(new ProcessDocResponse(null, "DRAFT", null)));
	}
}