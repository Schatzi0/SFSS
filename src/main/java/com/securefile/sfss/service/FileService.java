package com.securefile.sfss.service;

import com.securefile.sfss.model.*;
import com.securefile.sfss.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class FileService {

    @Value("${file.upload-dir}")
    private String uploadDir;

    @Autowired private FileRepository fileRepository;
    @Autowired private FolderRepository folderRepository;
    @Autowired private ActivityLogRepository activityLogRepository;

    // ─── EXTENSION-FIRST MIME DETECTION ──────────────────────
    public String getAutoFolderName(String contentType, String fileName) {
        if (fileName == null) fileName = "";
        String name = fileName.toLowerCase().trim();

        // Extension check FIRST — most reliable
        if (name.endsWith(".pdf")) return "PDFs";

        if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")
                || name.endsWith(".gif") || name.endsWith(".webp") || name.endsWith(".svg")
                || name.endsWith(".bmp") || name.endsWith(".ico") || name.endsWith(".tiff")
                || name.endsWith(".heic") || name.endsWith(".raw"))
            return "Images";

        if (name.endsWith(".docx") || name.endsWith(".doc") || name.endsWith(".odt")
                || name.endsWith(".rtf") || name.endsWith(".pages"))
            return "Documents";

        // Excel — extension check most important (MIME unreliable on Windows)
        if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")
                || name.endsWith(".ods") || name.endsWith(".numbers") || name.endsWith(".tsv"))
            return "Spreadsheets";

        if (name.endsWith(".pptx") || name.endsWith(".ppt") || name.endsWith(".odp")
                || name.endsWith(".key"))
            return "Presentations";

        if (name.endsWith(".txt") || name.endsWith(".log") || name.endsWith(".md")
                || name.endsWith(".rst"))
            return "Text Files";

        if (name.endsWith(".zip") || name.endsWith(".rar") || name.endsWith(".tar")
                || name.endsWith(".gz") || name.endsWith(".7z") || name.endsWith(".bz2")
                || name.endsWith(".xz") || name.endsWith(".tar.gz"))
            return "Archives";

        // Code detection by extension
        String codeResult = getCodeCategory(name);
        if (!codeResult.equals("Others")) return codeResult;

        // MIME fallback (only if extension didn't match)
        if (contentType != null) {
            String type = contentType.toLowerCase();
            if (type.contains("pdf")) return "PDFs";
            if (type.startsWith("image/")) return "Images";
            if (type.contains("word") || type.contains("msword")) return "Documents";
            if (type.contains("excel") || type.contains("spreadsheet")
                    || type.contains("sheet") || type.contains("ms-excel")
                    || type.contains("officedocument.spreadsheet"))
                return "Spreadsheets";
            if (type.contains("presentation") || type.contains("powerpoint")
                    || type.contains("officedocument.presentation"))
                return "Presentations";
            if (type.equals("text/plain")) return "Text Files";
            if (type.contains("zip") || type.contains("rar")
                    || type.contains("x-tar") || type.contains("gzip"))
                return "Archives";
        }

        return "Others";
    }

    private String getCodeCategory(String name) {
        if (name.endsWith(".java") || name.endsWith(".kt") || name.endsWith(".kts")
                || name.endsWith(".gradle") || name.endsWith(".scala"))
            return "Code › Java";
        if (name.endsWith(".py") || name.endsWith(".ipynb") || name.endsWith(".pyw"))
            return "Code › Python";
        if (name.endsWith(".js") || name.endsWith(".ts") || name.endsWith(".jsx")
                || name.endsWith(".tsx") || name.endsWith(".mjs") || name.endsWith(".cjs")
                || name.endsWith(".vue") || name.endsWith(".svelte"))
            return "Code › JavaScript";
        if (name.endsWith(".html") || name.endsWith(".htm") || name.endsWith(".css")
                || name.endsWith(".scss") || name.endsWith(".sass") || name.endsWith(".less"))
            return "Code › Web";
        if (name.endsWith(".json") || name.endsWith(".xml") || name.endsWith(".yaml")
                || name.endsWith(".yml") || name.endsWith(".toml") || name.endsWith(".env")
                || name.endsWith(".ini") || name.endsWith(".cfg") || name.endsWith(".conf")
                || name.endsWith(".properties"))
            return "Code › Config";
        if (name.endsWith(".c") || name.endsWith(".cpp") || name.endsWith(".cc")
                || name.endsWith(".h") || name.endsWith(".hpp") || name.endsWith(".cs")
                || name.endsWith(".go") || name.endsWith(".rs") || name.endsWith(".swift"))
            return "Code › Systems";
        if (name.endsWith(".sh") || name.endsWith(".bash") || name.endsWith(".zsh")
                || name.endsWith(".bat") || name.endsWith(".ps1") || name.endsWith(".cmd")
                || name.endsWith(".fish"))
            return "Code › Scripts";
        if (name.endsWith(".sql") || name.endsWith(".psql") || name.endsWith(".sqlite"))
            return "Code › SQL";
        if (name.endsWith(".r") || name.endsWith(".rb") || name.endsWith(".php")
                || name.endsWith(".lua") || name.endsWith(".dart") || name.endsWith(".ex")
                || name.endsWith(".exs") || name.endsWith(".clj") || name.endsWith(".hs"))
            return "Code › Other Languages";
        return "Others";
    }

    // ─── GET OR CREATE AUTO FOLDER ────────────────────────────
    private Folder getOrCreateAutoFolder(String folderName, User user) {
        return folderRepository.findByFolderNameAndUser(folderName, user)
                .orElseGet(() -> {
                    Folder f = new Folder();
                    f.setFolderName(folderName);
                    f.setUser(user);
                    return folderRepository.save(f);
                });
    }

    // ─── UPLOAD ───────────────────────────────────────────────
