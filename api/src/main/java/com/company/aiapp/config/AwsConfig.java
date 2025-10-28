package com.company.aiapp.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

@Configuration
public class AwsConfig {

	@Bean
	public S3Client s3Client(@Value("${aws.region}") String region) {
		return S3Client.builder().credentialsProvider(DefaultCredentialsProvider.create()).region(Region.of(region))
				.build();
	}
}