package com.company.aiapp.service;

import java.util.Optional;
import java.util.UUID;

import com.company.aiapp.domain.CaseEntity;
import com.company.aiapp.domain.MotionEntity;
import com.company.aiapp.domain.PartyEntity;
import com.company.aiapp.domain.PartyRole;
import com.company.aiapp.domain.Priority;
import com.company.aiapp.dto.CreateMotionRequest;
import com.company.aiapp.dto.LatestDocOnly;
import com.company.aiapp.dto.MotionResponse;
import com.company.aiapp.repo.CaseRepository;
import com.company.aiapp.repo.MotionRepository;
import com.company.aiapp.repo.PartyRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class MotionServiceImpl implements MotionService {

	private final CaseRepository caseRepo;
	private final PartyRepository partyRepo;
	private final MotionRepository motionRepo;
	private final ObjectMapper om;

	@Override
	@Transactional
	public MotionResponse create(CreateMotionRequest req, String authUserId, String orgId) {
		UUID org = safeUuid(orgId);
		UUID user = safeUuid(authUserId);

		// 1) Upsert Case
		CaseEntity c = caseRepo.findByOrgIdAndCaseNumber(org, req.caseNumber).orElseGet(() -> {
			CaseEntity nc = new CaseEntity();
			nc.caseNumber(req.caseNumber);
			nc.court(req.court);
			nc.jurisdictionCountry(req.jurisdictionCountry);
			nc.jurisdictionState(req.jurisdictionState);
			nc.jurisdictionCounty(req.jurisdictionCounty);
			nc.judge(req.judge);
			nc.division(req.division);
			nc.orgId(org);
			nc.createdBy(user);
			return caseRepo.save(nc);
		});

		// 2) Parties (idempotent enough for POC)
		if (req.plaintiff != null && !req.plaintiff.isBlank()) {
			PartyEntity p = new PartyEntity();
			p.caseRef(c);
			p.role(PartyRole.PLAINTIFF);
			p.name(req.plaintiff.trim());
			partyRepo.save(p);
		}
		if (req.defendants != null) {
			for (String d : req.defendants) {
				if (d == null || d.isBlank())
					continue;
				PartyEntity pe = new PartyEntity();
				pe.caseRef(c);
				pe.role(PartyRole.DEFENDANT);
				pe.name(d.trim());
				partyRepo.save(pe);
			}
		}

		// 3) Motion
		MotionEntity m = new MotionEntity();
		m.caseRef(c);
		m.motionType(req.motionType);
		m.facts(req.facts);

		if (req.priority != null) {
			m.priority(Priority.valueOf(req.priority));
		}

		m.dueDate(req.dueDate);
		m.hearingDate(req.hearingDate);

		if (req.tags != null && !req.tags.isEmpty()) {
			try {
				m.tags(om.writeValueAsString(req.tags));
			} catch (Exception ignored) {
			}
		}

		m.notes(req.notes);
		m.templateKey(req.templateKey);
		m.templateVersion(req.templateVersion);

		// ✅ FIX: store as JSON, not String
		try {
			JsonNode jsonNode = om.valueToTree(req);
			m.inputSnapshot(jsonNode);
		} catch (Exception ignored) {
		}

		if (req.folderId != null && !req.folderId.isBlank()) {
			m.folderId(UUID.fromString(req.folderId));
		}

		m.orgId(org);
		m.createdBy(user);

		m = motionRepo.save(m);

		MotionResponse out = new MotionResponse();
		out.id = m.id();
		out.caseId = c.id();
		out.status = m.status().name();
		out.title = c.caseNumber() + " - " + m.motionType();
		return out;
	}

	private static UUID safeUuid(String s) {
		if (s == null || s.isBlank())
			return null;
		try {
			return UUID.fromString(s.trim());
		} catch (IllegalArgumentException ex) {
			return null; // tolerate invalid UUIDs
		}
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<LatestDocOnly> findLatestDocOnlyByCaseNumber(String caseNumber) {
		return motionRepo.findLatestDocOnly(caseNumber, PageRequest.of(0, 1)).stream().findFirst();
	}
}
