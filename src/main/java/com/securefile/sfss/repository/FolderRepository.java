package com.securefile.sfss.repository;

import com.securefile.sfss.model.Folder;
import com.securefile.sfss.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface FolderRepository extends JpaRepository<Folder, Integer> {

    List<Folder> findByUserOrderByCreatedAtDesc(User user);

    // Root folders (no parent)
    List<Folder> findByUserAndParentFolderIdIsNullOrderByCreatedAtDesc(User user);

    // Sub-folders of a parent
    List<Folder> findByUserAndParentFolderIdOrderByCreatedAtDesc(
            User user, Integer parentFolderId);

    Optional<Folder> findByFolderIdAndUser(Integer folderId, User user);

    boolean existsByFolderNameAndUserAndParentFolderId(
            String folderName, User user, Integer parentFolderId);

    boolean existsByFolderNameAndUser(String folderName, User user);
}