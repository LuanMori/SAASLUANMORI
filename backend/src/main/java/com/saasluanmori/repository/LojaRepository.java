package com.saasluanmori.repository;

import com.saasluanmori.domain.Loja;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** O cadastro de lojas (sem RLS; a aplicação só lê). */
public interface LojaRepository extends JpaRepository<Loja, UUID> {

    Optional<Loja> findBySubdominio(String subdominio);
}
