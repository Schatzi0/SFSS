package com.securefile.sfss.controller;

import com.securefile.sfss.model.FileEntity;
import com.securefile.sfss.model.User;
import com.securefile.sfss.service.FileService;
import com.securefile.sfss.service.RagService;
import com.securefile.sfss.service.StorageService;
import com.securefile.sfss.service.UserService;
import jakarta.servlet.http.HttpSession;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

@RestController
@RequestMapping("/api/rag")
public class RagController {

    @Autowired private RagService     ragService;
    @Autowired private UserService    userService;
    @Autowired private FileService    fileService;
    @Autowired private StorageService storageService;
    @Autowired private JdbcTemplate   jdbc;

    private User getUser(HttpSession session) {
        Integer id = (Integer) session.getAttribute("userId");
        if (id == null) return null;
        return userService.findById(id).orElse(null);
    }

    // ─── INDEX single file ───────────────────────────
    @PostMapping("/index/{fileId}")
    public ResponseEntity<?> indexFile(@PathVariable Integer fileId,
                                       HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();

        Optional<FileEntity> opt = fileService.getFile(fileId, user);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();

        Map<String, Object> result = ragService.indexFile(opt.get(), user);
        return ResponseEntity.ok(result);
    }

    // ─── INDEX ALL eligible files ─────────────────────
    @PostMapping("/index-all")
    public ResponseEntity<?> indexAll(HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();

        List<Map<String, Object>> all =
                fileService.getAllFiles(user, new HashSet<>());
        int queued = 0;

        for (Map<String, Object> f : all) {
            Integer fid  = (Integer) f.get("fileId");
            String  type = (String) f.get("fileType");
            String  name = ((String) f.get("fileName")).toLowerCase();

            boolean eligible = (type != null &&
                    (type.contains("pdf") || type.contains("text"))) ||
                    name.endsWith(".txt") || name.endsWith(".md")   ||
                    name.endsWith(".pdf") || name.endsWith(".py")   ||
                    name.endsWith(".java")|| name.endsWith(".js")   ||
                    name.endsWith(".ts")  || name.endsWith(".json") ||
                    name.endsWith(".xml") || name.endsWith(".yaml") ||
                    name.endsWith(".yml") || name.endsWith(".html") ||
                    name.endsWith(".css") || name.endsWith(".sql")  ||
                    name.endsWith(".kt")  || name.endsWith(".sh");

            if (eligible) {
                fileService.getFile(fid, user)
                        .ifPresent(fe -> ragService.indexFileAsync(fe, user));
                queued++;
            }
        }
        return ResponseEntity.ok(Map.of("queued", queued,
                "message", queued + " files queued for indexing"));
    }

    // ─── CLASSIFY genre of a single file ─────────────
    @PostMapping("/classify/{fileId}")
    public ResponseEntity<?> classify(@PathVariable Integer fileId,
                                      HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();

        Optional<FileEntity> opt = fileService.getFile(fileId, user);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();

        try {
            FileEntity file = opt.get();
            InputStream stream = storageService.downloadFile(file.getStoredName());

            String text;
            String ct   = file.getFileType() != null ? file.getFileType() : "";
            String name = file.getFileName().toLowerCase();

            if (ct.contains("pdf") || name.endsWith(".pdf")) {
                // PDFBox 3.x — use Loader.loadPDF, not PDDocument.load
                byte[]     bytes = stream.readAllBytes();
                PDDocument doc   = Loader.loadPDF(bytes);
                text = new PDFTextStripper().getText(doc);
                doc.close();
            } else {
                text = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            }

            Map<String, String> genre =
                    ragService.classifyGenre(text, file.getFileName(), file.getFileType());

            jdbc.update("UPDATE files SET genre = ?, genre_sub = ? WHERE file_id = ?",
                    genre.get("genre"), genre.get("genreSub"), fileId);

            return ResponseEntity.ok(genre);

        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Classification failed: " + e.getMessage()));
        }
    }

    // ─── GENRE STATS for dashboard ────────────────────
    @GetMapping("/genres")
    public ResponseEntity<?> getGenres(HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();

        List<Map<String, Object>> genres = jdbc.queryForList(
                "SELECT genre, genre_sub, COUNT(*) AS count " +
                        "FROM files WHERE user_id = ? AND genre IS NOT NULL " +
                        "GROUP BY genre, genre_sub ORDER BY genre, count DESC",
                user.getUserId());

        return ResponseEntity.ok(genres);
    }

    // ─── CHAT ─────────────────────────────────────────
    @PostMapping("/chat")
    public ResponseEntity<?> chat(@RequestBody Map<String, Object> req,
                                  HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();

        String question = (String) req.get("question");
        if (question == null || question.isBlank())
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Question cannot be empty"));

        try {
            @SuppressWarnings("unchecked")
            List<Map<String, String>> history =
                    (List<Map<String, String>>) req.get("history");

            return ResponseEntity.ok(ragService.chat(question, user, history));

        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Chat failed: " + e.getMessage()));
        }
    }

    // ─── SEMANTIC SEARCH ──────────────────────────────
    @GetMapping("/search")
    public ResponseEntity<?> semanticSearch(@RequestParam("q") String query,
                                            HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        try {
            return ResponseEntity.ok(ragService.searchChunks(query, user, 8));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // ─── INDEXING STATUS ──────────────────────────────
    @GetMapping("/status")
    public ResponseEntity<?> status(HttpSession session) {
        User user = getUser(session);
        if (user == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(ragService.getStatus(user));
    }
}