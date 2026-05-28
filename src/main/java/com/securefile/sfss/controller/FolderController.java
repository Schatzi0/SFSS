package com.securefile.sfss.controller;

import com.securefile.sfss.model.User;
import com.securefile.sfss.service.FolderService;
import com.securefile.sfss.service.UserService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

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

    // Get all folders (nested tree)
    @GetMapping
    public ResponseEntity<?> getFolders(HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(folderService.getUserFoldersNested(user));
    }

    // Get flat list (for upload dropdown)
    @GetMapping("/flat")
    public ResponseEntity<?> getFoldersFlat(HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(folderService.getUserFoldersFlat(user));
    }

    // Create folder
    @PostMapping
    public ResponseEntity<?> createFolder(@RequestBody Map<String, Object> req,
                                          HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        String name = (String) req.get("folderName");
        Integer parentId = req.get("parentId") != null
                ? Integer.valueOf(req.get("parentId").toString()) : null;
        return ResponseEntity.ok(folderService.createFolder(name, user, parentId));
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

    @PutMapping("/{folderId}/protect")
    public ResponseEntity<?> protect(@PathVariable Integer folderId,
                                     @RequestBody Map<String, Object> req,
                                     HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        boolean enable = Boolean.TRUE.equals(req.get("enable"));
        return ResponseEntity.ok(
                folderService.setProtection(folderId, (String) req.get("pin"), enable, user));
    }

    @PostMapping("/{folderId}/verify")
    public ResponseEntity<?> verify(@PathVariable Integer folderId,
                                    @RequestBody Map<String, String> req,
                                    HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        boolean ok = folderService.verifyPin(folderId, req.get("pin"), user);
        if (ok) {
            @SuppressWarnings("unchecked")
            Set<Integer> unlocked = (Set<Integer>) session.getAttribute("unlockedFolders");
            if (unlocked == null) unlocked = new HashSet<>();
            unlocked.add(folderId);
            session.setAttribute("unlockedFolders", unlocked);
            return ResponseEntity.ok(Map.of("verified", true));
        }
        return ResponseEntity.status(403)
                .body(Map.of("verified", false, "message", "Wrong PIN"));
    }
}