// src/main/java/com/company/aiapp/controller/ChatController.java
package com.company.aiapp.controller;

import com.company.aiapp.dto.ChatDtos.*;
import com.company.aiapp.entity.Conversation;
import com.company.aiapp.entity.Message;
import com.company.aiapp.service.*;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import reactor.core.Disposable;

@RestController
@RequestMapping("/chat")
public class ChatController {
	private static final Logger log = LoggerFactory.getLogger(ChatController.class);

	private final ConversationService convs;
	private final MessageService msgs;
	private final UserService users;
	private final ModelClient model;
	private final String servedModel;

	public ChatController(ConversationService convs, MessageService msgs, UserService users, ModelClient model,
			@Value("${app.model.servedModel}") String servedModel) {
		this.convs = convs;
		this.msgs = msgs;
		this.users = users;
		this.model = model;
		this.servedModel = servedModel;
	}

	@PostMapping(value = "/stream",
	             consumes = MediaType.APPLICATION_JSON_VALUE,
	             produces = MediaType.TEXT_PLAIN_VALUE)
	public ResponseEntity<StreamingResponseBody> stream(
	    @AuthenticationPrincipal UserDetails principal,
	    @Valid @RequestBody ChatReq req,
	    HttpServletResponse rawResp
	) {
	  var user = users.getByEmailOrThrow(principal.getUsername());
	  Conversation c = convs.getOwnedOrThrow(user, req.conversationId());

	  var history = msgs.list(c);
	  List<ModelClient.Msg> hi = new ArrayList<>();
	  for (Message m : history) hi.add(new ModelClient.Msg(m.getRole(), m.getContent()));

	  // Let proxies pass chunks through
	  rawResp.setHeader("X-Accel-Buffering", "no");
	  rawResp.setHeader(HttpHeaders.CACHE_CONTROL, "no-cache, no-store, must-revalidate");
	  rawResp.setHeader(HttpHeaders.PRAGMA, "no-cache");

	  final long t0 = System.currentTimeMillis();

	  StreamingResponseBody body = outputStream -> {
	    StringBuilder full = new StringBuilder(1024);
	    java.util.concurrent.CountDownLatch done = new java.util.concurrent.CountDownLatch(1);
	    java.util.concurrent.atomic.AtomicBoolean completed = new java.util.concurrent.atomic.AtomicBoolean(false);
	    reactor.core.Disposable sub = null;

	    try {
	      sub = model.streamChat(
	          hi,
	          // onDelta
	          delta -> {
	            try {
	              full.append(delta);
	              outputStream.write(delta.getBytes(java.nio.charset.StandardCharsets.UTF_8));
	              outputStream.flush();
	            } catch (Exception ignored) {
	              // client likely disconnected — end the stream
	              done.countDown();
	            }
	          },
	          // onError
	          ex -> {
	            try {
	              String msg = "[ERROR] " + ex.getMessage();
	              outputStream.write(msg.getBytes(java.nio.charset.StandardCharsets.UTF_8));
	              outputStream.flush();
	            } catch (Exception ignored) { /* ignore */ }
	            done.countDown();
	          },
	          // onComplete
	          () -> {
	            completed.set(true);
	            try {
	              int latency = (int) (System.currentTimeMillis() - t0);
	              msgs.add(c, "assistant", full.toString(), servedModel, latency);
	              convs.save(c);
	              outputStream.write("\n[DONE]".getBytes(java.nio.charset.StandardCharsets.UTF_8));
	              outputStream.flush();
	            } catch (Exception ignored) { /* ignore */ }
	            done.countDown();
	          }
	      );

	      // Keep this request open until the upstream signals completion or error
	      try {
	        done.await(); // server.mvc.async.request-timeout=0 prevents server timeout
	      } catch (InterruptedException ie) {
	        Thread.currentThread().interrupt();
	      }

	    } finally {
	      if (sub != null && !sub.isDisposed()) {
	        try { sub.dispose(); } catch (Exception ignored) {}
	      }
	      // If upstream ended without calling onComplete/onError (rare), send a sentinel
	      if (!completed.get()) {
	        try {
	          outputStream.write("\n[DONE]".getBytes(java.nio.charset.StandardCharsets.UTF_8));
	          outputStream.flush();
	        } catch (Exception ignored) {}
	      }
	    }
	  };

	  return ResponseEntity.ok()
	      .header(HttpHeaders.CONNECTION, "keep-alive")
	      .contentType(MediaType.TEXT_PLAIN)
	      .body(body);
	}
}