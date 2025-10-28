package com.company.aiapp.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public class AuthDtos {
	public record RegisterReq(@Email @NotBlank String email, @NotBlank String password, String displayName) {
	}

	public record LoginReq(@Email @NotBlank String email, @NotBlank String password) {
	}

	public record LoginResp(String token, String email, String displayName) {
	}
	
	public record MeResp(String email, String displayName) {		
	}
}
