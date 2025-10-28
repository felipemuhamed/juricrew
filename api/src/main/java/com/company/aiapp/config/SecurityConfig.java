package com.company.aiapp.config;

import jakarta.servlet.DispatcherType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

  private final JwtAuthFilter jwtAuthFilter;
  private final UserDetailsService userDetailsService;

  public SecurityConfig(JwtAuthFilter jwtAuthFilter, UserDetailsService userDetailsService) {
    this.jwtAuthFilter = jwtAuthFilter;
    this.userDetailsService = userDetailsService;
  }

  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  public DaoAuthenticationProvider authProvider() {
    DaoAuthenticationProvider p = new DaoAuthenticationProvider();
    p.setUserDetailsService(userDetailsService);
    p.setPasswordEncoder(passwordEncoder());
    return p;
  }

  @Bean
  public AuthenticationManager authenticationManager(AuthenticationConfiguration cfg) throws Exception {
    return cfg.getAuthenticationManager();
  }

  @Bean
  public SecurityFilterChain security(HttpSecurity http) throws Exception {
    http
      .csrf(csrf -> csrf.disable())
      .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
      .cors(Customizer.withDefaults())
      .authorizeHttpRequests(reg -> reg
        // Allow Spring async/error/forward dispatch (streaming, etc.)
        .dispatcherTypeMatchers(DispatcherType.ASYNC, DispatcherType.ERROR, DispatcherType.FORWARD).permitAll()

        // CORS preflight
        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

        // Public endpoints
        .requestMatchers("/auth/login", "/auth/register", "/auth/logout", "/health", "/error").permitAll()

        // Protected endpoints
        .requestMatchers("/auth/me").authenticated()
        .requestMatchers(HttpMethod.POST, "/chat", "/chat/stream").authenticated()
        .requestMatchers("/chat/**").authenticated()

        // Everything else requires auth
        .anyRequest().authenticated()
      )
      // Ensure JWT runs before username/password auth
      .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

    return http.build();
  }

  @Bean
  public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration cfg = new CorsConfiguration();

    // List EXACT origins that will host your frontend (https!)
    // Add/remove to match what you actually use.
    cfg.setAllowedOriginPatterns(List.of(
        // S3 static website endpoints (regional styles)
        "https://*.s3.*.amazonaws.com",
        "https://*.s3-website.*.amazonaws.com",

        // If you use CloudFront/custom domains for the UI, include them:
        "https://*.cloudfront.net",
        "https://k8s.lotto-gpt.io",

        // Local dev
        "http://localhost:*",
        "http://127.0.0.1:*"
    ));

    // Methods & headers commonly used by browsers during CORS
    cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    // Allow any request header (includes Authorization, Accept, Content-Type, etc.)
    cfg.setAllowedHeaders(List.of("*"));

    // If you need to read custom response headers from JS, list them here or "*"
    cfg.setExposedHeaders(List.of("Cache-Control", "X-Accel-Buffering"));

    // Required if you send cookies or Authorization from the browser
    cfg.setAllowCredentials(true);

    // Cache successful preflights
    cfg.setMaxAge(3600L);

    UrlBasedCorsConfigurationSource src = new UrlBasedCorsConfigurationSource();
    src.registerCorsConfiguration("/**", cfg);
    return src;
  }
}
