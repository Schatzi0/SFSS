package com.securefile.sfss.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Entity
@Table(name = "folders")
@Data
public class Folder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer folderId;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 100)
    private String folderName;

    @Column(name = "is_protected")
    private Boolean isProtected = false;

    @Column(name = "protection_pin")
    private String protectionPin;


    @Column(name = "parent_folder_id")
    private Integer parentFolderId;

    private LocalDateTime createdAt = LocalDateTime.now();
}