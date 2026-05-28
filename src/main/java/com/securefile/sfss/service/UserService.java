package com.securefile.sfss.service;

import com.securefile.sfss.dto.LoginRequest;
import com.securefile.sfss.dto.RegisterRequest;
import com.securefile.sfss.model.User;
import com.securefile.sfss.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import java.util.Optional;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(8);

    public String registerUser(RegisterRequest req) {
        if (userRepository.existsByEmail(req.getEmail())) return "EMAIL_EXISTS";
        User user = new User();
        user.setName(req.getName());
        user.setEmail(req.getEmail());
        user.setPassword(encoder.encode(req.getPassword()));
        userRepository.save(user);
        return "SUCCESS";
    }

    public User loginUser(LoginRequest req) {
        Optional<User> opt = userRepository.findByEmail(req.getEmail());
        if (opt.isEmpty()) return null;
        User user = opt.get();
        if (!encoder.matches(req.getPassword(), user.getPassword())) return null;
        return user;
    }

    public Optional<User> findById(Integer id) {
        return userRepository.findById(id);
    }
}