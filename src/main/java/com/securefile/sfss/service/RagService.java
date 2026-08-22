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

    @Value("${groq.api.key:}")
    private String groqKey;

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
    // Keyword-based chunk search — no embeddings needed
    // Keyword-based chunk search — no embeddings needed
    public List<Map<String, Object>> searchChunks(String query, User user, int topK) {
        String q = query.toLowerCase().trim();

        // Common stopwords + greetings — skip retrieval for these
        Set<String> stopwords = Set.of("hi","hello","hey","the","is","are","a","an",
                "of","to","in","on","for","and","or","what","how","why","can","you",
                "please","ok","okay","thanks","thank");

        String[] rawWords = q.split("\\s+");
        List<String> words = new ArrayList<>();
        for (String w : rawWords) {
            // Only use words with length >= 4 and not common stopwords
            if (w.length() >= 4 && !stopwords.contains(w)) {
                words.add(w);
            }
        }

        // If nothing meaningful to search (e.g. just "hi"), return empty — no context
        if (words.isEmpty()) return java.util.Collections.emptyList();

        StringBuilder sql = new StringBuilder(
                "SELECT c.chunk_id, c.content, c.chunk_index, f.file_id, f.file_name " +
                        "FROM file_chunks c JOIN files f ON c.file_id = f.file_id " +
                        "WHERE c.user_id = ? AND (");

        for (int i = 0; i < words.size(); i++) {
            if (i > 0) sql.append(" OR ");
            sql.append("LOWER(c.content) LIKE ?");
        }
        sql.append(") ORDER BY c.file_id, c.chunk_index LIMIT ?");

        Object[] params = new Object[words.size() + 2];
        params[0] = user.getUserId();
        for (int i = 0; i < words.size(); i++) params[i + 1] = "%" + words.get(i) + "%";
        params[params.length - 1] = topK;

        return jdbc.queryForList(sql.toString(), params);
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
//                    float[] embedding = generateEmbedding(chunks.get(i));
//                    String vecStr = toVectorString(embedding);
//
//                    jdbc.update(
//                            "INSERT INTO file_chunks (file_id, user_id, chunk_index, content, embedding) " +
//                                    "VALUES (?, ?, ?, ?, ?::vector)",
//                            file.getFileId(), user.getUserId(), i,
//                            chunks.get(i), vecStr
//                    );
//                    stored++;

                    jdbc.update(
                            "INSERT INTO file_chunks (file_id, user_id, chunk_index, content) " +
                                    "VALUES (?, ?, ?, ?)",
                            file.getFileId(), user.getUserId(), i, chunks.get(i)
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
//    public Map<String, String> classifyGenre(String text, String fileName,
//                                             String fileType) throws Exception {
//        // Images, Excel, etc. — heuristic-based
//        String name = fileName != null ? fileName.toLowerCase() : "";
//        String ct = fileType != null ? fileType.toLowerCase() : "";
//
//        if (ct.startsWith("image/")) return Map.of("genre","Personal","genreSub","Photo/Image");
//        if (ct.contains("sheet")||name.endsWith(".xlsx")||name.endsWith(".csv"))
//            return Map.of("genre","Professional","genreSub","Spreadsheet/Data");
//        if (ct.contains("presentation")||name.endsWith(".pptx"))
//            return Map.of("genre","Professional","genreSub","Presentation");
//
//        // For text content — use OpenAI
//        if (openaiKey == null || openaiKey.isBlank())
//            return Map.of("genre","Uncategorized","genreSub","");
//
//        String sample = text.length() > 2000 ? text.substring(0, 2000) : text;
//        String prompt = "Classify this document into exactly one genre and sub-genre.\n\n" +
//                "Available genres:\n" +
//                "- Fiction (sub: Literary, SciFi, Fantasy, Mystery, Romance, Horror, Other)\n" +
//                "- Academic (sub: ComputerScience, Mathematics, Physics, Chemistry, Biology, " +
//                "History, Economics, Engineering, Medicine, Law, Other)\n" +
//                "- Philosophy (sub: Ethics, Metaphysics, Political, Social, Other)\n" +
//                "- Professional (sub: Report, Documentation, Contract, Technical, Finance, Marketing, Other)\n" +
//                "- Personal (sub: Notes, Journal, Resume, Other)\n" +
//                "- Reference (sub: Manual, Guide, Dictionary, Other)\n" +
//                "- Code (sub: Java, Python, JavaScript, Web, Database, Config, Other)\n" +
//                "- Other (sub: Unknown)\n\n" +
//                "Respond with ONLY JSON: {\"genre\":\"...\",\"genreSub\":\"...\"}\n\n" +
//                "Document (filename: " + fileName + "):\n" + sample;
//
//        String body = "{\"model\":\"gpt-3.5-turbo\",\"messages\":[" +
//                "{\"role\":\"system\",\"content\":\"You are a document classifier. Respond only with JSON.\"}," +
//                "{\"role\":\"user\",\"content\":" +
//                mapper.writeValueAsString(prompt) + "}]," +
//                "\"max_tokens\":50,\"temperature\":0}";
//
//        HttpRequest req = HttpRequest.newBuilder()
//                .uri(URI.create("https://api.openai.com/v1/chat/completions"))
//                .header("Authorization", "Bearer " + openaiKey)
//                .header("Content-Type", "application/json")
//                .POST(HttpRequest.BodyPublishers.ofString(body))
//                .build();
//
//        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
//        JsonNode json = mapper.readTree(resp.body());
//        String content = json.get("choices").get(0).get("message").get("content").asText();
//
//        // Parse JSON response
//        JsonNode result = mapper.readTree(content.trim());
//        return Map.of(
//                "genre", result.has("genre") ? result.get("genre").asText() : "Uncategorized",
//                "genreSub", result.has("genreSub") ? result.get("genreSub").asText() : ""
//        );
//    }


    public Map<String, String> classifyGenre(String text, String fileName,
                                             String fileType) throws Exception {
        if (groqKey == null || groqKey.isBlank())
            return classifyGenreHeuristic(fileName, fileType);

        String sample = text.length() > 1500 ? text.substring(0, 1500) : text;
        List<Map<String, String>> messages = new java.util.ArrayList<>();
        messages.add(java.util.Map.of("role", "system",
                "content", "You are a document classifier. Respond ONLY with valid JSON, no extra text."));
        messages.add(java.util.Map.of("role", "user",
                "content", "Classify this document. Choose genre from: Study, Work, Personal, Code, Fiction, Reference, Other. " +
                        "Respond ONLY with JSON like: {\"genre\":\"Study\",\"genreSub\":\"Computer Science\"}\n\n" +
                        "Filename: " + fileName + "\n\n" + sample));

        String answer = callChatCompletion(messages);
        try {
            answer = answer.replaceAll("```json","").replaceAll("```","").trim();
            JsonNode result = mapper.readTree(answer);
            return java.util.Map.of(
                    "genre",    result.has("genre")    ? result.get("genre").asText()    : "Other",
                    "genreSub", result.has("genreSub") ? result.get("genreSub").asText() : ""
            );
        } catch (Exception e) {
            return classifyGenreHeuristic(fileName, fileType);
        }
    }

    // Heuristic Method
    public Map<String, String> classifyGenreHeuristic(String fileName, String fileType) {
        String n   = (fileName  != null ? fileName  : "").toLowerCase().replaceAll("[_\\-]", " ");
        String ct  = (fileType  != null ? fileType  : "").toLowerCase();
        String base= n.contains(".") ? n.substring(0, n.lastIndexOf('.')) : n;

        if (n.endsWith(".java")||n.endsWith(".kt"))           return g("Code","Java");
        if (n.endsWith(".py")||n.endsWith(".ipynb"))          return g("Code","Python");
        if (n.endsWith(".js")||n.endsWith(".ts")||n.endsWith(".jsx")||n.endsWith(".tsx")) return g("Code","JavaScript");
        if (n.endsWith(".html")||n.endsWith(".css")||n.endsWith(".scss")) return g("Code","Web");
        if (n.endsWith(".sql"))                               return g("Code","Database");
        if (n.endsWith(".sh")||n.endsWith(".bash")||n.endsWith(".bat")) return g("Code","Scripts");
        if (n.endsWith(".json")||n.endsWith(".yaml")||n.endsWith(".yml")||
                n.endsWith(".xml")||n.endsWith(".toml")||n.endsWith(".properties")||
                n.endsWith(".env")||n.endsWith(".ini"))           return g("Code","Config");
        if (n.endsWith(".c")||n.endsWith(".cpp")||n.endsWith(".h")||
                n.endsWith(".cs")||n.endsWith(".go")||n.endsWith(".rs")) return g("Code","Systems");

        if (ct.startsWith("image/"))                          return g("Personal","Photos & Images");

        boolean isExam  = kw(base,"exam","test","quiz","pyq","previous year","question paper","assignment","homework");
        boolean isCS    = kw(base,"linux","unix","algorithm","data structure","programming","software","computer","machine learning","neural","deep learning");
        boolean isMath  = kw(base,"math","calculus","algebra","geometry","statistics","probability");
        boolean isPhys  = kw(base,"physics","mechanics","thermodynamics","quantum","optics");
        boolean isChem  = kw(base,"chemistry","organic","inorganic","chemical");
        boolean isBio   = kw(base,"biology","anatomy","genetics","ecology","microb");
        boolean isStudy = kw(base,"lecture","notes","textbook","book","chapter","study","course","university","college","school");
        boolean isFict  = kw(base,"novel","fiction","story","tale","fantasy","romance","thriller","mystery","horror");
        boolean isWork  = kw(base,"report","proposal","invoice","contract","budget","project","analysis","presentation","plan","memo");

        if (isExam) {
            if (isCS)   return g("Study","CS Exam / Assignment");
            if (isMath) return g("Study","Math Exam / Assignment");
            if (isPhys) return g("Study","Physics Exam / Assignment");
            return      g("Study","Exam Material");
        }
        if (isCS)    return g("Study","Computer Science");
        if (isMath)  return g("Study","Mathematics");
        if (isPhys)  return g("Study","Physics");
        if (isChem)  return g("Study","Chemistry");
        if (isBio)   return g("Study","Biology");
        if (isStudy) return g("Study","Study Material");
        if (isFict)  return g("Fiction","General Fiction");
        if (isWork)  return g("Work","Reports & Documents");

        if (ct.contains("sheet")||ct.contains("excel")||n.endsWith(".xlsx")||n.endsWith(".csv"))
            return g("Work","Data & Spreadsheets");
        if (ct.contains("presentation")||n.endsWith(".pptx")) return g("Work","Presentation");
        if (kw(base,"manual","guide","handbook","reference","readme","howto","documentation"))
            return g("Reference","Manual & Guide");
        if (kw(base,"diary","journal","personal","note"))      return g("Personal","Notes & Journal");
        if (ct.contains("pdf"))                                return g("Study","Document");
        if (ct.contains("word")||ct.contains("document"))      return g("Work","Document");

        return g("Other","Uncategorized");
    }

    private Map<String, String> g(String genre, String sub) {
        return java.util.Map.of("genre", genre, "genreSub", sub);
    }

    private boolean kw(String text, String... keywords) {
        for (String k : keywords) { if (text.contains(k)) return true; }
        return false;
    }


    // ─── SEMANTIC SEARCH ─────────────────────────────────
//    public List<Map<String, Object>> searchChunks(String query, User user, int topK)
//            throws Exception {
//        float[] queryEmbedding = generateEmbedding(query);
//        String vecStr = toVectorString(queryEmbedding);
//
//        List<Map<String, Object>> results = jdbc.queryForList(
//                "SELECT c.chunk_id, c.content, c.chunk_index, " +
//                        "       f.file_id, f.file_name, " +
//                        "       1 - (c.embedding <=> ?::vector) AS similarity " +
//                        "FROM file_chunks c " +
//                        "JOIN files f ON c.file_id = f.file_id " +
//                        "WHERE c.user_id = ? " +
//                        "  AND 1 - (c.embedding <=> ?::vector) > 0.3 " +
//                        "ORDER BY c.embedding <=> ?::vector " +
//                        "LIMIT ?",
//                vecStr, user.getUserId(), vecStr, vecStr, topK
//        );
//        return results;
//    }

    // ─── RAG CHAT ────────────────────────────────────────
    public Map<String, Object> chat(String question, User user,
                                    List<Map<String, String>> history) throws Exception {
        List<Map<String, Object>> chunks = searchChunks(question, user, 6);

        StringBuilder context = new StringBuilder();
        Set<String> sources = new LinkedHashSet<>();
        for (Map<String, Object> c : chunks) {
            context.append("From '").append(c.get("file_name")).append("': ")
                    .append(c.get("content")).append("\n\n");
            sources.add((String) c.get("file_name"));
        }

        String systemPrompt;
        if (context.length() == 0) {
            systemPrompt = "You are a helpful assistant for a file storage app. " +
                    "No relevant document context was found for this query. " +
                    "If the user is just greeting (hi/hello) or asking something general, " +
                    "respond normally and briefly mention you can answer questions about their indexed files.";
        } else {
            systemPrompt = "You are a helpful assistant answering questions about the user's documents. " +
                    "Use the provided context to answer. If the context doesn't actually help " +
                    "answer the question, say so honestly instead of guessing.\n\nContext:\n" + context;
        }

        List<Map<String, String>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", systemPrompt));
        if (history != null) messages.addAll(history);
        messages.add(Map.of("role", "user", "content", question));

        String answer = callChatCompletion(messages);
        return Map.of("answer", answer, "sources", new ArrayList<>(sources));
    }


    // callChatCompletion — null check + proper JSON serialization
//    private String callChatCompletion(List<Map<String, String>> messages) throws Exception {
//        Map<String, Object> bodyMap = new java.util.LinkedHashMap<>();
//        bodyMap.put("model", "gpt-3.5-turbo");
//        bodyMap.put("messages", messages);
//        bodyMap.put("max_tokens", 800);
//        bodyMap.put("temperature", 0.3);
//
//        HttpRequest req = HttpRequest.newBuilder()
//                .uri(URI.create("https://api.openai.com/v1/chat/completions"))
//                .header("Authorization", "Bearer " + openaiKey)
//                .header("Content-Type", "application/json")
//                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(bodyMap)))
//                .build();
//
//        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
//        JsonNode json = mapper.readTree(resp.body());
//
//        // Check for error first
//        if (json.has("error")) {
//            JsonNode err = json.get("error");
//            String msg = err.has("message") ? err.get("message").asText() : err.asText();
//            return "OpenAI Error: " + msg;
//        }
//
//        // Safe null checks at every step
//        JsonNode choices = json.get("choices");
//        if (choices == null || !choices.isArray() || choices.isEmpty()) {
//            return "No response from AI. Check your OpenAI API key and quota.";
//        }
//
//        JsonNode choice = choices.get(0);
//        if (choice == null) return "Empty choice in AI response.";
//
//        JsonNode message = choice.get("message");
//        if (message == null) return "No message in AI response.";
//
//        JsonNode content = message.get("content");
//        if (content == null || content.isNull()) return "No content in AI response.";
//
//        return content.asText();
//    }

    private String callChatCompletion(List<Map<String, String>> messages) throws Exception {
        if (groqKey == null || groqKey.isBlank())
            return "AI key not configured. Add GROQ_API_KEY in Render environment.";

        Map<String, Object> bodyMap = new java.util.LinkedHashMap<>();
        // bodyMap.put("model", "llama-3.1-8b-instant");
bodyMap.put("model", "openai/gpt-oss-20b");
        bodyMap.put("messages", messages);
        bodyMap.put("max_tokens", 800);
        bodyMap.put("temperature", 0.4);

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("https://api.groq.com/openai/v1/chat/completions"))
                .header("Authorization", "Bearer " + groqKey)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(bodyMap)))
                .build();

        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        JsonNode json = mapper.readTree(resp.body());

        if (json.has("error")) {
            JsonNode err = json.get("error");
            return "Groq Error: " + (err.has("message") ? err.get("message").asText() : err.asText());
        }
        JsonNode choices = json.get("choices");
        if (choices == null || choices.isEmpty()) return "No response from AI.";
        JsonNode content = choices.get(0).get("message").get("content");
        return content != null ? content.asText() : "Empty response.";
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
                "hasApiKey", groqKey != null && !groqKey.isBlank()

        );
    }
}
