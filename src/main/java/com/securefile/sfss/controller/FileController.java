package com.securefile.sfss.controller;



import com.securefile.sfss.model.FileEntity;
import com.securefile.sfss.model.User;
import com.securefile.sfss.service.FileService;
import com.securefile.sfss.service.StorageService;
import com.securefile.sfss.service.UserService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
@RequestMapping("/api/files")
public class FileController {


    private static final Logger log = LoggerFactory.getLogger(FileController.class);

    @Autowired private FileService fileService;
    @Autowired private UserService userService;

    private User getUser(HttpSession session) {
        Integer id = (Integer) session.getAttribute("userId");
        if (id == null) return null;
        return userService.findById(id).orElse(null);
    }

    // ─── UPLOAD ───────────────────────────────────────────────
    @PostMapping("/upload")
    public ResponseEntity<?> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) Integer folderId,
            HttpSession session) {

        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();

        try {
            return ResponseEntity.ok(fileService.uploadFile(file, folderId, user));
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(e.getMessage());
        }
    }

    // ─── CONSOLIDATED STATS ───────────────────────────────────
    @GetMapping("/stats")
    public ResponseEntity<?> getStats(HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).body(Map.of("message", "Login required"));
        return ResponseEntity.ok(fileService.getConsolidatedStats(user));
    }

    // ─── CODE SUB-CATEGORIES ─────────────────────────────────
    @GetMapping("/code-subcats")
    public ResponseEntity<?> getCodeSubcats(HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).body(Map.of("message","Login required"));
        return ResponseEntity.ok(fileService.getCodeSubcats(user));
    }

    // ─── OTHERS SUB-CATEGORIES ───────────────────────────────
    @GetMapping("/others-subcats")
    public ResponseEntity<?> getOthersSubcats(HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).body(Map.of("message","Login required"));
        return ResponseEntity.ok(fileService.getOthersSubcats(user));
    }

    // ─── FILES BY CATEGORY ────────────────────────────────────
    @GetMapping("/category/{category}")
    public ResponseEntity<?> getByCategory(@PathVariable String category, HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).body(Map.of("message","Login required"));
        return ResponseEntity.ok(fileService.getFilesByCategory(category, user));
    }

    // ─── FILES BY EXTENSION ───────────────────────────────────
    @GetMapping("/ext/{extension}")
    public ResponseEntity<?> getByExtension(@PathVariable String extension, HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).body(Map.of("message","Login required"));
        return ResponseEntity.ok(fileService.getFilesByExtension(extension, user));
    }

    // ─── ALL FILES ────────────────────────────────────────────
    @GetMapping
    public ResponseEntity<?> getAllFiles(HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).body(Map.of("message","Login required"));
        return ResponseEntity.ok(fileService.getAllFiles(user));
    }

    // ─── FILES IN FOLDER ──────────────────────────────────────
    @GetMapping("/folder/{folderId}")
    public ResponseEntity<?> getFilesInFolder(@PathVariable Integer folderId, HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).body(Map.of("message","Login required"));
        return ResponseEntity.ok(fileService.getFilesInFolder(folderId, user));
    }

    // ─── SEARCH ───────────────────────────────────────────────
    @GetMapping("/search")
    public ResponseEntity<?> search(@RequestParam("q") String keyword, HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).body(Map.of("message","Login required"));
        return ResponseEntity.ok(fileService.searchFiles(keyword, user));
    }

    // ─── PREVIEW (images, PDFs as binary; code as text) ──────
