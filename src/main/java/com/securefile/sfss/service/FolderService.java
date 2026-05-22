package com.securefile.sfss.service;

import com.securefile.sfss.model.Folder;
import com.securefile.sfss.model.User;
import com.securefile.sfss.repository.FileRepository;
import com.securefile.sfss.repository.FolderRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import java.util.*;

@Service
public class FolderService {

    @Autowired private FolderRepository folderRepository;
    @Autowired private FileRepository fileRepository;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public Map<String, Object> createFolder(String name, User user) {
        if (folderRepository.existsByFolderNameAndUser(name, user))
            return Map.of("error", "Folder already exists");
        Folder folder = new Folder();
        folder.setFolderName(name);
        folder.setUser(user);
        folderRepository.save(folder);
        return Map.of("success", true, "folderName", name);
    }

    public List<Map<String, Object>> getUserFolders(User user) {
        List<Folder> folders = folderRepository.findByUserOrderByCreatedAtDesc(user);
        List<Map<String, Object>> result = new ArrayList<>();
        for (Folder f : folders) {
            long count = fileRepository.countByFolder(f);
            Map<String, Object> map = new HashMap<>();
            map.put("folderId", f.getFolderId());
            map.put("folderName", f.getFolderName());
            map.put("fileCount", count);
            map.put("isProtected", Boolean.TRUE.equals(f.getIsProtected()));
            map.put("createdAt", f.getCreatedAt());
            result.add(map);
        }
        return result;
    }

    public boolean deleteFolder(Integer folderId, User user) {
        Optional<Folder> opt = folderRepository.findByFolderIdAndUser(folderId, user);
        if (opt.isEmpty()) return false;
        folderRepository.delete(opt.get());
        return true;
    }

    public Optional<Folder> getFolder(Integer folderId, User user) {
        return folderRepository.findByFolderIdAndUser(folderId, user);
    }

    // Set or remove PIN protection
    public Map<String, Object> setProtection(Integer folderId, String pin,
                                             boolean enable, User user) {
        Optional<Folder> opt = folderRepository.findByFolderIdAndUser(folderId, user);
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
        folderRepository.save(folder);
        return Map.of("success", true,
                "message", enable ? "Folder protected" : "Protection removed");
    }

    // Verify PIN
    public boolean verifyPin(Integer folderId, String pin, User user) {
        Optional<Folder> opt = folderRepository.findByFolderIdAndUser(folderId, user);
        if (opt.isEmpty()) return false;
        Folder folder = opt.get();
        if (!Boolean.TRUE.equals(folder.getIsProtected())) return true;
        if (folder.getProtectionPin() == null) return false;
        return encoder.matches(pin, folder.getProtectionPin());
    }
}