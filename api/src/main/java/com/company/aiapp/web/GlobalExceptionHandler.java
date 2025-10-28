package com.company.aiapp.web;

import com.company.aiapp.exception.UserAlreadyExistsException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(UserAlreadyExistsException.class)
  @ResponseStatus(HttpStatus.CONFLICT)
  public ApiError handleUserAlreadyExists(UserAlreadyExistsException ex) {
    return new ApiError("EMAIL_TAKEN", ex.getMessage());
  }

  // Fallback if the DB unique constraint triggers instead of our service check
  @ExceptionHandler(DataIntegrityViolationException.class)
  @ResponseStatus(HttpStatus.CONFLICT)
  public ApiError handleConstraint(DataIntegrityViolationException ex) {
    return new ApiError("EMAIL_TAKEN", "Email is already registered.");
  }
}