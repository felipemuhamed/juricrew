package com.company.aiapp.config;

import java.io.IOException;
import java.util.List;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

  private final UserDetailsService userDetailsService;
  private final com.company.aiapp.service.JwtService jwtService;

  public JwtAuthFilter(UserDetailsService uds, com.company.aiapp.service.JwtService jwtService) {
    this.userDetailsService = uds;
    this.jwtService = jwtService;
  }

  private static final AntPathMatcher matcher = new AntPathMatcher();

  // Public endpoints. /auth/me MUST NOT be here.
  private static final List<String> PUBLIC = List.of(
      "/auth/login",
      "/auth/register",
      "/auth/logout",
      "/health",
      "/error"
  );

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    String uri = request.getRequestURI();
    return PUBLIC.stream().anyMatch(p -> matcher.match(p, uri));
  }

  /** Run on async + error dispatch as well (important for streaming). */
  @Override protected boolean shouldNotFilterAsyncDispatch() { return false; }
  @Override protected boolean shouldNotFilterErrorDispatch() { return false; }

  @Override
  protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
      throws ServletException, IOException {

    String token = null;

    // 1) Authorization: Bearer
    String auth = req.getHeader("Authorization");
    if (auth != null && auth.startsWith("Bearer ")) token = auth.substring(7);

    // 2) Cookie "jwt"
    if (token == null && req.getCookies() != null) {
      for (Cookie c : req.getCookies()) {
        if ("jwt".equals(c.getName()) && c.getValue() != null && !c.getValue().isBlank()) {
          token = c.getValue();
          break;
        }
      }
    }

    if (token != null && SecurityContextHolder.getContext().getAuthentication() == null) {
      try {
        String email = jwtService.extractUsername(token);
        if (email != null) {
          UserDetails user = userDetailsService.loadUserByUsername(email);
          if (jwtService.isTokenValid(token, user)) {
            var authToken = new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
            authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(req));
            SecurityContextHolder.getContext().setAuthentication(authToken);
          }
        }
      } catch (Exception ignored) {
        SecurityContextHolder.clearContext();
      }
    }

    chain.doFilter(req, res);
  }
}
