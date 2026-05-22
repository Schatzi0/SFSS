package com.securefile.sfss.service;

import com.securefile.sfss.model.*;
import com.securefile.sfss.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class SharingService {

    @Autowired private SharedFileRepository sharedFileRepo;
    @Autowired private FileRepository fileRepo;
    @Autowired private UserRepository userRepo;

    // Share file with email
    public Map<String, Object> shareFile(Integer fileId, String email,
                                         String permission, User owner) {
        // Find file owned by user
        Optional<FileEntity> fileOpt = fileRepo.findByFileIdAndUser(fileId, owner);
        if (fileOpt.isEmpty())
            return Map.of("error", "File not found");

        // Find target user
        Optional<User> targetOpt = userRepo.findByEmail(email);
        if (targetOpt.isEmpty())
            return Map.of("error", "No user found with this email");

        User target = targetOpt.get();

        if (target.getUserId().equals(owner.getUserId()))
            return Map.of("error", "Cannot share with yourself");

        FileEntity file = fileOpt.get();

        if (sharedFileRepo.existsByFileAndSharedWith(file, target))
            return Map.of("error", "Already shared with this user");

        SharedFile sf = new SharedFile();
        sf.setFile(file);
        sf.setOwner(owner);
        sf.setSharedWith(target);
        sf.setPermission(permission != null ? permission : "view");
        sharedFileRepo.save(sf);

        return Map.of("success", true, "message",
                "Shared with " + target.getName());
    }

    // Files shared with me
    public List<Map<String, Object>> getSharedWithMe(User user) {
        return sharedFileRepo.findBySharedWithOrderBySharedAtDesc(user)
                .stream().map(sf -> {
                    Map<String, Object> m = new HashMap<>();
                    FileEntity f = sf.getFile();
                    m.put("shareId", sf.getShareId());
                    m.put("fileId", f.getFileId());
                    m.put("fileName", f.getFileName());
                    m.put("fileType", f.getFileType());
                    m.put("fileSize", formatSize(f.getFileSize()));
                    m.put("permission", sf.getPermission());
                    m.put("sharedBy", sf.getOwner().getName());
                    m.put("sharedAt", sf.getSharedAt());
                    m.put("isImage", f.getFileType() != null
                            && f.getFileType().startsWith("image/"));
                    m.put("storedName", f.getStoredName());
                    return m;
                }).collect(Collectors.toList());
    }

    // Who I shared a file with
    public List<Map<String, Object>> getSharedByMe(Integer fileId, User owner) {
        Optional<FileEntity> fileOpt = fileRepo.findByFileIdAndUser(fileId, owner);
        if (fileOpt.isEmpty()) return List.of();
        return sharedFileRepo.findByOwnerAndFile(owner, fileOpt.get())
                .stream().map(sf -> Map.<String, Object>of(
                        "shareId", sf.getShareId(),
                        "sharedWith", sf.getSharedWith().getName(),
                        "email", sf.getSharedWith().getEmail(),
                        "permission", sf.getPermission(),
                        "sharedAt", sf.getSharedAt()
                )).collect(Collectors.toList());
    }

    // Revoke share
    public boolean revokeShare(Integer shareId, User owner) {
        Optional<SharedFile> opt = sharedFileRepo.findByShareIdAndOwner(shareId, owner);
        if (opt.isEmpty()) return false;
        sharedFileRepo.delete(opt.get());
        return true;
    }

    // Verify shared access (for preview/download)
    public Optional<FileEntity> getSharedFile(Integer fileId, User requestingUser) {
        List<SharedFile> shares = sharedFileRepo
                .findBySharedWithOrderBySharedAtDesc(requestingUser);
        return shares.stream()
                .filter(s -> s.getFile().getFileId().equals(fileId))
                .map(SharedFile::getFile)
                .findFirst();
    }

    private String formatSize(Long bytes) {
        if (bytes == null || bytes == 0) return "0 B";
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1048576) return String.format("%.1f KB", bytes / 1024.0);
        return String.format("%.1f MB", bytes / 1048576.0);
    }
}