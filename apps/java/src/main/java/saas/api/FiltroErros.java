package saas.api;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
@RestControllerAdvice
public class FiltroErros {
    @ExceptionHandler(ErroApi.class)
    public ResponseEntity<Map<String,Object>> erro(ErroApi e) {
        Map<String,Object> corpo = new LinkedHashMap<>();
        corpo.put("status", e.status);
        corpo.put("mensagem", e.getMessage());
        if (e.erros != null) corpo.put("erros", e.erros);
        return ResponseEntity.status(e.status).body(corpo);
    }
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String,Object>> json() { return erro(new ErroApi(400, "JSON inválido.")); }
    @ExceptionHandler({NoResourceFoundException.class, HttpRequestMethodNotSupportedException.class})
    public ResponseEntity<Map<String,Object>> rota() { return erro(new ErroApi(404, "Rota não encontrada.")); }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String,Object>> inesperado(Exception e) {
        return erro(new ErroApi(500, "Erro interno. Tente novamente."));
    }
}
