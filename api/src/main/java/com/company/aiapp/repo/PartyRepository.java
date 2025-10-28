package com.company.aiapp.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

import com.company.aiapp.domain.PartyEntity;
public interface PartyRepository extends JpaRepository<PartyEntity, UUID> { }