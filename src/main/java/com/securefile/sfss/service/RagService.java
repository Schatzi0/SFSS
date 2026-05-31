package com.securefile.sfss.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.securefile.sfss.model.FileEntity;
import com.securefile.sfss.model.User;
import com.securefile.sfss.repository.FileChunkRepository;
import com.securefile.sfss.repository.FileRepository;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Service
public class RagService {

    @Value("${openai.api.key:}")
    private String openaiKey;

    @Autowired private FileChunkRepository chunkRepo;
    @Autowired private FileRepository fileRepo;
    @Autowired private StorageService storageService;
    @Autowired private JdbcTemplate jdbc;

    private final HttpClient http = HttpClient.newHttpClient();
    private final ObjectMapper mapper = new ObjectMapper();

    // ─── TEXT EXTRACTION ─────────────────────────────────
    private String extractText(FileEntity file) {
        InputStream stream = null;
        try {
            stream = storageService.downloadFile(file.getStoredName());
            String ct = file.getFileType() != null ? file.getFileType() : "";

            if (ct.contains("pdf") || file.getFileName().toLowerCase().endsWith(".pdf")) {
                // ✅ PDFBox 3.0+ correct way
                byte[] pdfBytes = stream.readAllBytes();
                try (PDDocument doc = Loader.loadPDF(new RandomAccessReadBuffer(pdfBytes))) {
                    String text = new PDFTextStripper().getText(doc);
                    return text != null ? text : "";
                }
            } else {
                // Text/Code files
                return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            }
        } catch (Exception e) {
            e.printStackTrace();
            return "";
        } finally {
            if (stream != null) {
                try {
                    stream.close();
                } catch (Exception ignored) {}
            }
        }
    }

    // ─── TEXT CHUNKING ────────────────────────────────────
    private List<String> chunkText(String text, int size, int overlap) {
        List<String> chunks = new ArrayList<>();
        if (text == null || text.isBlank()) return chunks;

        // Clean whitespace
        text = text.replaceAll("\\s+", " ").trim();
        int start = 0;
        while (start < text.length()) {
            int end = Math.min(start + size, text.length());

            // Try to break at sentence boundary
            if (end < text.length()) {
                int dotIdx = text.lastIndexOf(". ", end);
                if (dotIdx > start + size / 2) {
                    end = dotIdx + 2;
                }
            }

            String chunk = text.substring(start, end).trim();
            if (!chunk.isEmpty()) chunks.add(chunk);

            start = Math.max(start + 1, end - overlap);
        }
        return chunks;
    }

    // ─── OPENAI EMBEDDING ─────────────────────────────────
    public float[] generateEmbedding(String text) throws Exception {
        if (openaiKey == null || openaiKey.isBlank())
            throw new RuntimeException("OpenAI API key not set in environment");
        if (text == null || text.isBlank())
            throw new RuntimeException("Empty text");
        if (text.length() > 30000) text = text.substring(0, 30000);

        String body = "{\"model\":\"text-embedding-3-small\",\"input\":"
                + mapper.writeValueAsString(text) + "}";

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("https://api.openai.com/v1/embeddings"))
                .header("Authorization", "Bearer " + openaiKey)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        JsonNode json = mapper.readTree(resp.body());

        if (json.has("error")) {
            JsonNode err = json.get("error");
            String msg = (err.has("message")) ? err.get("message").asText() : err.asText();
            throw new RuntimeException("OpenAI embedding error: " + msg);
        }

        JsonNode dataNode = json.get("data");
        if (dataNode == null || !dataNode.isArray() || dataNode.isEmpty()) {
            throw new RuntimeException("Unexpected OpenAI response: " + resp.body().substring(0, Math.min(300, resp.body().length())));
        }

        JsonNode embNode = dataNode.get(0);
        if (embNode == null || !embNode.has("embedding")) {
            throw new RuntimeException("No embedding in response");
        }

