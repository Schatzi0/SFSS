package com.securefile.sfss.repository;

import com.securefile.sfss.model.ActivityLog;
import com.securefile.sfss.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ActivityLogRepository extends JpaRepository<ActivityLog, Integer> {
    List<ActivityLog> findByUserOrderByTimestampDesc(User user);
}