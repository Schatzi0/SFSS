package com.securefile.sfss.service;

import com.securefile.sfss.model.Folder;
import com.securefile.sfss.model.User;
import com.securefile.sfss.repository.FileRepository;
import com.securefile.sfss.repository.FolderRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class FolderService {

    @Autowired private FolderRepository folderRepo;
    @Autowired private FileRepository fileRepo;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(8);

    // Create folder (with optional parent)
    public Map<String, Object> createFolder(String name, User user, Integer parentId) {
        boolean exists = (parentId == null)
                ? folderRepo.existsByFolderNameAndUserAndParentFolderId(name, user, null)
                : folderRepo.existsByFolderNameAndUserAndParentFolderId(name, user, parentId);

        if (exists) return Map.of("error", "Folder already exists here");

        // Validate parent belongs to user
        if (parentId != null) {
            var parent = folderRepo.findByFolderIdAndUser(parentId, user);
            if (parent.isEmpty()) return Map.of("error", "Parent folder not found");
        }

        Folder folder = new Folder();
        folder.setFolderName(name);
        folder.setUser(user);
        folder.setParentFolderId(parentId);
        folderRepo.save(folder);
        return Map.of("success", true, "folderId", folder.getFolderId(),
                "folderName", name);
    }

    // Get all folders as nested structure
    public List<Map<String, Object>> getUserFoldersNested(User user) {
        List<Folder> all = folderRepo.findByUserOrderByCreatedAtDesc(user);
        return buildTree(all, null, user);
    }

    // Flat list (for dropdowns etc.)
    public List<Map<String, Object>> getUserFoldersFlat(User user) {
        return folderRepo.findByUserOrderByCreatedAtDesc(user).stream().map(f -> {
            Map<String, Object> m = new HashMap<>();
            m.put("folderId", f.getFolderId());
            m.put("folderName", f.getFolderName());
            m.put("parentFolderId", f.getParentFolderId());
            m.put("fileCount", fileRepo.countByFolder(f));
            m.put("isProtected", Boolean.TRUE.equals(f.getIsProtected()));
            return m;
        }).collect(Collectors.toList());
    }

    private List<Map<String, Object>> buildTree(List<Folder> all,
                                                Integer parentId, User user) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Folder f : all) {
            boolean matches = (parentId == null && f.getParentFolderId() == null)
                    || (parentId != null && parentId.equals(f.getParentFolderId()));
            if (!matches) continue;

            Map<String, Object> m = new HashMap<>();
            m.put("folderId", f.getFolderId());
            m.put("folderName", f.getFolderName());
            m.put("parentFolderId", f.getParentFolderId());
            m.put("fileCount", fileRepo.countByFolder(f));
            m.put("isProtected", Boolean.TRUE.equals(f.getIsProtected()));
            m.put("subFolders", buildTree(all, f.getFolderId(), user));
            result.add(m);
        }
        return result;
    }

    public boolean deleteFolder(Integer folderId, User user) {
        var opt = folderRepo.findByFolderIdAndUser(folderId, user);
        if (opt.isEmpty()) return false;
        folderRepo.delete(opt.get());
        return true;
    }

    public Optional<Folder> getFolder(Integer folderId, User user) {
        return folderRepo.findByFolderIdAndUser(folderId, user);
    }

    public Map<String, Object> setProtection(Integer folderId, String pin,
                                             boolean enable, User user) {
        var opt = folderRepo.findByFolderIdAndUser(folderId, user);
        if (opt.isEmpty()) return Map.of("error", "Folder not found");
        Folder folder = opt.get();
        if (enable) {
            if (pin == null || pin.length() < 4)
                return Map.of("error", "PIN must be at least 4 characters");
            folder.setIsProtected(true);
            folder.setProtectionPin(encoder.encode(pin));
        } else {
            folder.setIsProtected(false);
            folder.setProtectionPin(null);
        }
        folderRepo.save(folder);
        return Map.of("success", true,
                "message", enable ? "Folder protected" : "Protection removed");
    }

    public boolean verifyPin(Integer folderId, String pin, User user) {
        var opt = folderRepo.findByFolderIdAndUser(folderId, user);
        if (opt.isEmpty()) return false;
        Folder f = opt.get();
        if (!Boolean.TRUE.equals(f.getIsProtected())) return true;
        if (f.getProtectionPin() == null) return false;
        return encoder.matches(pin, f.getProtectionPin());
    }
}