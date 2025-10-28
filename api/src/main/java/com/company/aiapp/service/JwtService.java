package com.company.aiapp.service;

import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.Date;
import java.util.Map;

@Service
public class JwtService {

  private final SecretKey key;

  // secret must be Base64; e.g., in application.yml: app.jwtSecret: ${JWT_SECRET_BASE64}
  public JwtService(@Value("${app.jwtSecret}") String secretBase64) {
    this.key = Keys.hmacShaKeyFor(Decoders.BASE64.decode(secretBase64));
  }

  /** Issue a token with subject + TTL (seconds) and optional claims */
  public String issue(String subject, long ttlSeconds, Map<String, Object> claims) {
    Instant now = Instant.now();
    return Jwts.builder()
        .setSubject(subject)
        .setIssuedAt(Date.from(now))
        .setExpiration(Date.from(now.plusSeconds(ttlSeconds)))
        .addClaims(claims == null ? Map.of() : claims)
        .signWith(key, SignatureAlgorithm.HS256)
        .compact();
  }

  /** Parse and return claims (throws JwtException if bad/expired) */
  public Claims parse(String token) {
    return Jwts.parserBuilder()
        .setSigningKey(key)
        .build()
        .parseClaimsJws(token)
        .getBody();
  }

  public String extractUsername(String token) {
    return parse(token).getSubject();
  }

  public boolean isTokenValid(String token, UserDetails user) {
    try {
      Claims c = parse(token);
      return user.getUsername().equals(c.getSubject())
          && c.getExpiration().after(new Date());
    } catch (JwtException | IllegalArgumentException e) {
      return false;
    }
  }
}
