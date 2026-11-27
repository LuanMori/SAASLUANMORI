package com.saasluanmori.domain;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Grava o papel com o valor do tipo {@code papel} do banco ("dono", "super_admin"...). */
@Converter
public class PapelNoBanco implements AttributeConverter<Papel, String> {

    @Override
    public String convertToDatabaseColumn(Papel papel) {
        return papel == null ? null : papel.valor();
    }

    @Override
    public Papel convertToEntityAttribute(String valor) {
        return valor == null ? null : Papel.deValor(valor).orElseThrow(() -> new IllegalStateException("Papel desconhecido no banco."));
    }
}
