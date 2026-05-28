package com.securefile.sfss.repository;

import com.securefile.sfss.model.FileChunk;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface FileChunkRepository extends JpaRepository<FileChunk, Integer> {

    @Modifying
    @Transactional
    @Query("DELETE FROM FileChunk c WHERE c.file.fileId = :fileId")
    void deleteByFileId(@Param("fileId") Integer fileId);

    long countByUserId(Integer userId);
}