package com.securefile.sfss.repository;

import com.securefile.sfss.model.Folder;
import com.securefile.sfss.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface FolderRepository extends JpaRepository<Folder, Integer> {
    List<Folder> findByUserOrderByCreatedAtDesc(User user);
    Optional<Folder> findByFolderIdAndUser(Integer folderId, User user);
    Optional<Folder> findByFolderNameAndUser(String folderName, User user);
    boolean existsByFolderNameAndUser(String name, User user);
}