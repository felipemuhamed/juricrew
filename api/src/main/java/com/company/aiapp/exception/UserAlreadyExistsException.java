package com.company.aiapp.exception;

public class UserAlreadyExistsException extends RuntimeException {
  public UserAlreadyExistsException(String email) {
    super("Email is already registered: " + email);
  }
}