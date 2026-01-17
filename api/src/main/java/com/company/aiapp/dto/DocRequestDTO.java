package com.company.aiapp.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class DocRequestDTO {

  /** Conversation ID (sidebar item) this motion belongs to. */
  private String conversationId;

  /** Existing motion ID (draft/output) to update instead of creating a new record. */
  private String motionId;

  /** Project the motion should live under (conversation’s project). */
  private String projectId;

  /** Optional subfolder within the project. */
  private String subfolder;

  /** Optional suggested file name WITHOUT extension (backend may append .docx). */
  private String requestedFileName;

  /** Required set of domain fields for the motion. */
  @NotNull
  private Fields fields;

  /** Step 2: selected template (required for generation; optional for research). */
  private String templateId;

  /** Step 2: frozen authorities chosen by the user. */
  private JsonNode selectedAuthorities;

  /** Step 1: authority research results (so the UI can restore without re-running research). */
  private JsonNode researchedAuthorities;

  @Data
  @JsonIgnoreProperties(ignoreUnknown = true)
  public static class Fields {
    /** e.g., “Motion to Compel Discovery” */
    private String motion_type;

    /** Free-form narrative facts */
    private String facts;

    /** New canonical key for case number */
    @JsonAlias({"process"})        // accept legacy FE key
    private String case_number;

    private String court;

    /** New canonical key for plaintiff */
    private String plaintiff;

    /**
     * Canonical array of defendants (preferred).
     * Accept legacy plural, too.
     */
    @JsonAlias({"defendants"})
    private List<String> defendant;

    /**
     * Legacy “parts” blob from old FE.
     * Example: "plaintiff: John; defendants: [Jane, Acme Inc]"
     * Kept so the controller can parse it into the canonical fields.
     */
    private String parts;

    // Convenience accessors for alias handling in controller normalization
    public List<String> getDefendants() { return defendant; } // alias view
    public void setDefendants(List<String> xs) { this.defendant = xs; }
    public String getProcess() { return null; } // handled by @JsonAlias, keep method to avoid NPEs if referenced
  }
}
