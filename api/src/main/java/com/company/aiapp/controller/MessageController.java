package com.company.aiapp.controller;

import com.company.aiapp.dto.MessageDtos.PostMessageReq;   // <-- add this line
import com.company.aiapp.entity.Conversation;
import com.company.aiapp.entity.Message;
import com.company.aiapp.service.ConversationService;
import com.company.aiapp.service.MessageService;
import com.company.aiapp.service.UserService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.*;

@RestController
@RequestMapping("/conversations/{id}/messages")
public class MessageController {
  private final ConversationService convs;
  private final MessageService msgs;
  private final UserService users;

  public MessageController(ConversationService convs, MessageService msgs, UserService users) {
    this.convs = convs;
    this.msgs = msgs;
    this.users = users;
  }

  @PostMapping
  public ResponseEntity<?> add(@AuthenticationPrincipal UserDetails principal,
                               @PathVariable("id") UUID id,
                               @Valid @RequestBody PostMessageReq req) {
    var user = users.getByEmailOrThrow(principal.getUsername());
    Conversation c = convs.getOwnedOrThrow(user, id);
    Message m = msgs.add(c, req.role(), req.content(), null, null);
    var body = Map.of(
        "id", m.getId(),
        "role", m.getRole(),
        "content", m.getContent(),
        "createdAt", m.getCreatedAt()
    );
    return ResponseEntity.created(URI.create("/conversations/" + id + "/messages/" + m.getId())).body(body);
  }

  @GetMapping
  public ResponseEntity<?> list(@AuthenticationPrincipal UserDetails principal,
                                @PathVariable("id") UUID id) {
    var user = users.getByEmailOrThrow(principal.getUsername());
    Conversation c = convs.getOwnedOrThrow(user, id);
    var list = msgs.list(c);
    return ResponseEntity.ok(list.stream().map(m -> Map.of(
        "id", m.getId(),
        "role", m.getRole(),
        "content", m.getContent(),
        "createdAt", m.getCreatedAt()
    )).toList());
  }
}