        JsonNode embArray = embNode.get("embedding");
        float[] embedding = new float[embArray.size()];
        for (int i = 0; i < embArray.size(); i++) {
            embedding[i] = (float) embArray.get(i).asDouble();
        }
        return embedding;
    }


    // Convert float[] to pgvector string "[0.1,0.2,...]"
    private String toVectorString(float[] embedding) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < embedding.length; i++) {
            if (i > 0) sb.append(",");
            sb.append(embedding[i]);
        }
        sb.append("]");
        return sb.toString();
    }

    // ─── INDEX FILE ──────────────────────────────────────
    @Async
    public void indexFileAsync(FileEntity file, User user) {
        indexFile(file, user);
    }

    public Map<String, Object> indexFile(FileEntity file, User user) {
        try {
            // Only index PDFs and text files
            String ct = file.getFileType() != null ? file.getFileType() : "";
            String name = file.getFileName().toLowerCase();
            boolean canIndex = ct.contains("pdf") || ct.contains("text") ||
                    name.endsWith(".txt") || name.endsWith(".md") ||
                    name.endsWith(".pdf") || name.endsWith(".py") ||
                    name.endsWith(".java") || name.endsWith(".js") ||
                    name.endsWith(".json") || name.endsWith(".xml") ||
                    name.endsWith(".html") || name.endsWith(".css") ||
                    name.endsWith(".sql") || name.endsWith(".yaml") ||
                    name.endsWith(".yml") || name.endsWith(".sh") ||
                    name.endsWith(".kt") || name.endsWith(".ts");

            if (!canIndex) return Map.of("error", "File type not supported for indexing");

            // Extract text
            String text = extractText(file);
            if (text.isBlank()) return Map.of("error", "No text could be extracted");

            // Delete old chunks
            chunkRepo.deleteByFileId(file.getFileId());

            // Chunk text
            List<String> chunks = chunkText(text, 800, 150);

            // Generate embeddings and store
            int stored = 0;
            for (int i = 0; i < chunks.size(); i++) {
                try {
                    float[] embedding = generateEmbedding(chunks.get(i));
                    String vecStr = toVectorString(embedding);

                    jdbc.update(
                            "INSERT INTO file_chunks (file_id, user_id, chunk_index, content, embedding) " +
                                    "VALUES (?, ?, ?, ?, ?::vector)",
                            file.getFileId(), user.getUserId(), i,
                            chunks.get(i), vecStr
                    );
                    stored++;

                    // Rate limit
                    if (i > 0 && i % 10 == 0) Thread.sleep(200);
                } catch (Exception e) {
                    // Skip problematic chunks
                }
            }

// Genre classification (async, non-blocking)
            try {
                Map<String, String> genre = classifyGenre(text, file.getFileName(),
                        file.getFileType());
                jdbc.update("UPDATE files SET genre = ?, genre_sub = ? WHERE file_id = ?",
                        genre.get("genre"), genre.get("genreSub"), file.getFileId());
            } catch (Exception ignored) {
                // Genre classification fail hone pe skip karo
            }

            // Mark as indexed
            jdbc.update("UPDATE files SET rag_indexed = TRUE WHERE file_id = ?",
                    file.getFileId());

            return Map.of("success", true, "chunks", stored,
                    "fileName", file.getFileName());

        } catch (Exception e) {
            e.printStackTrace();
            return Map.of("error", "Indexing failed: " + e.getMessage());
        }
    }
