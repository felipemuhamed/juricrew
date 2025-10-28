package com.company.aiapp.controller;

import com.company.aiapp.dto.CodeDtos.CompleteReq;
import com.company.aiapp.service.ModelClient;
import com.company.aiapp.service.UserService;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicBoolean;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/code")
public class CodeController {

  private final UserService users;
  private final ModelClient model;

  public CodeController(UserService users, ModelClient model) {
    this.users = users;
    this.model = model;
  }

  @PostMapping(value = "/complete",
               consumes = MediaType.APPLICATION_JSON_VALUE,
               produces = MediaType.TEXT_PLAIN_VALUE)
  public ResponseEntity<StreamingResponseBody> complete(
      @AuthenticationPrincipal UserDetails principal,
      @Valid @RequestBody CompleteReq req,
      HttpServletResponse rawResp
  ) {
    users.getByEmailOrThrow(principal.getUsername()); // assert auth

    rawResp.setHeader("X-Accel-Buffering", "no");
    rawResp.setHeader(HttpHeaders.CACHE_CONTROL, "no-cache, no-store, must-revalidate");
    rawResp.setHeader(HttpHeaders.PRAGMA, "no-cache");

    StreamingResponseBody body = os -> {
      StringBuilder full = new StringBuilder(512);
      CountDownLatch done = new CountDownLatch(1);
      AtomicBoolean completed = new AtomicBoolean(false);
      reactor.core.Disposable sub = null;
      try {
        sub = model.streamChat(
          List.of(new ModelClient.Msg("user", req.prompt())),
          delta -> {
            try {
              full.append(delta);
              os.write(delta.getBytes(StandardCharsets.UTF_8));
              os.flush();
            } catch (Exception ignore) { done.countDown(); }
          },
          ex -> {
            try {
              os.write(("[ERROR] " + ex.getMessage()).getBytes(StandardCharsets.UTF_8));
              os.flush();
            } catch (Exception ignore) {}
            done.countDown();
          },
          () -> {
            completed.set(true);
            try {
              os.write("\n[DONE]".getBytes(StandardCharsets.UTF_8));
              os.flush();
            } catch (Exception ignore) {}
            done.countDown();
          }
        );
        try { done.await(); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
      } finally {
        if (sub != null && !sub.isDisposed()) try { sub.dispose(); } catch (Exception ignore) {}
        if (!completed.get()) {
          try { os.write("\n[DONE]".getBytes(StandardCharsets.UTF_8)); os.flush(); } catch (Exception ignore) {}
        }
      }
    };

    return ResponseEntity.ok().header(HttpHeaders.CONNECTION, "keep-alive").contentType(MediaType.TEXT_PLAIN).body(body);
  }
}