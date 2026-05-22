//package com.securefile.sfss.repository;
//
//import com.securefile.sfss.model.FileEntity;
//import com.securefile.sfss.model.Folder;
//import com.securefile.sfss.model.User;
//import org.springframework.data.jpa.repository.JpaRepository;
//import java.util.List;
//import java.util.Optional;
//
//public interface FileRepository extends JpaRepository<FileEntity, Integer> {
//    List<FileEntity> findByUserOrderByUploadedAtDesc(User user);
//    List<FileEntity> findByFolderAndUserOrderByUploadedAtDesc(Folder folder, User user);
//    List<FileEntity> findByFolderIsNullAndUserOrderByUploadedAtDesc(User user);
//    Optional<FileEntity> findByFileIdAndUser(Integer fileId, User user);
//    List<FileEntity> findByUserAndFileNameContainingIgnoreCase(User user, String keyword);
//    long countByFolder(Folder folder);
//    // New — extension filter
//    List<FileEntity> findByUserAndFileNameEndingWithIgnoreCaseOrderByUploadedAtDesc(
//            User user, String suffix);
//    // New — recent files
//    List<FileEntity> findTop6ByUserOrderByUploadedAtDesc(User user);
//}


package com.securefile.sfss.repository;

import com.securefile.sfss.model.FileEntity;
import com.securefile.sfss.model.Folder;
import com.securefile.sfss.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface FileRepository extends JpaRepository<FileEntity, Integer> {

    @Query("SELECT f FROM FileEntity f LEFT JOIN FETCH f.folder WHERE f.user = :user ORDER BY f.uploadedAt DESC")
    List<FileEntity> findByUserOrderByUploadedAtDesc(@Param("user") User user);

    @Query("SELECT f FROM FileEntity f LEFT JOIN FETCH f.folder WHERE f.folder = :folder AND f.user = :user ORDER BY f.uploadedAt DESC")
    List<FileEntity> findByFolderAndUserOrderByUploadedAtDesc(@Param("folder") Folder folder, @Param("user") User user);

    @Query("SELECT f FROM FileEntity f WHERE f.folder IS NULL AND f.user = :user ORDER BY f.uploadedAt DESC")
    List<FileEntity> findByFolderIsNullAndUserOrderByUploadedAtDesc(@Param("user") User user);

    @Query("SELECT f FROM FileEntity f LEFT JOIN FETCH f.folder WHERE f.fileId = :fileId AND f.user = :user")
    Optional<FileEntity> findByFileIdAndUser(@Param("fileId") Integer fileId, @Param("user") User user);

    @Query("SELECT f FROM FileEntity f LEFT JOIN FETCH f.folder WHERE f.user = :user AND LOWER(f.fileName) LIKE LOWER(CONCAT('%', :keyword, '%'))")
    List<FileEntity> findByUserAndFileNameContainingIgnoreCase(@Param("user") User user, @Param("keyword") String keyword);

    long countByFolder(Folder folder);

    @Query("SELECT f FROM FileEntity f LEFT JOIN FETCH f.folder WHERE f.user = :user ORDER BY f.uploadedAt DESC")
    List<FileEntity> findTop6ByUserOrderByUploadedAtDesc(@Param("user") User user);

    @Query("SELECT f FROM FileEntity f LEFT JOIN FETCH f.folder WHERE f.user = :user AND LOWER(f.fileName) LIKE LOWER(CONCAT('%', :suffix)) ORDER BY f.uploadedAt DESC")
    List<FileEntity> findByUserAndFileNameEndingWithIgnoreCaseOrderByUploadedAtDesc(@Param("user") User user, @Param("suffix") String suffix);
}