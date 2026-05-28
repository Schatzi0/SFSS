package com.securefile.sfss.controller;

import com.securefile.sfss.model.FileEntity;
import com.securefile.sfss.model.User;
import com.securefile.sfss.service.FileService;
import com.securefile.sfss.service.StorageService;
import com.securefile.sfss.service.UserService;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

@RestController
@RequestMapping("/api/files")
public class FileController {

    private static final Logger log = LoggerFactory.getLogger(FileController.class);

    @Autowired private FileService    fileService;
    @Autowired private UserService    userService;
    @Autowired private StorageService storageService;

    // ─── SESSION HELPERS ─────────────────────────────
    private User getUser(HttpSession session) {
        Integer id = (Integer) session.getAttribute("userId");
        if (id == null) return null;
        return userService.findById(id).orElse(null);
    }

    @SuppressWarnings("unchecked")
    private Set<Integer> getUnlocked(HttpSession session) {
        Object obj = session.getAttribute("unlockedFolders");
        return (obj instanceof Set) ? (Set<Integer>) obj : new HashSet<>();
    }

    // ═══════════════════════════════════════════════════
    //  UPLOAD
    // ═══════════════════════════════════════════════════
    @PostMapping("/upload")
    public ResponseEntity<?> upload(@RequestParam("file") MultipartFile file,
                                    @RequestParam(required = false) Integer folderId,
                                    HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        try {
            return ResponseEntity.ok(fileService.uploadFile(file, folderId, user));
        } catch (Exception e) {
            log.error("Upload error", e);
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ═══════════════════════════════════════════════════
    //  STATS
    // ═══════════════════════════════════════════════════
    @GetMapping("/stats")
    public ResponseEntity<?> getStats(HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401)
                .body(Map.of("message", "Login required"));
        return ResponseEntity.ok(
                fileService.getConsolidatedStats(user, getUnlocked(session)));
    }

    // ═══════════════════════════════════════════════════
    //  ALL FILES
    // ═══════════════════════════════════════════════════
    @GetMapping
    public ResponseEntity<?> getAllFiles(HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401)
                .body(Map.of("message", "Login required"));
        return ResponseEntity.ok(
                fileService.getAllFiles(user, getUnlocked(session)));
    }

