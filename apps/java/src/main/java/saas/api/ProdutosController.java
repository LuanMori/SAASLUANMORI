package saas.api;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/produtos")
public class ProdutosController {
    private final Produtos produtos;
    public ProdutosController(Produtos produtos) { this.produtos = produtos; }
    @GetMapping
    public Map<String,List<Produtos.Publico>> listar(@RequestAttribute("contexto") Autenticacao.Contexto ctx) {
        return Map.of("itens", produtos.listar(ctx));
    }
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Produtos.Publico criar(@RequestAttribute("contexto") Autenticacao.Contexto ctx, @RequestBody(required=false) Object corpo) {
        return produtos.criar(ctx, corpo);
    }
}
