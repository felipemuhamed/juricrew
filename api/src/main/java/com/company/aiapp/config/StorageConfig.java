package com.company.aiapp.config;

import com.company.aiapp.config.storage.FileStorage;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.services.s3.S3Client;

/**
 * Provides a FileStorage bean. If app.storage.provider=s3, we bind
 * S3FileStorage, otherwise we keep your existing local implementation (not
 * shown here).
 */
@Configuration
public class StorageConfig {

	@Bean
	@ConditionalOnProperty(name = "app.storage.provider", havingValue = "s3")
	public FileStorage s3Storage(S3Client s3, @Value("${app.storage.s3.bucket}") String bucket) {
		return new S3FileStorage(s3, bucket);
	}

	// If you also want to keep a local fallback:
	// @Bean
	// @ConditionalOnMissingBean(FileStorage.class)
	// public FileStorage localStorage(@Value("${app.storage.rootDir:./data}")
	// String rootDir) {
	// return new LocalFileStorage(rootDir);
	// }
}