package com.saasluanmori.comando;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.saasluanmori.teste.BancoDeTeste;
import com.saasluanmori.teste.TesteComBanco;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Os comandos de administração com as mensagens dos scripts antigos ({@code legacy/api/scripts}). */
class ComandosTest extends TesteComBanco {

    private static final SecureRandom SORTEIO = new SecureRandom();

    private record Saida(int codigo, String saida, String erro) {
    }

    private static Saida rodar(Map<String, String> extra, String... args) {
        Map<String, String> env = new HashMap<>(Map.of(
                "SAAS_DB_URL", BancoDeTeste.url(),
                "SAAS_DB_DONO_USUARIO", BancoDeTeste.DONO,
                "SAAS_DB_DONO_SENHA", BancoDeTeste.DONO_SENHA,
                "SAAS_SENHA_LOG_N", "10"));
        env.putAll(extra);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ByteArrayOutputStream err = new ByteArrayOutputStream();
        int codigo = new Comandos(env::get, new PrintStream(out, true, StandardCharsets.UTF_8), new PrintStream(err, true, StandardCharsets.UTF_8)).rodar(args);
        return new Saida(codigo, out.toString(StandardCharsets.UTF_8), err.toString(StandardCharsets.UTF_8));
    }

    @Test
    void lerAsLojasDoSeed() {
        assertThat(Comandos.lerSeedLojas("Loja A=lojaa; Pet Shop da Ana = PetShopDaAna ;"))
                .containsExactly(new String[] {"Loja A", "lojaa"}, new String[] {"Pet Shop da Ana", "petshopdaana"});
        assertThatThrownBy(() -> Comandos.lerSeedLojas("Loja A"))
                .hasMessage("Entrada inválida em SEED_LOJAS: \"Loja A\" (esperado \"Nome=endereco\", endereço com letras minúsculas, números e hífen)");
        assertThatThrownBy(() -> Comandos.lerSeedLojas("Loja=admin")).hasMessageStartingWith("Entrada inválida em SEED_LOJAS");
    }

    @Test
    void cadastrarLojaDonoESuporte() {
        String sub = "c" + Long.toString(Math.abs(SORTEIO.nextLong() % 1_000_000_000L), 36);
        Saida seed = rodar(Map.of("SEED_LOJAS", "Loja do Teste=" + sub), "db:seed");
        assertThat(seed.codigo()).isZero();
        assertThat(seed.saida()).isEqualTo("Loja pronta: Loja do Teste (" + sub + ")" + System.lineSeparator());

        Saida dono = rodar(Map.of(), "db:usuario", "--loja", sub, "--usuario", "maria", "--nome", "Maria Souza", "--papel", "dono");
        assertThat(dono.codigo()).isZero();
        List<String> linhas = dono.saida().lines().toList();
        assertThat(linhas.get(0)).isEqualTo("maria cadastrado na loja Loja do Teste como dono.");
        assertThat(linhas.get(1)).matches("^Senha provisória: [a-hj-km-np-z2-9]{12}$");
        assertThat(linhas.get(2)).isEqualTo("Entregue à pessoa. No primeiro acesso ela cria a própria senha. Esta senha não aparece de novo.");

        assertThat(rodar(Map.of(), "db:usuario", "--loja", sub, "--usuario", "maria", "--redefinir-senha").saida())
                .startsWith("Nova senha provisória para maria na loja Loja do Teste.");
        assertThat(rodar(Map.of(), "db:usuario", "--loja", sub, "--usuario", "maria", "--desativar").saida())
                .isEqualTo("maria desativado na loja Loja do Teste." + System.lineSeparator());
        assertThat(rodar(Map.of(), "db:usuario", "--loja", "naoexiste", "--usuario", "x1").erro())
                .isEqualTo("Nenhuma loja com o endereço \"naoexiste\". Rode o db:seed antes." + System.lineSeparator());
        assertThat(rodar(Map.of(), "db:usuario", "--loja", sub, "--usuario", "paula", "--nome", "Paula", "--papel", "personalizado").erro())
                .startsWith("O Personalizado é cadastrado pela aba Usuários");

        String login = "suporte." + sub;
        Saida sup = rodar(Map.of(), "db:suporte", "--usuario", login);
        assertThat(sup.codigo()).isZero();
        assertThat(sup.saida()).startsWith("Suporte (Adm. Sup) \"" + login + "\" cadastrado: entra em qualquer loja.");
        assertThat(sup.saida()).containsPattern("Senha \\(mostrada só agora; guarde num cofre de senhas\\): [A-Za-z0-9]{20}");
        assertThat(rodar(Map.of(), "db:suporte", "--usuario", login).erro())
                .startsWith("O suporte \"" + login + "\" já existe.");
        assertThat(rodar(Map.of(), "db:suporte", "--usuario", "maria").erro())
                .startsWith("O login \"maria\" já é de um usuário da loja");
        assertThat(rodar(Map.of(), "db:suporte", "--usuario", login, "--desativar").saida())
                .isEqualTo("Suporte \"" + login + "\" desativado." + System.lineSeparator());
        assertThat(rodar(Map.of(), "db:suporte", "--usuario", login, "--desativar", "--reativar").erro())
                .isEqualTo("Use só uma opção por vez." + System.lineSeparator());
    }

    @Test
    void senhaDaRoleDaAplicacao() {
        assertThat(rodar(Map.of("SAAS_DB_APP_SENHA", "curta"), "db:app-role").erro())
                .isEqualTo("SAAS_DB_APP_SENHA precisa ter pelo menos 16 caracteres." + System.lineSeparator());
        Saida ok = rodar(Map.of("SAAS_DB_APP_SENHA", BancoDeTeste.APP_SENHA), "db:app-role");
        assertThat(ok.codigo()).isZero();
        assertThat(ok.saida()).isEqualTo("Role saas_app pronta para login." + System.lineSeparator());
    }
}
