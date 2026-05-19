package com.securefile.sfss.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;

@Service
public class StorageService {

    @Value("${supabase.storage.url}")
    private String storageUrl;

//    @Value("${supabase.storage.key}")
//    private String storageKey;

    @Value("${supabase.storage.access-key}")
    private String accessKey;

    @Value("${supabase.storage.secret-key}")
    private String secretKey;

    @Value("${supabase.storage.bucket}")
    private String bucket;

    @Value("${supabase.storage.region:ap-south-1}")
    private String region;

//    private S3Client getClient() {
//        // Supabase Storage is S3-compatible
//        return S3Client.builder()
//                .endpointOverride(URI.create(storageUrl))
//                .credentialsProvider(StaticCredentialsProvider.create(
//                        AwsBasicCredentials.create("anystring", storageKey)))
//                .region(Region.of(region))
//                .forcePathStyle(true)
//                .build();
//    }
//
//    // Upload file to Supabase Storage
//    public String uploadFile(String storedName, MultipartFile file) throws IOException {
//        S3Client s3 = getClient();
//        s3.putObject(
//                PutObjectRequest.builder()
//                        .bucket(bucket)
//                        .key(storedName)
//                        .contentType(file.getContentType())
//                        .build(),
//                RequestBody.fromInputStream(file.getInputStream(), file.getSize())
//        );
//        return storageUrl + "/object/public/" + bucket + "/" + storedName;
//    }

    private S3Client getClient() {
        return S3Client.builder()
                .endpointOverride(URI.create(storageUrl + "/s3")) // ✅ FIXED
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(accessKey, secretKey))) //                .region(Region.of(region))


                .forcePathStyle(true)
                .build();
    }

    public String uploadFile(String storedName, MultipartFile file) throws IOException {
        S3Client s3 = getClient();

        try {
            s3.putObject(
                    PutObjectRequest.builder()
                            .bucket(bucket)
                            .key(storedName)
                            .contentType(file.getContentType())
                            .build(),
                    RequestBody.fromInputStream(file.getInputStream(), file.getSize())
            );
        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException("Upload failed: " + e.getMessage());
        }

        return storageUrl + "/object/public/" + bucket + "/" + storedName;
    }

    // Download file stream
    public InputStream downloadFile(String storedName) {
        S3Client s3 = getClient();
        return s3.getObject(GetObjectRequest.builder()
                .bucket(bucket)
                .key(storedName)
                .build());
    }

    // Delete file
    public void deleteFile(String storedName) {
        try {
            S3Client s3 = getClient();
            s3.deleteObject(DeleteObjectRequest.builder()
                    .bucket(bucket)
                    .key(storedName)
                    .build());
        } catch (Exception ignored) {}
    }
}