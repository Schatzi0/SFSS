package com.securefile.sfss.repository;

import com.securefile.sfss.model.FileEntity;
import com.securefile.sfss.model.Folder;
import com.securefile.sfss.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface FileRepository extends JpaRepository<FileEntity, Integer> {
    List<FileEntity> findByUserOrderByUploadedAtDesc(User user);
    List<FileEntity> findByFolderAndUserOrderByUploadedAtDesc(Folder folder, User user);
    List<FileEntity> findByFolderIsNullAndUserOrderByUploadedAtDesc(User user);
    Optional<FileEntity> findByFileIdAndUser(Integer fileId, User user);
    List<FileEntity> findByUserAndFileNameContainingIgnoreCase(User user, String keyword);
    long countByFolder(Folder folder);
    // New — extension filter
    List<FileEntity> findByUserAndFileNameEndingWithIgnoreCaseOrderByUploadedAtDesc(
            User user, String suffix);
    // New — recent files
    List<FileEntity> findTop6ByUserOrderByUploadedAtDesc(User user);
}