package com.company.aiapp.config.storage;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Path;
import java.time.Duration;

/**
 * Abstraction over document storage.
 *
 * Notes for multi-backend compatibility (local FS vs S3):
 * - "relativePath" is a logical path (e.g., users/{userId}/.../file.docx).
 * - Returned {@link Path} values from save/resolve are canonical *locations*, but
 *   they MAY NOT correspond to a real OS file path for remote backends.
 *   Use {@link #toUri(Path)} (preferred) when you need a globally unique location.
 * - Load/exists work regardless of backend.
 */
public interface FileStorage {

    /**
     * Save a byte array to a path relative to the storage root. Creates any missing directories.
     * @return a canonical location Path for the stored object (may be virtual for remote backends).
     */
    Path saveBytes(Path relativePath, byte[] bytes) throws IOException;

    /**
     * Save a UTF-8 JSON string to a path relative to the storage root. Creates directories if needed.
     * @return a canonical location Path for the stored object (may be virtual for remote backends).
     */
    Path saveJson(Path relativePath, String jsonUtf8) throws IOException;

    /**
     * Resolve a path relative to the storage root to a canonical location Path.
     * For remote backends this may be a virtual path; prefer {@link #toUri(Path)} to obtain a global URI.
     */
    Path resolve(Path relativePath);

    /**
     * Load file/object bytes from a relative path.
     */
    byte[] loadBytes(Path relativePath) throws IOException;

    /**
     * Returns true if a file/object (or directory/prefix) exists at the given relative path.
     */
    boolean exists(Path relativePath);

    /* ====================== New, cloud-friendly helpers ====================== */

    /**
     * Returns a globally unique URI for the given logical relative path.
     * Examples:
     *  - Local: file:///absolute/path/to/data/users/123/...
     *  - S3:    s3://your-bucket/juricrew/123/...
     */
    default URI toUri(Path relativePath) {
        // Default implementation maps local resolve() to file:// URI.
        Path abs = resolve(relativePath);
        return abs.toUri();
    }

    /**
     * Optionally returns a time-limited, publicly accessible URL for direct download.
     * Remote backends (e.g., S3) should implement this using a pre-signed URL.
     * Local backends may throw UnsupportedOperationException or return null.
     */
    default String presign(Path relativePath, Duration ttl) throws IOException {
        throw new UnsupportedOperationException("Presign not supported by this storage backend");
    }

    /**
     * Deletes the file/object at the given relative path if supported.
     * Local backends should delete from disk; remote backends should delete the object.
     */
    default void delete(Path relativePath) throws IOException {
        throw new UnsupportedOperationException("Delete not supported by this storage backend");
    }
}