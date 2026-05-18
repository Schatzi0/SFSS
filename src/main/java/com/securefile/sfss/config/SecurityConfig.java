package com.securefile.sfss.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(
                                "/api/auth/**",
                                "/*.html",
                                "/css/**",
                                "/js/**"
                        ).permitAll()
                        .anyRequest().permitAll()
                )
                .sessionManagement(session -> session
                        .maximumSessions(1)
                );
        return http.build();

    }

}
