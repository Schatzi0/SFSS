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
        if (user == null) return ResponseEntity.status(401).body(Map.of("message", "Login required"));
        return ResponseEntity.ok(folderService.getUserFolders(user));
    }

    @PostMapping
    public ResponseEntity<?> createFolder(@RequestBody FolderRequest req, HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).body(Map.of("message", "Login required"));
        return ResponseEntity.ok(folderService.createFolder(req.getFolderName(), user));
    }

    @DeleteMapping("/{folderId}")
    public ResponseEntity<?> deleteFolder(@PathVariable Integer folderId, HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).body(Map.of("message", "Login required"));
        boolean deleted = folderService.deleteFolder(folderId, user);
        return deleted
                ? ResponseEntity.ok(Map.of("message", "Folder deleted"))
                : ResponseEntity.badRequest().body(Map.of("message", "Folder not found"));
    }
}