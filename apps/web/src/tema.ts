// apps/web/src/tema.ts
// Tema claro / escuro (DaniPets ACE-15, "V8.2: a escolha fica neste computador; sem escolha, segue o
// sistema"). Sem escolha, segue o claro/escuro do computador (e muda junto se ele mudar). O botão da
// barra lateral troca entre claro e escuro, e a escolha fica guardada neste navegador.
// O CSS lê o atributo data-tema="claro|escuro" do <html> (estilos.css).
import { useEffect, useState } from 'react';

export type EscolhaTema = 'auto' | 'claro' | 'escuro';
export type Tema = 'claro' | 'escuro';

const CHAVE = 'saas:tema';
const ESCURO_NO_SISTEMA = '(prefers-color-scheme: dark)';

const ouvintes = new Set<(t: Tema) => void>();
/** Navegador que não deixa guardar: a escolha vale só nesta aba. */
let escolhaNaMemoria: EscolhaTema = 'auto';

export function escolhaDoTema(): EscolhaTema {
  try {
    const v = localStorage.getItem(CHAVE);
    if (v === 'claro' || v === 'escuro') return v;
    return v === null ? escolhaNaMemoria : 'auto'; // valor estranho guardado: segue o computador
  } catch {
    return escolhaNaMemoria;
  }
}

const sistemaEscuro = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(ESCURO_NO_SISTEMA).matches;

export function temaAtual(escolha: EscolhaTema = escolhaDoTema()): Tema {
  return escolha === 'escuro' || (escolha === 'auto' && sistemaEscuro()) ? 'escuro' : 'claro';
}

/** Põe o tema no <html> e avisa quem estiver ouvindo (o botão troca o ícone). */
export function aplicarTema(): Tema {
  const t = temaAtual();
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.tema = t;
    document.documentElement.style.colorScheme = t === 'escuro' ? 'dark' : 'light';
  }
  ouvintes.forEach((f) => f(t));
  return t;
}

/** Troca entre claro e escuro e guarda a escolha neste navegador (como o DaniPets). */
export function alternarTema(): Tema {
  const novo: Tema = temaAtual() === 'escuro' ? 'claro' : 'escuro';
  escolhaNaMemoria = novo;
  try {
    localStorage.setItem(CHAVE, novo);
  } catch {
    // sem localStorage: vale só até fechar a aba
  }
  return aplicarTema();
}

let iniciado = false;

/** Chamar uma vez ao abrir: aplica o tema e acompanha o claro/escuro do computador e as outras abas. */
export function iniciarTema(): void {
  aplicarTema();
  if (iniciado || typeof window === 'undefined') return;
  iniciado = true;
  if (typeof window.matchMedia === 'function') {
    const mq = window.matchMedia(ESCURO_NO_SISTEMA);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', () => {
        if (escolhaDoTema() === 'auto') aplicarTema();
      });
    }
  }
  window.addEventListener('storage', (e) => {
    if (e.key === CHAVE || e.key === null) aplicarTema();
  });
}

/** O tema em uso e a função que troca (para o botão da barra lateral). */
export function usarTema(): { tema: Tema; alternar: () => void } {
  const [tema, setTema] = useState<Tema>(() => temaAtual());
  useEffect(() => {
    ouvintes.add(setTema);
    return () => {
      ouvintes.delete(setTema);
    };
  }, []);
  return { tema, alternar: () => setTema(alternarTema()) };
}
