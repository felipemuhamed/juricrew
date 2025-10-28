package com.company.aiapp.controller;

import static com.company.aiapp.dto.AuthDtos.*;

import java.time.Duration;
import java.util.Map;

import com.company.aiapp.entity.AppUser;
import com.company.aiapp.exception.UserAlreadyExistsException;
import com.company.aiapp.service.JwtService;
import com.company.aiapp.service.UserService;

import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/auth")
public class AuthController {

  private final AuthenticationManager am;
  private final UserService users;
  private final JwtService jwt;

  @Value("${app.jwt.ttl-seconds:604800}")   // 7 days
  private long jwtTtl;

  /** Cookie will be issued for this domain (must be the API host). */
  @Value("${app.cookie.domain:k8s.lotto-gpt.io}")
  private String cookieDomain;

  /** Should be true in prod so SameSite=None is accepted by browsers. */
  @Value("${app.cookie.secure:true}")
  private boolean cookieSecure;

  public AuthController(AuthenticationManager am, UserService users, JwtService jwt) {
    this.am = am; this.users = users; this.jwt = jwt;
  }

  private ResponseCookie jwtCookie(String token, long maxAgeSeconds) {
    // Cross-site friendly cookie for S3 site -> HTTPS API:
    // HttpOnly; Secure; SameSite=None; Domain=k8s.lotto-gpt.io; Path=/;
    return ResponseCookie.from("jwt", token)
        .domain(cookieDomain)
        .path("/")
        .httpOnly(true)
        .secure(cookieSecure)
        .sameSite(cookieSecure ? "None" : "Lax")
        .maxAge(Duration.ofSeconds(maxAgeSeconds))
        .build();
  }

  @PostMapping("/register")
  public ResponseEntity<?> register(@Valid @RequestBody RegisterReq req) {
    if (users.existsByEmailIgnoreCase(req.email())) {
      throw new UserAlreadyExistsException(req.email());
    }
    AppUser u = users.register(req.email(), req.password(), req.displayName());
    String token = jwt.issue(u.getEmail(), jwtTtl, Map.of("name", u.getDisplayName()));
    return ResponseEntity.status(201)
        .header(HttpHeaders.SET_COOKIE, jwtCookie(token, jwtTtl).toString())
        .body(new LoginResp(token, u.getEmail(), u.getDisplayName()));
  }

  @PostMapping("/login")
  public ResponseEntity<?> login(@Valid @RequestBody LoginReq req) {
    am.authenticate(new UsernamePasswordAuthenticationToken(req.email(), req.password()));
    AppUser u = users.getByEmailOrThrow(req.email());
    String token = jwt.issue(u.getEmail(), jwtTtl, Map.of("name", u.getDisplayName()));
    return ResponseEntity.ok()
        .header(HttpHeaders.SET_COOKIE, jwtCookie(token, jwtTtl).toString())
        .body(new LoginResp(token, u.getEmail(), u.getDisplayName()));
  }

  @PostMapping("/logout")
  public ResponseEntity<?> logout() {
    return ResponseEntity.ok()
        .header(HttpHeaders.SET_COOKIE, jwtCookie("", 0).toString())
        .build();
  }

  // 200 with user info if cookie/Bearer valid; 401 if not
  @GetMapping("/me")
  public ResponseEntity<?> me(@AuthenticationPrincipal UserDetails principal) {
    if (principal == null) return ResponseEntity.status(401).build();
    AppUser u = users.getByEmailOrThrow(principal.getUsername());
    return ResponseEntity.ok(new MeResp(u.getEmail(), u.getDisplayName()));
  }
}