//    @GetMapping("/preview/{fileId}")
//    public ResponseEntity<?> preview(@PathVariable Integer fileId, HttpSession session) {
//        User user = getUser(session);
//        if (user == null) return ResponseEntity.status(401).build();
//        try {
//            Optional<FileEntity> opt = fileService.getFile(fileId, user);
//            if (opt.isEmpty()) return ResponseEntity.notFound().build();
//            FileEntity fe = opt.get();
//
//            String ct = fe.getFileType() != null ? fe.getFileType() : "application/octet-stream";
//            java.nio.file.Path path = Paths.get(fe.getStoragePath());
//
//            if (!Files.exists(path))
//                return ResponseEntity.status(404).body("File not found on disk");
//
//            // Images and PDFs — serve as binary inline
//            if (ct.startsWith("image/") || ct.contains("pdf")) {
//                Resource resource = new UrlResource(path.toUri());
//                return ResponseEntity.ok()
//                        .contentType(MediaType.parseMediaType(ct))
//                        .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + fe.getFileName() + "\"")
//                        .body(resource);
//            }
//
//            // Text / Code — serve as UTF-8 plain text
//            String content = Files.readString(path, StandardCharsets.UTF_8);
//            return ResponseEntity.ok()
//                    .contentType(new MediaType("text", "plain", StandardCharsets.UTF_8))
//                    .body(content);
//
//        } catch (Exception e) {
//            return ResponseEntity.status(500).body("Preview unavailable: " + e.getMessage());
//        }
//    }
//
//    // ─── DOWNLOAD ─────────────────────────────────────────────
//    @GetMapping("/download/{fileId}")
//    public ResponseEntity<Resource> download(@PathVariable Integer fileId, HttpSession session) {
//        User user = getUser(session);
//        if (user == null) return ResponseEntity.status(401).build();
//        try {
//            Optional<FileEntity> opt = fileService.getFile(fileId, user);
//            if (opt.isEmpty()) return ResponseEntity.notFound().build();
//            FileEntity fe = opt.get();
//            Resource resource = new UrlResource(Paths.get(fe.getStoragePath()).toUri());
//            return ResponseEntity.ok()
//                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
//                    .header(HttpHeaders.CONTENT_DISPOSITION,
//                            "attachment; filename=\"" + fe.getFileName() + "\"")
//                    .body(resource);
//        } catch (Exception e) {
//            return ResponseEntity.status(500).build();
//        }
//    } //commented code is old code that run in local

    //For Online preview and upload
    @Autowired
    private StorageService storageService;

    @GetMapping("/preview/{fileId}")
    public ResponseEntity<?> preview(@PathVariable Integer fileId, HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        try {
            Optional<FileEntity> opt = fileService.getFile(fileId, user);
            if (opt.isEmpty()) return ResponseEntity.notFound().build();
            FileEntity fe = opt.get();
            String ct = fe.getFileType() != null ? fe.getFileType() : "application/octet-stream";

            InputStream stream = storageService.downloadFile(fe.getStoredName());

            if (ct.startsWith("image/") || ct.contains("pdf")) {
                return ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(ct))
                        .header(HttpHeaders.CONTENT_DISPOSITION,
                                "inline; filename=\"" + fe.getFileName() + "\"")
                        .body(new org.springframework.core.io.InputStreamResource(stream));
            }

            String content = new String(stream.readAllBytes(),
                    java.nio.charset.StandardCharsets.UTF_8);
            return ResponseEntity.ok()
                    .contentType(new MediaType("text","plain",
                            java.nio.charset.StandardCharsets.UTF_8))
                    .body(content);
        } catch (Exception e) {
            log.error("Error while previewing fileId={}", fileId, e);
            return ResponseEntity.status(500).body("Preview unavailable");
        }
    }

    @GetMapping("/download/{fileId}")
    public ResponseEntity<org.springframework.core.io.InputStreamResource> download(
            @PathVariable Integer fileId, HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        try {
            Optional<FileEntity> opt = fileService.getFile(fileId, user);
            if (opt.isEmpty()) return ResponseEntity.notFound().build();
            FileEntity fe = opt.get();
            InputStream stream = storageService.downloadFile(fe.getStoredName());
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + fe.getFileName() + "\"")
                    .body(new org.springframework.core.io.InputStreamResource(stream));
        } catch (Exception e) {
            log.error("Error while downloading fileId={}", fileId, e);
            return ResponseEntity.status(500).build();
        }
    }

    // ─── DELETE ───────────────────────────────────────────────
    @DeleteMapping("/{fileId}")
    public ResponseEntity<?> delete(@PathVariable Integer fileId, HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).body(Map.of("message","Login required"));
        return fileService.deleteFile(fileId, user)
                ? ResponseEntity.ok(Map.of("message","File deleted"))
                : ResponseEntity.badRequest().body(Map.of("message","File not found"));
    }
}