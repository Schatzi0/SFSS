package com.securefile.sfss.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Entity
@Table(name = "activity_log")
@Data
public class ActivityLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer logId;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne
    @JoinColumn(name = "file_id")
    private FileEntity file;

    @Column(nullable = false, length = 50)
    private String action;

    private LocalDateTime timestamp = LocalDateTime.now();
}