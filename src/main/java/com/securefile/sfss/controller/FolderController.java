package com.securefile.sfss.controller;

import com.securefile.sfss.dto.FolderRequest;
import com.securefile.sfss.model.User;
import com.securefile.sfss.service.FolderService;
import com.securefile.sfss.service.UserService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/folders")
public class FolderController {

    @Autowired private FolderService folderService;
    @Autowired private UserService userService;

    private User getUser(HttpSession session) {
        Integer id = (Integer) session.getAttribute("userId");
        if (id == null) return null;
        return userService.findById(id).orElse(null);
    }

    @GetMapping
    public ResponseEntity<?> getFolders(HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(folderService.getUserFolders(user));
    }

    @PostMapping
    public ResponseEntity<?> createFolder(@RequestBody FolderRequest req,
                                          HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(folderService.createFolder(req.getFolderName(), user));
    }

    @DeleteMapping("/{folderId}")
    public ResponseEntity<?> deleteFolder(@PathVariable Integer folderId,
                                          HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        return folderService.deleteFolder(folderId, user)
                ? ResponseEntity.ok(Map.of("message", "Folder deleted"))
                : ResponseEntity.badRequest().body(Map.of("message", "Not found"));
    }

    // Set/Remove PIN protection
    @PutMapping("/{folderId}/protect")
    public ResponseEntity<?> protect(@PathVariable Integer folderId,
                                     @RequestBody Map<String, Object> req,
                                     HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        boolean enable = Boolean.TRUE.equals(req.get("enable"));
        String pin = (String) req.get("pin");
        return ResponseEntity.ok(
                folderService.setProtection(folderId, pin, enable, user));
    }

    // Verify PIN
    @PostMapping("/{folderId}/verify")
    public ResponseEntity<?> verify(@PathVariable Integer folderId,
                                    @RequestBody Map<String, String> req,
                                    HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        String pin = req.get("pin");
        boolean ok = folderService.verifyPin(folderId, pin, user);
        return ok ? ResponseEntity.ok(Map.of("verified", true))
                : ResponseEntity.status(403).body(Map.of("verified", false,
                "message", "Wrong PIN"));
    }
}