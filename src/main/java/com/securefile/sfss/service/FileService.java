package com.securefile.sfss.service;

import com.securefile.sfss.model.*;
import com.securefile.sfss.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class FileService {

    @Autowired private FileRepository         fileRepository;
    @Autowired private FolderRepository       folderRepository;
    @Autowired private ActivityLogRepository  activityLogRepository;
    @Autowired private StorageService         storageService;

    // ═══════════════════════════════════════════════════
    //  UPLOAD
    // ═══════════════════════════════════════════════════
    public Map<String, Object> uploadFile(MultipartFile file,
                                          Integer folderId,
                                          User user) throws IOException {
        String originalName = file.getOriginalFilename() != null
                ? file.getOriginalFilename() : "unnamed";
        String ext = originalName.contains(".")
                ? originalName.substring(originalName.lastIndexOf(".")) : "";
        String storedName = UUID.randomUUID() + ext;

        // Upload to Supabase Storage
        storageService.uploadFile(storedName, file);

        FileEntity fe = new FileEntity();
        fe.setFileName(originalName);
        fe.setStoredName(storedName);
        fe.setStoragePath(storedName);
        fe.setFileType(file.getContentType());
        fe.setFileSize(file.getSize());
        fe.setUser(user);
        fe.setRagIndexed(false);

        // Folder assignment
        if (folderId != null) {
            folderRepository.findByFolderIdAndUser(folderId, user)
                    .ifPresent(fe::setFolder);
        } else {
            String cat = determineCategory(file.getContentType(), originalName);
            String physicalFolder = cat.startsWith("Code") ? "Others" : cat;
            fe.setFolder(getOrCreateAutoFolder(physicalFolder, user));
        }

        fileRepository.save(fe);
        logActivity(user, fe, "UPLOAD");

        return Map.of("success", true, "fileName", originalName,
                "fileId", fe.getFileId());
    }

    // ═══════════════════════════════════════════════════
    //  DELETE
    // ═══════════════════════════════════════════════════
    public boolean deleteFile(Integer fileId, User user) {
        Optional<FileEntity> opt = fileRepository.findByFileIdAndUser(fileId, user);
        if (opt.isEmpty()) return false;
        FileEntity fe = opt.get();

        // Delete from Supabase Storage
        try {
            storageService.deleteFile(fe.getStoredName());
        } catch (Exception ignored) {
            try {
                if (fe.getStoragePath() != null)
                    java.nio.file.Files.deleteIfExists(
                            java.nio.file.Paths.get(fe.getStoragePath()));
            } catch (Exception e2) { /* ignore */ }
        }

        logActivity(user, fe, "DELETE");
        fileRepository.delete(fe);
        return true;
    }

    // ═══════════════════════════════════════════════════
    //  SINGLE FILE (2 params — used by preview/download)
    // ═══════════════════════════════════════════════════
    public Optional<FileEntity> getFile(Integer fileId, User user) {
        return fileRepository.findByFileIdAndUser(fileId, user);
    }

    // ═══════════════════════════════════════════════════
    //  ALL FILES
    // ═══════════════════════════════════════════════════
    public List<Map<String, Object>> getAllFiles(User user, Set<Integer> unlocked) {
        return toMapList(
                fileRepository.findByUserOrderByUploadedAtDesc(user)
                        .stream()
                        .filter(f -> isAccessible(f, unlocked))
                        .collect(Collectors.toList()));
    }

    // ═══════════════════════════════════════════════════
    //  STATS (Dashboard overview)
    // ═══════════════════════════════════════════════════
    public Map<String, Object> getConsolidatedStats(User user, Set<Integer> unlocked) {
        List<FileEntity> all = fileRepository.findByUserOrderByUploadedAtDesc(user)
                .stream()
                .filter(f -> isAccessible(f, unlocked))
                .collect(Collectors.toList());

        // Category counts
        Map<String, Long> catCounts = new LinkedHashMap<>();
        String[] mainCats = {"PDFs","Images","Documents","Spreadsheets",
                "Presentations","Text Files","Code","Archives","Others"};
        for (String c : mainCats) catCounts.put(c, 0L);

        for (FileEntity f : all) {
            String cat = determineCategory(f.getFileType(), f.getFileName());
            String key = cat.startsWith("Code") ? "Code" : cat;
            catCounts.merge(key, 1L, Long::sum);
        }

        // Storage
        long totalBytes = all.stream()
                .mapToLong(f -> f.getFileSize() != null ? f.getFileSize() : 0L)
                .sum();

        // Recent 6
        List<Map<String, Object>> recent = all.stream()
                .limit(6)
                .map(this::toSingleMap)
                .collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", all.size());
        result.put("categories", catCounts);
        result.put("storageBytes", totalBytes);
        result.put("storageUsed", formatSize(totalBytes));
        result.put("recentFiles", recent);
        return result;
    }

    // ═══════════════════════════════════════════════════
    //  BY CATEGORY
    // ═══════════════════════════════════════════════════
    public List<Map<String, Object>> getFilesByCategory(String category,
                                                        User user,
                                                        Set<Integer> unlocked) {
        return toMapList(
                fileRepository.findByUserOrderByUploadedAtDesc(user)
                        .stream()
                        .filter(f -> isAccessible(f, unlocked))
                        .filter(f -> {
                            String cat = determineCategory(f.getFileType(), f.getFileName());
                            return category.equals(cat)
                                    || (category.equals("Code") && cat.startsWith("Code"));
                        })
                        .collect(Collectors.toList()));
    }

    // ═══════════════════════════════════════════════════
    //  BY EXTENSION
    // ═══════════════════════════════════════════════════
    public List<Map<String, Object>> getFilesByExtension(String extension,
                                                         User user,
                                                         Set<Integer> unlocked) {
        String ext = extension.startsWith(".") ? extension : "." + extension;
        return toMapList(
                fileRepository.findByUserOrderByUploadedAtDesc(user)
                        .stream()
                        .filter(f -> isAccessible(f, unlocked))
                        .filter(f -> f.getFileName().toLowerCase().endsWith(ext.toLowerCase()))
                        .collect(Collectors.toList()));
    }

    // ═══════════════════════════════════════════════════
    //  IN FOLDER
    // ═══════════════════════════════════════════════════
    public List<Map<String, Object>> getFilesInFolder(Integer folderId,
                                                      User user,
                                                      Set<Integer> unlocked) {
        Optional<Folder> folderOpt = folderRepository.findByFolderIdAndUser(folderId, user);
        if (folderOpt.isEmpty()) return List.of();
        return toMapList(
                fileRepository.findByFolderAndUserOrderByUploadedAtDesc(folderOpt.get(), user)
                        .stream()
                        .filter(f -> isAccessible(f, unlocked))
                        .collect(Collectors.toList()));
    }

    // ═══════════════════════════════════════════════════
    //  SEARCH
    // ═══════════════════════════════════════════════════
    public List<Map<String, Object>> searchFiles(String keyword,
                                                 User user,
                                                 Set<Integer> unlocked) {
        return toMapList(
                fileRepository.findByUserAndFileNameContainingIgnoreCase(user, keyword)
                        .stream()
                        .filter(f -> isAccessible(f, unlocked))
                        .collect(Collectors.toList()));
    }

    // ═══════════════════════════════════════════════════
    //  CODE SUB-CATEGORIES
    // ═══════════════════════════════════════════════════
    public Map<String, Long> getCodeSubcats(User user, Set<Integer> unlocked) {
        return fileRepository.findByUserOrderByUploadedAtDesc(user)
                .stream()
                .filter(f -> isAccessible(f, unlocked))
                .filter(f -> determineCategory(f.getFileType(), f.getFileName())
                        .startsWith("Code"))
                .collect(Collectors.groupingBy(
                        f -> getCodeSubCategory(f.getFileName()),
                        Collectors.counting()));
    }

    // ═══════════════════════════════════════════════════
    //  OTHERS SUB-CATEGORIES (by extension)
    // ═══════════════════════════════════════════════════
    public Map<String, Long> getOthersSubcats(User user, Set<Integer> unlocked) {
        return fileRepository.findByUserOrderByUploadedAtDesc(user)
                .stream()
                .filter(f -> isAccessible(f, unlocked))
                .filter(f -> "Others".equals(
                        determineCategory(f.getFileType(), f.getFileName())))
                .collect(Collectors.groupingBy(f -> {
                    String n = f.getFileName();
                    int dot = n.lastIndexOf('.');
                    return dot >= 0 ? n.substring(dot).toLowerCase() : ".unknown";
                }, Collectors.counting()));
    }

    // ═══════════════════════════════════════════════════
    //  BY GENRE (AI classified)
    // ═══════════════════════════════════════════════════
    public List<Map<String, Object>> getFilesByGenre(String genre,
                                                     String genreSub,
                                                     User user,
                                                     Set<Integer> unlocked) {
        return toMapList(
                fileRepository.findByUserOrderByUploadedAtDesc(user)
                        .stream()
                        .filter(f -> isAccessible(f, unlocked))
                        .filter(f -> genre.equals(f.getGenre()))
                        .filter(f -> genreSub == null || genreSub.isEmpty()
                                || genreSub.equals(f.getGenreSub()))
                        .collect(Collectors.toList()));
    }

    // ═══════════════════════════════════════════════════
    //  FOLDER — EXTENSION STATS
    // ═══════════════════════════════════════════════════
    public Map<String, Long> getFolderExtensionStats(Integer folderId,
                                                     User user,
                                                     Set<Integer> unlocked) {
        Optional<Folder> opt = folderRepository.findByFolderIdAndUser(folderId, user);
        if (opt.isEmpty()) return Map.of();
        return fileRepository.findByFolderAndUserOrderByUploadedAtDesc(opt.get(), user)
                .stream()
                .filter(f -> isAccessible(f, unlocked))
                .collect(Collectors.groupingBy(f -> {
                    String n = f.getFileName();
                    int dot = n.lastIndexOf('.');
                    return dot >= 0 ? n.substring(dot + 1).toUpperCase() : "OTHER";
                }, Collectors.counting()));
    }

    // ═══════════════════════════════════════════════════
    //  FOLDER — FILES BY EXTENSION
    // ═══════════════════════════════════════════════════
    public List<Map<String, Object>> getFilesByFolderAndExtension(Integer folderId,
                                                                  String extension,
                                                                  User user,
                                                                  Set<Integer> unlocked) {
        Optional<Folder> opt = folderRepository.findByFolderIdAndUser(folderId, user);
        if (opt.isEmpty()) return List.of();
        String ext = extension.startsWith(".") ? extension.toLowerCase()
                : "." + extension.toLowerCase();
        return toMapList(
                fileRepository.findByFolderAndUserOrderByUploadedAtDesc(opt.get(), user)
                        .stream()
                        .filter(f -> isAccessible(f, unlocked))
                        .filter(f -> f.getFileName().toLowerCase().endsWith(ext))
                        .collect(Collectors.toList()));
    }

    // ═══════════════════════════════════════════════════
    //  HELPERS — ACCESS CONTROL
    // ═══════════════════════════════════════════════════
    private boolean isAccessible(FileEntity f, Set<Integer> unlocked) {
        if (f.getFolder() == null) return true;
        Folder folder = f.getFolder();
        if (!Boolean.TRUE.equals(folder.getIsProtected())) return true;
        return unlocked != null && unlocked.contains(folder.getFolderId());
    }

    // ═══════════════════════════════════════════════════
    //  HELPERS — CATEGORY DETECTION
    // ═══════════════════════════════════════════════════
    private String determineCategory(String contentType, String fileName) {
        String name = fileName != null ? fileName.toLowerCase() : "";
        String ct   = contentType != null ? contentType.toLowerCase() : "";

        // Extension-first
        if (name.endsWith(".pdf")) return "PDFs";
        if (name.matches(".*\\.(jpg|jpeg|png|gif|bmp|webp|svg|ico|tiff|tif)"))
            return "Images";
        if (name.matches(".*\\.(doc|docx|odt|rtf)")) return "Documents";
        if (name.matches(".*\\.(xls|xlsx|csv|ods)")) return "Spreadsheets";
        if (name.matches(".*\\.(ppt|pptx|odp)")) return "Presentations";
        if (name.matches(".*\\.(txt|log|md|rst|nfo)")) return "Text Files";
        if (name.matches(".*\\.(zip|rar|7z|tar|gz|bz2|xz)")) return "Archives";
        if (name.matches(".*\\.(java|kt|py|js|ts|jsx|tsx|html|htm|css|scss|" +
                "json|xml|yaml|yml|sql|sh|bash|c|cpp|h|hpp|cs|go|rs|rb|php|" +
                "swift|dart|r|lua|pl|scala|groovy|gradle|toml|env|bat|ps1|" +
                "properties|conf|ini|cfg|mjs|cjs)"))
            return getCodeSubCategory(name);

        // MIME fallback
        if (ct.contains("pdf")) return "PDFs";
        if (ct.startsWith("image/")) return "Images";
        if (ct.contains("word") || ct.contains("document")) return "Documents";
        if (ct.contains("sheet") || ct.contains("excel")) return "Spreadsheets";
        if (ct.contains("presentation")) return "Presentations";
        if (ct.startsWith("text/plain")) return "Text Files";
        if (ct.contains("zip") || ct.contains("compressed") ||
                ct.contains("archive")) return "Archives";

        return "Others";
    }

    private String getCodeSubCategory(String fileName) {
        String n = fileName.toLowerCase();
        if (n.endsWith(".java") || n.endsWith(".kt") || n.endsWith(".groovy") ||
                n.endsWith(".gradle")) return "Code › Java";
        if (n.endsWith(".py") || n.endsWith(".r")) return "Code › Python";
        if (n.endsWith(".js") || n.endsWith(".jsx") || n.endsWith(".mjs") ||
                n.endsWith(".cjs") || n.endsWith(".ts") || n.endsWith(".tsx"))
            return "Code › JavaScript";
        if (n.endsWith(".html") || n.endsWith(".htm") || n.endsWith(".css") ||
                n.endsWith(".scss")) return "Code › Web";
        if (n.endsWith(".json") || n.endsWith(".yaml") || n.endsWith(".yml") ||
                n.endsWith(".toml") || n.endsWith(".env") || n.endsWith(".properties") ||
                n.endsWith(".conf") || n.endsWith(".ini") || n.endsWith(".cfg"))
            return "Code › Config";
        if (n.endsWith(".c") || n.endsWith(".cpp") || n.endsWith(".h") ||
                n.endsWith(".hpp") || n.endsWith(".cs") || n.endsWith(".go") ||
                n.endsWith(".rs") || n.endsWith(".swift") || n.endsWith(".dart"))
            return "Code › Systems";
        if (n.endsWith(".sh") || n.endsWith(".bash") || n.endsWith(".bat") ||
                n.endsWith(".ps1")) return "Code › Scripts";
        if (n.endsWith(".sql")) return "Code › SQL";
        return "Code › Other Languages";
    }

    // ═══════════════════════════════════════════════════
    //  HELPERS — AUTO FOLDER
    // ═══════════════════════════════════════════════════
    private Folder getOrCreateAutoFolder(String name, User user) {
        return folderRepository
                .findByUserOrderByCreatedAtDesc(user)
                .stream()
                .filter(f -> name.equals(f.getFolderName())
                        && f.getParentFolderId() == null)
                .findFirst()
                .orElseGet(() -> {
                    Folder f = new Folder();
                    f.setFolderName(name);
                    f.setUser(user);
                    return folderRepository.save(f);
                });
    }

    // ═══════════════════════════════════════════════════
    //  HELPERS — MAP CONVERSION
    // ═══════════════════════════════════════════════════
    private List<Map<String, Object>> toMapList(List<FileEntity> files) {
        return files.stream().map(this::toSingleMap).collect(Collectors.toList());
    }

    private Map<String, Object> toSingleMap(FileEntity fe) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("fileId",      fe.getFileId());
        m.put("fileName",    fe.getFileName());
        m.put("storedName",  fe.getStoredName());
        m.put("fileType",    fe.getFileType());
        m.put("fileSize",    formatSize(fe.getFileSize()));
        m.put("storageBytes", fe.getFileSize() != null ? fe.getFileSize() : 0L);
        m.put("uploadedAt",  fe.getUploadedAt());
        m.put("folderName",  fe.getFolder() != null ? fe.getFolder().getFolderName() : null);
        m.put("folderId",    fe.getFolder() != null ? fe.getFolder().getFolderId()   : null);
        m.put("category",    determineCategory(fe.getFileType(), fe.getFileName()));
        m.put("isImage",     fe.getFileType() != null
                && fe.getFileType().startsWith("image/"));
        m.put("genre",       fe.getGenre());
        m.put("genreSub",    fe.getGenreSub());
        m.put("ragIndexed",  Boolean.TRUE.equals(fe.getRagIndexed()));
        return m;
    }

    // ═══════════════════════════════════════════════════
    //  HELPERS — ACTIVITY LOG
    // ═══════════════════════════════════════════════════
    private void logActivity(User user, FileEntity fe, String action) {
        try {
            ActivityLog log = new ActivityLog();
            log.setUser(user);
            log.setFile(fe);
            log.setAction(action);
            activityLogRepository.save(log);
        } catch (Exception ignored) {}
    }

    // ═══════════════════════════════════════════════════
    //  HELPERS — FORMAT
    // ═══════════════════════════════════════════════════
    private String formatSize(Long bytes) {
        if (bytes == null || bytes == 0) return "0 B";
        if (bytes < 1_024)       return bytes + " B";
        if (bytes < 1_048_576)   return String.format("%.1f KB", bytes / 1_024.0);
        if (bytes < 1_073_741_824) return String.format("%.1f MB", bytes / 1_048_576.0);
        return String.format("%.2f GB", bytes / 1_073_741_824.0);
    }
}