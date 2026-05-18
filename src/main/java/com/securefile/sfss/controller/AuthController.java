package com.securefile.sfss.controller;

import com.securefile.sfss.dto.LoginRequest;
import com.securefile.sfss.dto.RegisterRequest;
import com.securefile.sfss.model.User;
import com.securefile.sfss.service.UserService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    @Autowired
    private UserService userService;

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody RegisterRequest req) {
        String result = userService.registerUser(req);
        if (result.equals("EMAIL_EXISTS"))
            return ResponseEntity.badRequest().body(Map.of("message", "Email already registered"));
        return ResponseEntity.ok(Map.of("message", "Registration successful"));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest req, HttpSession session) {
        User user = userService.loginUser(req);
        if (user == null)
            return ResponseEntity.status(401).body(Map.of("message", "Invalid email or password"));

        session.setAttribute("userId", user.getUserId());
        session.setAttribute("userName", user.getName());

        return ResponseEntity.ok(Map.of(
                "message", "Login successful",
                "name", user.getName(),
                "userId", user.getUserId()
        ));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpSession session) {
        session.invalidate();
        return ResponseEntity.ok(Map.of("message", "Logged out"));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(HttpSession session) {
        Integer userId = (Integer) session.getAttribute("userId");
        if (userId == null)
            return ResponseEntity.status(401).body(Map.of("message", "Not logged in"));
        return ResponseEntity.ok(Map.of(
                "userId", userId,
                "name", session.getAttribute("userName")
        ));
    }
}