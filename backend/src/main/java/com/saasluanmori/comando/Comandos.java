package com.saasluanmori.comando;

import com.saasluanmori.config.SenhaScrypt;
import com.saasluanmori.domain.Login;
import com.saasluanmori.domain.Papel;
import com.saasluanmori.domain.RegrasDeSenha;
import com.saasluanmori.domain.Subdominio;
import com.saasluanmori.domain.TextoJs;
import com.saasluanmori.domain.UuidV7;
import java.io.PrintStream;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;

/**
 * Os comandos de administração ({@code legacy/api/scripts}: {@code seed-dev.ts}, {@code cadastrar-usuario.ts},
 * {@code cadastrar-suporte.ts} e {@code definir-senha-app.ts}). Conectam com a role dona do schema
 * ({@code SAAS_DB_URL}, {@code SAAS_DB_DONO_USUARIO}, {@code SAAS_DB_DONO_SENHA}); como num banco gerenciado ela
 * também passa pelo RLS forçado, cada operação define a loja da transação.
 */
public final class Comandos {

    public static final Set<String> NOMES = Set.of("db:seed", "db:usuario", "db:suporte", "db:app-role");

    /** Para o Adm. Sup, que não tem loja, passar pela policy da loja sem erro (nenhuma loja tem este id). */
    static final String NENHUMA_LOJA = "00000000-0000-0000-0000-000000000000";

    /** Sem 0/o, 1/l/i: fácil de ditar ({@code cadastrar-usuario.ts:36}). */
    static final String LETRAS = "abcdefghjkmnpqrstuvwxyz23456789";
    /** {@code cadastrar-suporte.ts:29}. */
    static final String LETRAS_SUPORTE = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

    private static final SecureRandom SORTEIO = new SecureRandom();

    /** Erro de uso ou de regra: a mensagem vai para a tela de quem rodou o comando. */
    static final class Falha extends RuntimeException {
        private static final long serialVersionUID = 1L;

        Falha(String mensagem) {
            super(mensagem);
        }
    }

    private final Function<String, String> env;
    private final PrintStream saida;
    private final PrintStream erro;

    Comandos(Function<String, String> env, PrintStream saida, PrintStream erro) {
        this.env = env;
        this.saida = saida;
        this.erro = erro;
    }

    /** Roda o comando e devolve o código de saída (0 = deu certo). */
    public static int executar(String[] args) {
        return new Comandos(System::getenv, System.out, System.err).rodar(args);
    }

    int rodar(String[] args) {
        try {
            Map<String, String> opcoes = lerOpcoes(args);
            switch (args[0]) {
                case "db:seed" -> semear();
                case "db:usuario" -> usuario(opcoes);
                case "db:suporte" -> suporte(opcoes);
                case "db:app-role" -> senhaDaApp();
                default -> throw new Falha("Comando desconhecido: " + args[0]);
            }
            return 0;
        } catch (Falha e) {
            erro.println(e.getMessage());
            return 1;
        } catch (SQLException e) {
            erro.println("Falha: " + e.getMessage());
            return 1;
        }
    }

    // ------------------------------------------------------------------ db:seed (seed-dev.ts)

    /** SEED_LOJAS="Loja A=lojaa;Pet Shop da Ana=petshopdaana" → cadastra (ou renomeia) cada loja pelo endereço. */
    static List<String[]> lerSeedLojas(String texto) {
        List<String[]> lojas = new ArrayList<>();
        for (String bruto : texto.split(";", -1)) {
            String par = TextoJs.trim(bruto);
            if (par.isEmpty()) {
                continue;
            }
            String[] partes = par.split("=", -1);
            String nome = TextoJs.trim(partes[0]);
            Subdominio.Resultado v = Subdominio.validar(partes.length > 1 ? TextoJs.trim(partes[1]) : null);
            if (nome.isEmpty() || !v.ok() || partes.length > 2) {
                throw new Falha("Entrada inválida em SEED_LOJAS: \"" + par
                        + "\" (esperado \"Nome=endereco\", endereço com letras minúsculas, números e hífen)");
            }
            lojas.add(new String[] {nome, v.valor()});
        }
        return lojas;
    }

