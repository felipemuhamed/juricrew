package com.company.aiapp.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

@Component
public class StreamingHeadersFilter extends OncePerRequestFilter {
  @Override
  protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
      throws ServletException, IOException {
    String uri = req.getRequestURI();
    if (uri != null && uri.startsWith("/chat/stream")) {
      // tell proxies not to buffer
      res.setHeader("X-Accel-Buffering", "no");
      // make sure intermediaries don’t cache or wait
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      // content-type that plays nice with incremental reads
      if (res.getContentType() == null) {
        res.setContentType("text/plain; charset=UTF-8");
      }
    }
    chain.doFilter(req, res);
  }
}