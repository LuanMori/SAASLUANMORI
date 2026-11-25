package saas.api;
import java.util.List;
import saas.core.Produto.ErroCampo;
public final class ErroApi extends RuntimeException {
    public final int status;
    public final List<ErroCampo> erros;
    public ErroApi(int status, String mensagem) { this(status, mensagem, null); }
    public ErroApi(int status, String mensagem, List<ErroCampo> erros) {
        super(mensagem);
        this.status = status;
        this.erros = erros == null ? null : List.copyOf(erros);
    }
}