//Genre Classification
    public Map<String, String> classifyGenre(String text, String fileName,
                                             String fileType) throws Exception {
        // Images, Excel, etc. — heuristic-based
        String name = fileName != null ? fileName.toLowerCase() : "";
        String ct = fileType != null ? fileType.toLowerCase() : "";

        if (ct.startsWith("image/")) return Map.of("genre","Personal","genreSub","Photo/Image");
        if (ct.contains("sheet")||name.endsWith(".xlsx")||name.endsWith(".csv"))
            return Map.of("genre","Professional","genreSub","Spreadsheet/Data");
        if (ct.contains("presentation")||name.endsWith(".pptx"))
            return Map.of("genre","Professional","genreSub","Presentation");

        // For text content — use OpenAI
        if (openaiKey == null || openaiKey.isBlank())
            return Map.of("genre","Uncategorized","genreSub","");

        String sample = text.length() > 2000 ? text.substring(0, 2000) : text;
        String prompt = "Classify this document into exactly one genre and sub-genre.\n\n" +
                "Available genres:\n" +
                "- Fiction (sub: Literary, SciFi, Fantasy, Mystery, Romance, Horror, Other)\n" +
                "- Academic (sub: ComputerScience, Mathematics, Physics, Chemistry, Biology, " +
                "History, Economics, Engineering, Medicine, Law, Other)\n" +
                "- Philosophy (sub: Ethics, Metaphysics, Political, Social, Other)\n" +
                "- Professional (sub: Report, Documentation, Contract, Technical, Finance, Marketing, Other)\n" +
                "- Personal (sub: Notes, Journal, Resume, Other)\n" +
                "- Reference (sub: Manual, Guide, Dictionary, Other)\n" +
                "- Code (sub: Java, Python, JavaScript, Web, Database, Config, Other)\n" +
                "- Other (sub: Unknown)\n\n" +
                "Respond with ONLY JSON: {\"genre\":\"...\",\"genreSub\":\"...\"}\n\n" +
                "Document (filename: " + fileName + "):\n" + sample;

        String body = "{\"model\":\"gpt-3.5-turbo\",\"messages\":[" +
                "{\"role\":\"system\",\"content\":\"You are a document classifier. Respond only with JSON.\"}," +
                "{\"role\":\"user\",\"content\":" +
                mapper.writeValueAsString(prompt) + "}]," +
                "\"max_tokens\":50,\"temperature\":0}";

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("https://api.openai.com/v1/chat/completions"))
                .header("Authorization", "Bearer " + openaiKey)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        JsonNode json = mapper.readTree(resp.body());
        String content = json.get("choices").get(0).get("message").get("content").asText();

        // Parse JSON response
        JsonNode result = mapper.readTree(content.trim());
        return Map.of(
                "genre", result.has("genre") ? result.get("genre").asText() : "Uncategorized",
                "genreSub", result.has("genreSub") ? result.get("genreSub").asText() : ""
        );
    }

    // ─── SEMANTIC SEARCH ─────────────────────────────────
    public List<Map<String, Object>> searchChunks(String query, User user, int topK)
            throws Exception {
        float[] queryEmbedding = generateEmbedding(query);
        String vecStr = toVectorString(queryEmbedding);

        List<Map<String, Object>> results = jdbc.queryForList(
                "SELECT c.chunk_id, c.content, c.chunk_index, " +
                        "       f.file_id, f.file_name, " +
                        "       1 - (c.embedding <=> ?::vector) AS similarity " +
                        "FROM file_chunks c " +
                        "JOIN files f ON c.file_id = f.file_id " +
                        "WHERE c.user_id = ? " +
                        "  AND 1 - (c.embedding <=> ?::vector) > 0.3 " +
                        "ORDER BY c.embedding <=> ?::vector " +
                        "LIMIT ?",
                vecStr, user.getUserId(), vecStr, vecStr, topK
        );
        return results;
    }

    // ─── RAG CHAT ────────────────────────────────────────
    public Map<String, Object> chat(String question, User user,
                                    List<Map<String, String>> history) throws Exception {
        // Search relevant chunks
        List<Map<String, Object>> chunks = searchChunks(question, user, 5);

        if (chunks.isEmpty()) {
            return Map.of(
                    "answer", "I couldn't find relevant information in your files. " +
                            "Make sure your files are indexed (click the ⚡ index button on a file).",
                    "sources", List.of()
            );
        }

        // Build context
        StringBuilder context = new StringBuilder();
        List<String> sourceFiles = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();

        for (Map<String, Object> chunk : chunks) {
            String fname = (String) chunk.get("file_name");
            if (seen.add(fname)) sourceFiles.add(fname);
            context.append("--- From: ").append(fname).append(" ---\n");
            context.append(chunk.get("content")).append("\n\n");
        }

        // Build messages
        List<Map<String, String>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system",
                "content", "You are a helpful assistant that answers questions based on the user's uploaded files. " +
                        "Always base your answers on the provided context. " +
                        "If the context doesn't contain enough information, say so clearly. " +
                        "Be concise and accurate."));

        // Add conversation history (last 4 messages)
        if (history != null) {
            int start = Math.max(0, history.size() - 4);
            messages.addAll(history.subList(start, history.size()));
        }

        messages.add(Map.of("role", "user",
                "content", "Context from files:\n" + context + "\n\nQuestion: " + question));

        // Call OpenAI chat
        String answer = callChatCompletion(messages);

        return Map.of(
                "answer", answer,
                "sources", sourceFiles,
                "chunks", chunks.size()
        );
    }


    // callChatCompletion — null check + proper JSON serialization
    private String callChatCompletion(List<Map<String, String>> messages) throws Exception {
        Map<String, Object> bodyMap = new java.util.LinkedHashMap<>();
        bodyMap.put("model", "gpt-3.5-turbo");
        bodyMap.put("messages", messages);
        bodyMap.put("max_tokens", 800);
        bodyMap.put("temperature", 0.3);

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("https://api.openai.com/v1/chat/completions"))
                .header("Authorization", "Bearer " + openaiKey)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(bodyMap)))
                .build();

        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        JsonNode json = mapper.readTree(resp.body());

        // Check for error first
        if (json.has("error")) {
            JsonNode err = json.get("error");
            String msg = err.has("message") ? err.get("message").asText() : err.asText();
            return "OpenAI Error: " + msg;
        }

        // Safe null checks at every step
        JsonNode choices = json.get("choices");
        if (choices == null || !choices.isArray() || choices.isEmpty()) {
            return "No response from AI. Check your OpenAI API key and quota.";
        }

        JsonNode choice = choices.get(0);
        if (choice == null) return "Empty choice in AI response.";

        JsonNode message = choice.get("message");
        if (message == null) return "No message in AI response.";

        JsonNode content = message.get("content");
        if (content == null || content.isNull()) return "No content in AI response.";

        return content.asText();
    }
    // ─── INDEXING STATUS ─────────────────────────────────
    public Map<String, Object> getStatus(User user) {
        Long totalChunks = chunkRepo.countByUserId(user.getUserId());
        List<Map<String, Object>> indexedFiles = jdbc.queryForList(
                "SELECT f.file_id, f.file_name, f.file_type, " +
                        "       COUNT(c.chunk_id) as chunk_count " +
                        "FROM files f " +
                        "LEFT JOIN file_chunks c ON f.file_id = c.file_id " +
                        "WHERE f.user_id = ? AND f.rag_indexed = TRUE " +
                        "GROUP BY f.file_id, f.file_name, f.file_type",
                user.getUserId()
        );
        return Map.of(
                "totalChunks", totalChunks,
                "indexedFiles", indexedFiles,
                "hasApiKey", openaiKey != null && !openaiKey.isBlank()
        );
    }
}