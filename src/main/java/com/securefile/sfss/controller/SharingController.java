package com.securefile.sfss.controller;

import com.securefile.sfss.model.User;
import com.securefile.sfss.service.*;
import com.securefile.sfss.model.FileEntity;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.io.InputStream;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/share")
public class SharingController {

    @Autowired private SharingService sharingService;
    @Autowired private UserService userService;
    @Autowired private StorageService storageService;

    private User getUser(HttpSession session) {
        Integer id = (Integer) session.getAttribute("userId");
        if (id == null) return null;
        return userService.findById(id).orElse(null);
    }

    // Share a file
    @PostMapping
    public ResponseEntity<?> share(@RequestBody Map<String, String> req,
                                   HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        try {
            Integer fileId = Integer.parseInt(req.get("fileId"));
            String email = req.get("email");
            String permission = req.getOrDefault("permission", "view");
            return ResponseEntity.ok(
                    sharingService.shareFile(fileId, email, permission, user));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Invalid request"));
        }
    }

    // Files shared with me
    @GetMapping("/received")
    public ResponseEntity<?> received(HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(sharingService.getSharedWithMe(user));
    }

    // Who I shared a file with
    @GetMapping("/sent/{fileId}")
    public ResponseEntity<?> sent(@PathVariable Integer fileId,
                                  HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(sharingService.getSharedByMe(fileId, user));
    }

    // Revoke share
    @DeleteMapping("/{shareId}")
    public ResponseEntity<?> revoke(@PathVariable Integer shareId,
                                    HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        return sharingService.revokeShare(shareId, user)
                ? ResponseEntity.ok(Map.of("message", "Share revoked"))
                : ResponseEntity.badRequest().body(Map.of("error", "Not found"));
    }

    // Preview shared file
    @GetMapping("/preview/{fileId}")
    public ResponseEntity<?> preview(@PathVariable Integer fileId,
                                     HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        Optional<FileEntity> opt = sharingService.getSharedFile(fileId, user);
        if (opt.isEmpty()) return ResponseEntity.status(403).build();
        try {
            FileEntity fe = opt.get();
            String ct = fe.getFileType() != null
                    ? fe.getFileType() : "application/octet-stream";
            InputStream stream = storageService.downloadFile(fe.getStoredName());
            if (ct.startsWith("image/") || ct.contains("pdf")) {
                return ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(ct))
                        .header(HttpHeaders.CONTENT_DISPOSITION,
                                "inline; filename=\"" + fe.getFileName() + "\"")
                        .body(new InputStreamResource(stream));
            }
            String content = new String(stream.readAllBytes(),
                    java.nio.charset.StandardCharsets.UTF_8);
            return ResponseEntity.ok()
                    .contentType(new MediaType("text", "plain",
                            java.nio.charset.StandardCharsets.UTF_8))
                    .body(content);
        } catch (Exception e) {
            return ResponseEntity.status(500).body("Preview unavailable");
        }
    }

    // Download shared file
    @GetMapping("/download/{fileId}")
    public ResponseEntity<InputStreamResource> download(
            @PathVariable Integer fileId, HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        Optional<FileEntity> opt = sharingService.getSharedFile(fileId, user);
        if (opt.isEmpty()) return ResponseEntity.status(403).build();
        try {
            FileEntity fe = opt.get();
            InputStream stream = storageService.downloadFile(fe.getStoredName());
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + fe.getFileName() + "\"")
                    .body(new InputStreamResource(stream));
        } catch (Exception e) {
            return ResponseEntity.status(500).build();
        }
    }
}