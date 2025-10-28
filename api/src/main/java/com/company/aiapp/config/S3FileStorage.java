package com.company.aiapp.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

import com.company.aiapp.config.storage.FileStorage;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

/**
 * Stores files in S3 using the layout:
 *   s3://{bucket}/{user}/{documentType}/{fileName}
 *
 * Examples:
 *   s3://juricrew/dark.matos@gmail.com/pleading/1730000000000_pleading.docx
 *
 * Return value of save* is a "virtual" absolute path:
 *   /s3/{bucket}/{user}/{documentType}/{fileName}
 *
 * The same path can be passed back to loadBytes()/exists() and will be resolved correctly.
 * Backwards compatibility: paths starting with "users/" still work.
 */
public class S3FileStorage implements FileStorage {
    private final S3Client s3;
    private final String bucket;

    public S3FileStorage(S3Client s3, String bucket) {
        this.s3 = s3;
        this.bucket = bucket;
    }

    @Override
    public Path saveJson(Path relativePath, String json) throws IOException {
        return saveBytes(relativePath, json.getBytes(StandardCharsets.UTF_8));
    }

    @Override
    public Path saveBytes(Path relativePath, byte[] bytes) throws IOException {
        String key = toKey(relativePath);
        ensureFolders(key); // create marker prefixes for user/ and user/documentType/
        PutObjectRequest put = PutObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .contentType(detectContentType(key))
                .build();
        s3.putObject(put, RequestBody.fromBytes(bytes));
        return resolve(relativePath);
    }

    @Override
    public Path resolve(Path relativePath) {
        String key = toKey(relativePath); // normalize to "<user>/<docType>/<file>"
        return Path.of("/s3", bucket, key);
    }

    @Override
    public byte[] loadBytes(Path relativePath) throws IOException {
        String key = toKey(relativePath);
        try {
            return s3.getObjectAsBytes(GetObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .build()).asByteArray();
        } catch (S3Exception e) {
            throw new IOException("Failed to load s3://" + bucket + "/" + key, e);
        }
    }

    @Override
    public boolean exists(Path relativePath) {
        String key = toKey(relativePath);
        try {
            s3.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());
            return true;
        } catch (S3Exception e) {
            return false;
        }
    }

    /* ---------------------- helpers ---------------------- */

    private String toKey(Path p) {
        String rel = normalize(p.toString());

        // Accept "/s3/<bucket>/..." from resolve()
        if (rel.startsWith("/s3/")) {
            String expectedPrefix = "/s3/" + bucket + "/";
            if (rel.startsWith(expectedPrefix)) {
                rel = rel.substring(expectedPrefix.length());
            } else {
                // Fallback: strip just "/s3/" if bucket doesn't match for some reason
                rel = rel.substring("/s3/".length());
                // If the first segment is a bucket name, drop it
                int slash = rel.indexOf('/');
                if (slash > 0) {
                    String maybeBucket = rel.substring(0, slash);
                    if (maybeBucket.equals(bucket)) {
                        rel = rel.substring(slash + 1);
                    }
                }
            }
        }

        // Accept legacy "users/<user>/..." paths
        if (rel.startsWith("users/")) {
            rel = rel.substring("users/".length());
        }

        // At this point we expect "<user>/<docType>/<file>"
        return rel;
    }

    private String normalize(String p) {
        return p.replace('\\', '/');
    }

    /**
     * Create zero-byte "folder" markers for:
     *   <user>/
     *   <user>/<documentType>/
     * Not required by S3, but helpful for some UIs.
     */
    private void ensureFolders(String key) {
        String[] parts = key.split("/");
        if (parts.length < 1) return;

        // user/
        String userPrefix = parts[0] + "/";
        putIfMissing(userPrefix, "application/x-directory");

        // user/documentType/
        if (parts.length >= 2) {
            String docTypePrefix = parts[0] + "/" + parts[1] + "/";
            putIfMissing(docTypePrefix, "application/x-directory");
        }
    }

    private void putIfMissing(String prefixKey, String contentType) {
        try {
            s3.headObject(HeadObjectRequest.builder().bucket(bucket).key(prefixKey).build());
        } catch (S3Exception e) {
            try {
                s3.putObject(
                    PutObjectRequest.builder()
                        .bucket(bucket)
                        .key(prefixKey)
                        .contentType(contentType)
                        .build(),
                    RequestBody.fromBytes(new byte[0])
                );
            } catch (S3Exception ignore) {
                // ignore marker creation failures
            }
        }
    }

    private String detectContentType(String key) {
        if (key.endsWith(".docx"))
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (key.endsWith(".json"))
            return "application/json";
        return "application/octet-stream";
    }
}