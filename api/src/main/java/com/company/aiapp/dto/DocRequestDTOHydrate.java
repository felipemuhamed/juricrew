// com/company/aiapp/dto/DocRequestDTOHydrate.java
package com.company.aiapp.dto;

import java.util.List;

import lombok.Data;

@Data
public class DocRequestDTOHydrate {
	private String projectId;
	private String subfolder;
	private String requestedFileName;
	private Fields fields;

	@Data
	public static class Fields {
		private String motion_type;
		private String facts;
		private String case_number;
		private String court;
		private String plaintiff;
		private List<String> defendant;
		// keep optional legacy aliases if your stored snapshots had them:
		private String process;
		private String parts;
		private List<String> defendants;
	}
}