//    public Map<String, Object> uploadFile(MultipartFile file,
//                                          Integer folderId, User user) throws IOException {
//        File dir = new File(uploadDir);
//        if (!dir.exists()) dir.mkdirs();
//
//        String originalName = file.getOriginalFilename();
//        String ext = (originalName != null && originalName.contains("."))
//                ? originalName.substring(originalName.lastIndexOf(".")) : "";
//        String storedName = UUID.randomUUID() + ext;
//        Path savePath = Paths.get(uploadDir, storedName);
//        Files.copy(file.getInputStream(), savePath, StandardCopyOption.REPLACE_EXISTING);
//
//        FileEntity fe = new FileEntity();
//        fe.setFileName(originalName);
//        fe.setStoredName(storedName);
//        fe.setFileType(file.getContentType());
//        fe.setFileSize(file.getSize());
//        fe.setStoragePath(savePath.toString());
//        fe.setUser(user);
//
//        if (folderId != null) {
//            folderRepository.findByFolderIdAndUser(folderId, user).ifPresent(fe::setFolder);
//        } else {
//            String autoFolder = getAutoFolderName(file.getContentType(), originalName);
//// Code files physically "Others" mein store hongi — UI subcategories handle karegi
//            String physicalFolder = autoFolder.startsWith("Code") ? "Others" : autoFolder;
//            fe.setFolder(getOrCreateAutoFolder(physicalFolder, user));
//        }
//
//        fileRepository.save(fe);
//        logActivity(user, fe, "UPLOAD");
//
//        return Map.of(
//                "success", true,
//                "fileName", originalName,
//                "fileId", fe.getFileId(),
//                "category", fe.getFolder() != null ? fe.getFolder().getFolderName() : "Root"
//        );
//    }