    private void semear() throws SQLException {
        String seed = env.apply("SEED_LOJAS");
        if (seed == null || seed.isEmpty()) {
            throw new Falha("Defina SAAS_DB_URL, SAAS_DB_DONO_USUARIO, SAAS_DB_DONO_SENHA e SEED_LOJAS.");
        }
        List<String[]> lojas = lerSeedLojas(seed);
        try (Connection c = conectar(); PreparedStatement ps = c.prepareStatement("""
                INSERT INTO lojas (id, nome, subdominio) VALUES (?, ?, ?)
                ON CONFLICT (subdominio) DO UPDATE SET nome = EXCLUDED.nome, atualizado_em = now()""")) {
            for (String[] loja : lojas) {
                ps.setObject(1, UuidV7.gerar());
                ps.setString(2, loja[0]);
                ps.setString(3, loja[1]);
                ps.executeUpdate();
                saida.println("Loja pronta: " + loja[0] + " (" + loja[1] + ")");
            }
        }
    }

    // ------------------------------------------------------------------ db:usuario (cadastrar-usuario.ts)

    /** 12 letras e números sorteados (~59 bits): só serve até a pessoa criar a dela. */
    static String sortearSenhaProvisoria(String usuario, String nome) {
        while (true) {
            String s = sortear(LETRAS, 12);
            if (RegrasDeSenha.validar(s, usuario, nome).isEmpty()) {
                return s;
            }
        }
    }

