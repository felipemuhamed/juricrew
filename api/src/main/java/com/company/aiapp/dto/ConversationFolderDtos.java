package com.company.aiapp.dto;

import java.util.UUID;

public class ConversationFolderDtos {
	public record MoveReq(UUID projectId) {
	} // null => move to root

	public record ArchiveReq(boolean archived) {
	}
}