@Autowired
private StorageService storageService;

    public Map<String, Object> uploadFile(MultipartFile file,
                                          Integer folderId, User user) throws IOException {
        String originalName = file.getOriginalFilename();
        String ext = (originalName != null && originalName.contains("."))
                ? originalName.substring(originalName.lastIndexOf(".")) : "";
        String storedName = UUID.randomUUID() + ext;

        // Cloud storage pe upload karo
        String publicPath = storageService.uploadFile(storedName, file);

        FileEntity fe = new FileEntity();
        fe.setFileName(originalName);
        fe.setStoredName(storedName);
        fe.setFileType(file.getContentType());
        fe.setFileSize(file.getSize());
//        fe.setStoragePath(storedName); // sirf naam store karo, URL nahi
        fe.setStoragePath(publicPath); //
        fe.setUser(user);

        String autoFolder = getAutoFolderName(file.getContentType(), originalName);
        String physicalFolder = autoFolder.startsWith("Code") ? "Others" : autoFolder;
        fe.setFolder(getOrCreateAutoFolder(physicalFolder, user));

        fileRepository.save(fe);
        logActivity(user, fe, "UPLOAD");

        return Map.of("success", true, "fileName", originalName, "fileId", fe.getFileId());
    }

    // ─── CONSOLIDATED STATS (9 main categories) ───────────────
    public Map<String, Object> getConsolidatedStats(User user) {
        List<FileEntity> all = fileRepository.findByUserOrderByUploadedAtDesc(user);

        Map<String, Long> cats = new LinkedHashMap<>();
        cats.put("PDFs", 0L);
        cats.put("Images", 0L);
        cats.put("Documents", 0L);
        cats.put("Spreadsheets", 0L);
        cats.put("Presentations", 0L);
        cats.put("Text Files", 0L);
        cats.put("Code", 0L);
        cats.put("Archives", 0L);
        cats.put("Others", 0L);

        long totalBytes = 0;
        for (FileEntity f : all) {
            totalBytes += f.getFileSize() != null ? f.getFileSize() : 0;
            String raw = getAutoFolderName(f.getFileType(), f.getFileName());

            if (raw.startsWith("Code")) {
                cats.merge("Code", 1L, Long::sum);
            } else if (cats.containsKey(raw)) {
                cats.merge(raw, 1L, Long::sum);
            } else {
                cats.merge("Others", 1L, Long::sum);
            }
        }

        List<Map<String, Object>> recent = fileRepository
                .findTop6ByUserOrderByUploadedAtDesc(user)
                .stream().map(this::toSingleMap).collect(Collectors.toList());

        return new HashMap<>(Map.of(
                "total", (long) all.size(),
                "storageUsed", formatSize(totalBytes),
                "storageBytes", totalBytes,
                "categories", cats,
                "recentFiles", recent
        ));
    }

    // ─── CODE SUB-CATEGORIES ──────────────────────────────────
    public Map<String, Long> getCodeSubcats(User user) {
        List<FileEntity> all = fileRepository.findByUserOrderByUploadedAtDesc(user);
        Map<String, Long> result = new LinkedHashMap<>();
        String[] codeCats = {
                "Code › Java", "Code › Python", "Code › JavaScript",
                "Code › Web", "Code › Config", "Code › Systems",
                "Code › Scripts", "Code › SQL", "Code › Other Languages"
        };
        for (String c : codeCats) result.put(c, 0L);
        for (FileEntity f : all) {
            String cat = getAutoFolderName(f.getFileType(), f.getFileName());
            if (result.containsKey(cat)) result.merge(cat, 1L, Long::sum);
        }
        return result;
    }

    // ─── OTHERS SUB-CATEGORIES (by extension) ─────────────────
    public Map<String, Long> getOthersSubcats(User user) {
        List<FileEntity> all = fileRepository.findByUserOrderByUploadedAtDesc(user);
        Map<String, Long> result = new TreeMap<>();
        Set<String> mainCats = Set.of("PDFs", "Images", "Documents", "Spreadsheets",
                "Presentations", "Text Files", "Archives");

        for (FileEntity f : all) {
            String cat = getAutoFolderName(f.getFileType(), f.getFileName());
            if (!mainCats.contains(cat) && !cat.startsWith("Code")) {
                String ext = getExtension(f.getFileName());
                result.merge(ext, 1L, Long::sum);
            }
        }
        return result;
    }

    // ─── FILES BY CATEGORY ────────────────────────────────────
    public List<Map<String, Object>> getFilesByCategory(String category, User user) {
        return toMapList(fileRepository.findByUserOrderByUploadedAtDesc(user).stream()
                .filter(f -> {
                    String cat = getAutoFolderName(f.getFileType(), f.getFileName());
                    if (category.equals("Code")) return cat.startsWith("Code");
                    if (category.equals("Others")) {
                        Set<String> main = Set.of("PDFs","Images","Documents","Spreadsheets",
                                "Presentations","Text Files","Archives");
                        return !main.contains(cat) && !cat.startsWith("Code");
                    }
                    return cat.equals(category);
                }).collect(Collectors.toList()));
    }

    // ─── FILES BY EXTENSION (for Others sub-view) ─────────────
    public List<Map<String, Object>> getFilesByExtension(String ext, User user) {
        String suffix = ext.startsWith(".") ? ext : "." + ext;
        return toMapList(fileRepository
                .findByUserAndFileNameEndingWithIgnoreCaseOrderByUploadedAtDesc(user, suffix));
    }

    // ─── LIST / SEARCH ────────────────────────────────────────
    public List<Map<String, Object>> getFilesInFolder(Integer folderId, User user) {
        List<FileEntity> files;
        if (folderId == null) {
            files = fileRepository.findByFolderIsNullAndUserOrderByUploadedAtDesc(user);
        } else {
            Optional<Folder> folder = folderRepository.findByFolderIdAndUser(folderId, user);
            if (folder.isEmpty()) return List.of();
            files = fileRepository.findByFolderAndUserOrderByUploadedAtDesc(folder.get(), user);
        }
        return toMapList(files);
    }

    public List<Map<String, Object>> getAllFiles(User user) {
        return toMapList(fileRepository.findByUserOrderByUploadedAtDesc(user));
    }

    public List<Map<String, Object>> searchFiles(String keyword, User user) {
        return toMapList(
                fileRepository.findByUserAndFileNameContainingIgnoreCase(user, keyword));
    }

    public Optional<FileEntity> getFile(Integer fileId, User user) {
        return fileRepository.findByFileIdAndUser(fileId, user);
    }

    // ─── DELETE ───────────────────────────────────────────────
    public boolean deleteFile(Integer fileId, User user) {
        Optional<FileEntity> opt = fileRepository.findByFileIdAndUser(fileId, user);
        if (opt.isEmpty()) return false;
        FileEntity fe = opt.get();
        try { Files.deleteIfExists(Paths.get(fe.getStoragePath())); }
        catch (IOException ignored) {}
        logActivity(user, fe, "DELETE");
        fileRepository.delete(fe);
        return true;
    }

    // ─── HELPERS ──────────────────────────────────────────────
    private List<Map<String, Object>> toMapList(List<FileEntity> files) {
        return files.stream().map(this::toSingleMap).collect(Collectors.toList());
    }

    private Map<String, Object> toSingleMap(FileEntity f) {
        Map<String, Object> map = new HashMap<>();
        map.put("fileId", f.getFileId());
        map.put("fileName", f.getFileName());
        map.put("fileType", f.getFileType());
        map.put("fileSize", formatSize(f.getFileSize()));
        map.put("uploadedAt", f.getUploadedAt());
        map.put("folderId", f.getFolder() != null ? f.getFolder().getFolderId() : null);
        map.put("folderName", f.getFolder() != null ? f.getFolder().getFolderName() : "Root");
        map.put("isImage", f.getFileType() != null && f.getFileType().startsWith("image/"));
        map.put("category", getAutoFolderName(f.getFileType(), f.getFileName()));
        return map;
    }

    private String getExtension(String fileName) {
        if (fileName == null || !fileName.contains(".")) return ".unknown";
        return fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
    }

    public String formatSize(Long bytes) {
        if (bytes == null || bytes == 0) return "0 B";
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1048576) return String.format("%.1f KB", bytes / 1024.0);
        if (bytes < 1073741824) return String.format("%.1f MB", bytes / 1048576.0);
        return String.format("%.2f GB", bytes / 1073741824.0);
    }

    private void logActivity(User user, FileEntity file, String action) {
        ActivityLog log = new ActivityLog();
        log.setUser(user); log.setFile(file); log.setAction(action);
        activityLogRepository.save(log);
    }
}