    private void usuario(Map<String, String> o) throws SQLException {
        boolean redefinir = o.containsKey("redefinir-senha");
        boolean desativar = o.containsKey("desativar");
        if (o.get("loja") == null || o.get("usuario") == null || (redefinir && desativar)) {
            throw new Falha("Uso: --loja lojaa --usuario ana (--nome \"Ana Paula\" --papel dono | --redefinir-senha | --desativar)\n"
                    + "Precisa de SAAS_DB_URL, SAAS_DB_DONO_USUARIO e SAAS_DB_DONO_SENHA.");
        }
        Subdominio.Resultado loja = Subdominio.validar(o.get("loja"));
        if (!loja.ok()) {
            throw new Falha("--loja inválida: use o endereço da loja (ex.: lojaa).");
        }
        String login = Login.validar(o.get("usuario")).orElseThrow(() -> new Falha(Login.MENSAGEM_FORMATO));
        try (Connection c = conectar()) {
            UUID lojaId;
            String lojaNome;
            try (PreparedStatement ps = c.prepareStatement("SELECT id, nome FROM lojas WHERE subdominio = ?")) {
                ps.setString(1, loja.valor());
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) {
                        throw new Falha("Nenhuma loja com o endereço \"" + loja.valor() + "\". Rode o db:seed antes.");
                    }
                    lojaId = rs.getObject(1, UUID.class);
                    lojaNome = rs.getString(2);
                }
            }
            c.setAutoCommit(false);
            try {
                definirLoja(c, lojaId.toString());
                String resumo;
                String senha = null;
                String[] atual = linha(c, "SELECT id::text, nome, papel::text FROM usuarios WHERE tenant_id = ? AND usuario = ?", lojaId, login);
                if (redefinir || desativar) {
                    if (atual == null) {
                        throw new Falha(login + " não está cadastrado na loja " + lojaNome + ".");
                    }
                    UUID id = UUID.fromString(atual[0]);
                    if (desativar) {
                        executar(c, "UPDATE usuarios SET ativo = false, atualizado_em = now() WHERE id = ?", id);
                        encerrarSessoes(c, lojaId, id);
                        auditar(c, lojaId, "usuario.desativado", id, "{\"origem\":\"script\"}");
                        resumo = login + " desativado na loja " + lojaNome + ".";
                    } else {
                        senha = sortearSenhaProvisoria(login, atual[1]);
                        executar(c, "UPDATE usuarios SET senha_hash = ?, senha_provisoria = true, tentativas_erradas = 0, bloqueado_ate = NULL, atualizado_em = now() WHERE id = ?",
                                senhas().encode(senha), id);
                        encerrarSessoes(c, lojaId, id);
                        auditar(c, lojaId, "usuario.senha_redefinida", id, "{\"origem\":\"script\"}");
                        resumo = "Nova senha provisória para " + login + " na loja " + lojaNome + ".";
                    }
                } else {
                    resumo = cadastrarOuAtualizar(c, lojaId, lojaNome, login, o.get("nome"), o.get("papel"), atual);
                    if (atual == null) {
                        senha = senhaCriada;
                    }
                }
                c.commit();
                saida.println(resumo);
                if (senha != null) {
                    saida.println("Senha provisória: " + senha);
                    saida.println("Entregue à pessoa. No primeiro acesso ela cria a própria senha. Esta senha não aparece de novo.");
                }
            } catch (RuntimeException | SQLException e) {
                c.rollback();
                throw e;
            }
        }
    }

    private String senhaCriada;

    private String cadastrarOuAtualizar(Connection c, UUID lojaId, String lojaNome, String login, String nomeInformado, String papelInformado, String[] atual)
            throws SQLException {
        if ("personalizado".equals(papelInformado)) {
            throw new Falha("O Personalizado é cadastrado pela aba Usuários, com as funções marcadas para ele.");
        }
        Papel papel = papelInformado == null ? null : Papel.deValor(papelInformado).filter(Papel::ehDeLoja).orElseThrow(() -> new Falha(
                "--papel deve ser: " + String.join(", ", Papel.DE_LOJA.stream().map(Papel::valor).toList()) + "."));
        if (atual != null) {
            String nome = nomeInformado == null || TextoJs.trim(nomeInformado).isEmpty() ? atual[1] : TextoJs.trim(nomeInformado);
            String p = papel == null ? atual[2] : papel.valor();
            UUID id = UUID.fromString(atual[0]);
            executar(c, "UPDATE usuarios SET nome = ?, papel = ?::papel, permissoes = CASE WHEN ? = 'personalizado' THEN permissoes ELSE '{}'::text[] END, ativo = true, atualizado_em = now() WHERE id = ?",
                    nome, p, p, id);
            auditar(c, lojaId, "usuario.alterado", id, "{\"origem\":\"script\",\"papel\":\"" + p + "\"}");
            return login + " atualizado na loja " + lojaNome + " como " + p + " (a senha não mudou).";
        }
        if (linha(c, "SELECT 1::text FROM usuarios WHERE tenant_id IS NULL AND papel = 'super_admin' AND usuario = ?", login) != null) {
            throw new Falha("O login \"" + login + "\" é do suporte (Adm. Sup). Escolha outro.");
        }
        String nome = nomeInformado == null ? "" : TextoJs.trocarEspacos(TextoJs.trim(java.text.Normalizer.normalize(nomeInformado, java.text.Normalizer.Form.NFC)), " ");
        List<String> problemas = new ArrayList<>();
        if (nome.length() < 2) {
            problemas.add("Informe o nome da pessoa.");
        } else if (nome.length() > 120) {
            problemas.add("O nome pode ter até 120 caracteres.");
        } else if (nome.chars().anyMatch(ch -> ch <= 0x1f || ch == 0x7f)) {
            problemas.add("O nome contém caracteres inválidos.");
        }
        if (papel == null) {
            problemas.add("Escolha o papel: " + String.join(", ", Papel.DE_LOJA.stream().map(Papel::rotulo).toList()) + ".");
        }
        if (!problemas.isEmpty()) {
            throw new Falha(String.join(" ", problemas));
        }
        String senha = sortearSenhaProvisoria(login, nome);
        UUID id = UuidV7.gerar();
        executar(c, "INSERT INTO usuarios (id, tenant_id, usuario, nome, papel, ativo, senha_hash, senha_provisoria) VALUES (?, ?, ?, ?, ?::papel, true, ?, true)",
                id, lojaId, login, nome, papel.valor(), senhas().encode(senha));
        auditar(c, lojaId, "usuario.criado", id, "{\"origem\":\"script\",\"papel\":\"" + papel.valor() + "\"}");
        senhaCriada = senha;
        return login + " cadastrado na loja " + lojaNome + " como " + papel.valor() + ".";
    }

    // ------------------------------------------------------------------ db:suporte (cadastrar-suporte.ts)

    /** 20 letras e números sorteados, que passem na regra da senha. */
    static String sortearSenhaDoSuporte(String usuario) {
        while (true) {
            String s = sortear(LETRAS_SUPORTE, 20);
            if (RegrasDeSenha.validar(s, usuario, Papel.NOME_SUPORTE).isEmpty()) {
                return s;
            }
        }
    }

    private void suporte(Map<String, String> o) throws SQLException {
        if (o.get("usuario") == null) {
            throw new Falha("Informe --usuario (ex.: --usuario suporte).");
        }
        List<String> acoes = new ArrayList<>();
        for (String a : List.of("redefinir-senha", "desativar", "reativar")) {
            if (o.containsKey(a)) {
                acoes.add(a);
            }
        }
        if (acoes.size() > 1) {
            throw new Falha("Use só uma opção por vez.");
        }
        String acao = acoes.isEmpty() ? "cadastrar" : acoes.get(0);
        String login = Login.validar(o.get("usuario")).orElseThrow(() -> new Falha(Login.MENSAGEM_FORMATO));
        try (Connection c = conectar()) {
            c.setAutoCommit(false);
            try {
                // duas execuções ao mesmo tempo com o mesmo login não criam dois suportes
                executar(c, "SELECT pg_advisory_xact_lock(hashtextextended('suporte:' || ?, 0))", login);
                definirLoja(c, NENHUMA_LOJA);
                String[] atual = linha(c, "SELECT id::text, ativo::text FROM usuarios WHERE tenant_id IS NULL AND papel = 'super_admin' AND usuario = ?", login);
                String resumo;
                String senha = null;
                if (acao.equals("cadastrar")) {
                    if (atual != null) {
                        throw new Falha("O suporte \"" + login + "\" já existe. Use --redefinir-senha, --desativar ou --reativar.");
                    }
                    // o login do suporte vale em todas as lojas: não pode ser o de alguém de uma loja (loja a loja, pelo RLS)
                    for (String[] l : linhas(c, "SELECT id::text, nome FROM lojas ORDER BY nome")) {
                        definirLoja(c, l[0]);
                        if (linha(c, "SELECT 1::text FROM usuarios WHERE tenant_id = ?::uuid AND usuario = ?", l[0], login) != null) {
                            throw new Falha("O login \"" + login + "\" já é de um usuário da loja " + l[1] + ". Escolha outro para o suporte (ex.: suporte.joao).");
                        }
                    }
                    definirLoja(c, NENHUMA_LOJA);
                    senha = sortearSenhaDoSuporte(login);
                    executar(c, "INSERT INTO usuarios (id, tenant_id, usuario, nome, papel, ativo, senha_hash, senha_provisoria) VALUES (?, NULL, ?, ?, 'super_admin', true, ?, false)",
                            UuidV7.gerar(), login, Papel.NOME_SUPORTE, senhas().encode(senha));
                    resumo = "Suporte (Adm. Sup) \"" + login + "\" cadastrado: entra em qualquer loja.";
                } else {
                    if (atual == null) {
                        throw new Falha("Não há suporte \"" + login + "\". Cadastre antes (sem opção).");
                    }
                    UUID id = UUID.fromString(atual[0]);
                    if (acao.equals("redefinir-senha")) {
                        senha = sortearSenhaDoSuporte(login);
                        executar(c, "UPDATE usuarios SET senha_hash = ?, tentativas_erradas = 0, bloqueado_ate = NULL, atualizado_em = now() WHERE id = ?",
                                senhas().encode(senha), id);
                        encerrarSessoesDoSuporte(c, id);
                        resumo = "Nova senha para o suporte \"" + login + "\" (as sessões abertas terminaram).";
                    } else {
                        boolean ativo = acao.equals("reativar");
                        executar(c, "UPDATE usuarios SET ativo = ?, atualizado_em = now() WHERE id = ?", ativo, id);
                        if (!ativo) {
                            encerrarSessoesDoSuporte(c, id);
                        }
                        resumo = "Suporte \"" + login + "\" " + (ativo ? "reativado" : "desativado") + ".";
                    }
                }
                c.commit();
                saida.println(resumo);
                if (senha != null) {
                    saida.println("Senha (mostrada só agora; guarde num cofre de senhas): " + senha);
                }
            } catch (RuntimeException | SQLException e) {
                c.rollback();
                throw e;
            }
        }
    }

    /** As sessões do suporte ficam nas lojas em que ele entrou: encerra loja a loja, com a loja na transação. */
    private void encerrarSessoesDoSuporte(Connection c, UUID id) throws SQLException {
        for (String[] l : linhas(c, "SELECT id::text FROM lojas")) {
            definirLoja(c, l[0]);
            encerrarSessoes(c, UUID.fromString(l[0]), id);
        }
        definirLoja(c, NENHUMA_LOJA);
    }

    // ------------------------------------------------------------------ db:app-role (definir-senha-app.ts)

    private void senhaDaApp() throws SQLException {
        String senha = env.apply("SAAS_DB_APP_SENHA");
        if (senha == null || senha.isEmpty()) {
            throw new Falha("Defina SAAS_DB_URL, SAAS_DB_DONO_USUARIO, SAAS_DB_DONO_SENHA e SAAS_DB_APP_SENHA.");
        }
        if (senha.length() < 16) {
            throw new Falha("SAAS_DB_APP_SENHA precisa ter pelo menos 16 caracteres.");
        }
        try (Connection c = conectar()) {
            try (PreparedStatement ps = c.prepareStatement("SELECT format('ALTER ROLE saas_app WITH LOGIN PASSWORD %L', ?::text)")) {
                ps.setString(1, senha);
                try (ResultSet rs = ps.executeQuery(); Statement st = c.createStatement()) {
                    rs.next();
                    st.execute(rs.getString(1));
                }
            }
        }
        saida.println("Role saas_app pronta para login.");
    }

    // ------------------------------------------------------------------ ajudas

    static Map<String, String> lerOpcoes(String[] args) {
        Map<String, String> o = new HashMap<>();
        Set<String> chaves = Set.of("redefinir-senha", "desativar", "reativar");
        for (int i = 1; i < args.length; i++) {
            if (!args[i].startsWith("--")) {
                throw new Falha("Opção inesperada: " + args[i]);
            }
            String nome = args[i].substring(2);
            if (chaves.contains(nome)) {
                o.put(nome, "");
            } else if (i + 1 < args.length) {
                o.put(nome, args[++i]);
            } else {
                throw new Falha("Falta o valor de --" + nome + ".");
            }
        }
        return o;
    }

    private Connection conectar() throws SQLException {
        String url = env.apply("SAAS_DB_URL");
        String usuario = env.apply("SAAS_DB_DONO_USUARIO");
        String senha = env.apply("SAAS_DB_DONO_SENHA");
        if (url == null || usuario == null || senha == null) {
            throw new Falha("Defina SAAS_DB_URL, SAAS_DB_DONO_USUARIO e SAAS_DB_DONO_SENHA (a dona do schema).");
        }
        return DriverManager.getConnection(url, usuario, senha);
    }

    private SenhaScrypt senhas() {
        String custo = env.apply("SAAS_SENHA_LOG_N");
        return new SenhaScrypt(custo == null || custo.isBlank() ? SenhaScrypt.LOG_N_PADRAO : Integer.parseInt(custo.trim()));
    }

    private static String sortear(String letras, int tamanho) {
        StringBuilder s = new StringBuilder(tamanho);
        for (int i = 0; i < tamanho; i++) {
            s.append(letras.charAt(SORTEIO.nextInt(letras.length())));
        }
        return s.toString();
    }

    private static void definirLoja(Connection c, String loja) throws SQLException {
        executar(c, "SELECT set_config('app.tenant_id', ?, true)", loja);
    }

    private static void encerrarSessoes(Connection c, UUID loja, UUID usuario) throws SQLException {
        executar(c, "UPDATE sessoes SET encerrada_em = now(), atualizado_em = now() WHERE tenant_id = ? AND usuario_id = ? AND encerrada_em IS NULL", loja, usuario);
    }

    /** Cada ação fica no histórico como feita pelo "sistema" (sem usuário), com a origem "script". */
    private static void auditar(Connection c, UUID loja, String acao, UUID alvo, String detalhes) throws SQLException {
        executar(c, "INSERT INTO auditoria (id, tenant_id, criado_por, acao, alvo_tipo, alvo_id, detalhes) VALUES (?, ?, NULL, ?, 'usuario', ?, ?::jsonb)",
                UuidV7.gerar(), loja, acao, alvo, detalhes);
    }

    private static void executar(Connection c, String sql, Object... p) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < p.length; i++) {
                ps.setObject(i + 1, p[i]);
            }
            ps.execute();
        }
    }

    private static String[] linha(Connection c, String sql, Object... p) throws SQLException {
        List<String[]> r = linhas(c, sql, p);
        return r.isEmpty() ? null : r.get(0);
    }

    private static List<String[]> linhas(Connection c, String sql, Object... p) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < p.length; i++) {
                ps.setObject(i + 1, p[i]);
            }
            try (ResultSet rs = ps.executeQuery()) {
                List<String[]> r = new ArrayList<>();
                int n = rs.getMetaData().getColumnCount();
                while (rs.next()) {
                    String[] l = new String[n];
                    for (int i = 0; i < n; i++) {
                        l[i] = rs.getString(i + 1);
                    }
                    r.add(l);
                }
                return r;
            }
        }
    }
}
