package com.securefile.sfss.repository;

import com.securefile.sfss.model.FileEntity;
import com.securefile.sfss.model.SharedFile;
import com.securefile.sfss.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface SharedFileRepository extends JpaRepository<SharedFile, Integer> {

    @Query("SELECT s FROM SharedFile s JOIN FETCH s.file f LEFT JOIN FETCH f.folder WHERE s.sharedWith = :user ORDER BY s.sharedAt DESC")
    List<SharedFile> findBySharedWithOrderBySharedAtDesc(@Param("user") User user);

    @Query("SELECT s FROM SharedFile s JOIN FETCH s.sharedWith WHERE s.owner = :owner AND s.file = :file")
    List<SharedFile> findByOwnerAndFile(@Param("owner") User owner, @Param("file") FileEntity file);

    Optional<SharedFile> findByShareIdAndOwner(Integer shareId, User owner);

    Optional<SharedFile> findByFileAndSharedWith(FileEntity file, User sharedWith);

    boolean existsByFileAndSharedWith(FileEntity file, User sharedWith);
}