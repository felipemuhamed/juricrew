package com.company.aiapp.service;

import com.company.aiapp.entity.Conversation;
import com.company.aiapp.entity.Message;
import com.company.aiapp.repo.MessageRepo;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;

@Service
public class MessageService {

	private final MessageRepo repo;

	public MessageService(MessageRepo msgs) {
		this.repo = msgs;
	}

	public Message add(Conversation c, String role, String content, String model, Integer latencyMs) {
		Message m = new Message();
		m.setConversation(c);
		m.setRole(role);
		m.setContent(content);
		m.setModel(model);
		m.setLatencyMs(latencyMs);
		m.setMetadata(new HashMap<>()); // ensure JSON object instead of null
		return repo.save(m);
	}

	public List<Message> list(Conversation c) {
		return repo.findByConversationOrderByCreatedAtAsc(c);
	}
}
