package com.securefile.sfss;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class SfssApplication {
    public static void main(String[] args) {
        SpringApplication.run(SfssApplication.class, args);
    }
}