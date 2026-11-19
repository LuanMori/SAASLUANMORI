// apps/web/src/demo/AvisosDaDemo.tsx
// SÓ NA DEMONSTRAÇÃO (no sistema real os dados ficam no servidor). Avisos fixos no alto da tela,
// como no DaniPets:
//   - ACE-13: o navegador recusou gravar → aviso vermelho até voltar a gravar. Aqui a operação que
//     falhou é desfeita por inteiro (nada fica pela metade), e "Tentar gravar de novo" confere;
//   - ACE-14: aberta dentro de uma visualização (e-mail, Google Drive, outro aplicativo), num navegador
//     que não deixa guardar nada, ou no Firefox (cada cópia do arquivo guarda os dados separados).
import { useEffect, useState } from 'react';
import { aoMudarSituacao, type SituacaoGravacao, situacaoGravacao, testarGravacao } from './armazenamento';

/** Onde a demonstração foi aberta pode fazer os dados sumirem? null = não. (DaniPets: storageRisk) */
export function riscoDoAmbiente(ua: string = navigator.userAgent, protocolo: string = location.protocol, dentroDeOutraPagina = estaDentroDeOutraPagina()): string | null {
  if (dentroDeOutraPagina || /Electron\//.test(ua)) {
    return 'Atenção: a demonstração está aberta dentro de uma visualização (por exemplo, no e-mail, no Google Drive ou em outro aplicativo). Assim os dados podem sumir ao fechar. Baixe o arquivo e abra com dois cliques no Google Chrome ou no Microsoft Edge.';
  }
  if (protocolo === 'file:' && /Firefox\//.test(ua)) {
    return 'Atenção: no Firefox, cada cópia do arquivo guarda os dados separados (um arquivo novo da demonstração começa vazio). Para continuar sempre com os mesmos dados, use o Google Chrome ou o Microsoft Edge.';
  }
  return null;
}

function estaDentroDeOutraPagina(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function AvisosDaDemo({ risco = riscoDoAmbiente() }: { risco?: string | null }) {
  const [situacao, setSituacao] = useState<SituacaoGravacao>(situacaoGravacao);
  const [ainda, setAinda] = useState(false);
  useEffect(() => aoMudarSituacao(setSituacao), []);

  return (
    <>
      {situacao.tipo === 'falhou' && (
        <div className="aviso-gravacao" role="alert">
          <span>
            <strong>ATENÇÃO: o navegador não está deixando gravar</strong> ({situacao.mensagem.replace(/\.$/, '')}). Desde as {hora(situacao.desde)}, cada operação
            que não pôde ser gravada foi desfeita por inteiro: nada ficou pela metade. Libere espaço no navegador e repita a operação.
            {ainda && ' Ainda não foi possível gravar.'}
          </span>
          <button type="button" onClick={() => setAinda(!testarGravacao())}>
            Tentar gravar de novo
          </button>
        </div>
      )}
      {situacao.tipo === 'so-memoria' && (
        <div className="aviso-gravacao" role="alert">
          <span>
            <strong>Este navegador não deixa a demonstração guardar dados</strong>: o que você fizer some ao fechar a aba. Abra o arquivo com dois cliques no Google
            Chrome ou no Microsoft Edge (fora da janela anônima).
          </span>
        </div>
      )}
      {risco && situacao.tipo !== 'so-memoria' && (
        <p className="aviso-risco" role="alert">
          {risco}
        </p>
      )}
    </>
  );
}
