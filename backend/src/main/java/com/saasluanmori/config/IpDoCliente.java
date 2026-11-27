package com.saasluanmori.config;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.List;

/**
 * O IP de quem pediu, para os limites de tentativa de login. Com {@code SALTOS_DE_PROXY} = n, os n endereços mais
 * próximos (o nginx, o balanceador) são proxies confiáveis e o cliente é o seguinte, contado a partir do endereço da
 * conexão e do fim do {@code X-Forwarded-For} para o começo (como o {@code trust proxy} do Express no servidor antigo,
 * {@code legacy/api/src/config/ambiente.ts:27-28,67}).
 */
public final class IpDoCliente {

    private IpDoCliente() {
    }

    public static String de(HttpServletRequest req, int saltosDeProxy) {
        List<String> enderecos = new ArrayList<>();
        enderecos.add(req.getRemoteAddr());
        String encaminhado = req.getHeader("X-Forwarded-For");
        if (encaminhado != null) {
            String[] partes = encaminhado.split(",");
            for (int i = partes.length - 1; i >= 0; i--) {
                String e = partes[i].trim();
                if (!e.isEmpty()) {
                    enderecos.add(e);
                }
            }
        }
        String ip = enderecos.get(Math.min(saltosDeProxy, enderecos.size() - 1));
        return ip == null || ip.isEmpty() ? "desconhecido" : ip;
    }
}