    // ═══════════════════════════════════════════════════
    //  BY CATEGORY
    // ═══════════════════════════════════════════════════
    @GetMapping("/category/{category}")
    public ResponseEntity<?> getByCategory(@PathVariable String category,
                                           HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401)
                .body(Map.of("message", "Login required"));
        return ResponseEntity.ok(
                fileService.getFilesByCategory(category, user, getUnlocked(session)));
    }

    // ═══════════════════════════════════════════════════
    //  BY EXTENSION
    // ═══════════════════════════════════════════════════
    @GetMapping("/ext/{extension}")
    public ResponseEntity<?> getByExtension(@PathVariable String extension,
                                            HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401)
                .body(Map.of("message", "Login required"));
        return ResponseEntity.ok(
                fileService.getFilesByExtension(extension, user, getUnlocked(session)));
    }

    // ═══════════════════════════════════════════════════
    //  FILES IN FOLDER
    // ═══════════════════════════════════════════════════
    @GetMapping("/folder/{folderId}")
    public ResponseEntity<?> getFilesInFolder(@PathVariable Integer folderId,
                                              HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401)
                .body(Map.of("message", "Login required"));
        return ResponseEntity.ok(
                fileService.getFilesInFolder(folderId, user, getUnlocked(session)));
    }

    // ═══════════════════════════════════════════════════
    //  FOLDER EXTENSION STATS (for folder tile view)
    // ═══════════════════════════════════════════════════
    @GetMapping("/folder/{folderId}/extstats")
    public ResponseEntity<?> folderExtStats(@PathVariable Integer folderId,
                                            HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401)
                .body(Map.of("message", "Login required"));
        return ResponseEntity.ok(
                fileService.getFolderExtensionStats(folderId, user, getUnlocked(session)));
    }

    // ═══════════════════════════════════════════════════
    //  FILES IN FOLDER BY EXTENSION
    // ═══════════════════════════════════════════════════
    @GetMapping("/folder/{folderId}/ext/{ext}")
    public ResponseEntity<?> folderByExt(@PathVariable Integer folderId,
                                         @PathVariable String ext,
                                         HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401)
                .body(Map.of("message", "Login required"));
        return ResponseEntity.ok(
                fileService.getFilesByFolderAndExtension(folderId, ext, user,
                        getUnlocked(session)));
    }

    // ═══════════════════════════════════════════════════
    //  BY GENRE
    // ═══════════════════════════════════════════════════
    @GetMapping("/genre/{genre}")
    public ResponseEntity<?> getByGenre(@PathVariable String genre,
                                        @RequestParam(required = false) String sub,
                                        HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401)
                .body(Map.of("message", "Login required"));
        return ResponseEntity.ok(
                fileService.getFilesByGenre(genre, sub, user, getUnlocked(session)));
    }

    // ═══════════════════════════════════════════════════
    //  SEARCH
    // ═══════════════════════════════════════════════════
    @GetMapping("/search")
    public ResponseEntity<?> search(@RequestParam("q") String keyword,
                                    HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401)
                .body(Map.of("message", "Login required"));
        return ResponseEntity.ok(
                fileService.searchFiles(keyword, user, getUnlocked(session)));
    }

    // ═══════════════════════════════════════════════════
    //  CODE SUB-CATEGORIES
    // ═══════════════════════════════════════════════════
    @GetMapping("/code-subcats")
    public ResponseEntity<?> getCodeSubcats(HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401)
                .body(Map.of("message", "Login required"));
        return ResponseEntity.ok(
                fileService.getCodeSubcats(user, getUnlocked(session)));
    }

    // ═══════════════════════════════════════════════════
    //  OTHERS SUB-CATEGORIES
    // ═══════════════════════════════════════════════════
    @GetMapping("/others-subcats")
    public ResponseEntity<?> getOthersSubcats(HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401)
                .body(Map.of("message", "Login required"));
        return ResponseEntity.ok(
                fileService.getOthersSubcats(user, getUnlocked(session)));
    }

    // ═══════════════════════════════════════════════════
    //  PREVIEW
    // ═══════════════════════════════════════════════════
    @GetMapping("/preview/{fileId}")
    public ResponseEntity<?> preview(@PathVariable Integer fileId,
                                     HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        try {
            Optional<FileEntity> opt = fileService.getFile(fileId, user); // ← 2 params
            if (opt.isEmpty()) return ResponseEntity.notFound().build();

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

            String content = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            return ResponseEntity.ok()
                    .contentType(new MediaType("text", "plain", StandardCharsets.UTF_8))
                    .body(content);

        } catch (Exception e) {
            log.error("Preview error fileId={}", fileId, e);
            return ResponseEntity.status(500).body("Preview unavailable");
        }
    }

    // ═══════════════════════════════════════════════════
    //  DOWNLOAD
    // ═══════════════════════════════════════════════════
    @GetMapping("/download/{fileId}")
    public ResponseEntity<InputStreamResource> download(@PathVariable Integer fileId,
                                                        HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        try {
            Optional<FileEntity> opt = fileService.getFile(fileId, user); // ← 2 params
            if (opt.isEmpty()) return ResponseEntity.notFound().build();

            FileEntity fe = opt.get();
            InputStream stream = storageService.downloadFile(fe.getStoredName());

            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + fe.getFileName() + "\"")
                    .body(new InputStreamResource(stream));

        } catch (Exception e) {
            log.error("Download error fileId={}", fileId, e);
            return ResponseEntity.status(500).build();
        }
    }

    // ═══════════════════════════════════════════════════
    //  DELETE
    // ═══════════════════════════════════════════════════
    @DeleteMapping("/{fileId}")
    public ResponseEntity<?> delete(@PathVariable Integer fileId,
                                    HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401)
                .body(Map.of("message", "Login required"));
        return fileService.deleteFile(fileId, user)
                ? ResponseEntity.ok(Map.of("message", "File deleted"))
                : ResponseEntity.badRequest().body(Map.of("message", "File not found"));
    }
}