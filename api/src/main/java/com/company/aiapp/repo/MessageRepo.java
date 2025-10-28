package com.company.aiapp.repo;

import com.company.aiapp.entity.Conversation;
import com.company.aiapp.entity.Message;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface MessageRepo extends JpaRepository<Message, UUID> {
	List<Message> findByConversationOrderByCreatedAtAsc(Conversation conversation);
}
