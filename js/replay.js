// Replay em vídeo: grava o que aparece na tela (o canvas 3D) e o som do jogo durante a cobrança.
// Depois de um gol, o vídeo pode ser baixado ou compartilhado (Instagram, WhatsApp...).
// Usa o MediaRecorder do navegador: no Android/Chrome sai .webm, no iPhone/Safari sai .mp4.
// Sem suporte (navegador antigo), tudo aqui vira "não disponível" e o jogo segue normal.

const FORMATOS = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function formatoSuportado() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  return FORMATOS.find((f) => MediaRecorder.isTypeSupported(f)) || null;
}

// canvas: o canvas do jogo; audio: o objeto de js/audio.js (lê audio.contexto e audio.saida)
export function criarGravador({ canvas, audio, quadrosPorSegundo = 30, bitsPorSegundo = 6e6 } = {}) {
  const formato = formatoSuportado();
  const disponivel = Boolean(formato && canvas && typeof canvas.captureStream === 'function');
  let gravador = null;
  let pedacos = [];
  let destinoAudio = null;
  let promessaFim = null;

  function ligarAudio(fluxo) {
    try {
      const ctx = audio && audio.contexto;
      const saida = audio && audio.saida;
      if (!ctx || !saida || ctx.state !== 'running') return;
      if (!destinoAudio) {
        destinoAudio = ctx.createMediaStreamDestination();
        saida.connect(destinoAudio);
      }
      for (const faixa of destinoAudio.stream.getAudioTracks()) fluxo.addTrack(faixa);
    } catch {
      // sem som no vídeo; segue só com a imagem
    }
  }

  function comecar() {
    if (!disponivel || gravador) return false;
    try {
      const fluxo = canvas.captureStream(quadrosPorSegundo);
      ligarAudio(fluxo);
      gravador = new MediaRecorder(fluxo, { mimeType: formato, videoBitsPerSecond: bitsPorSegundo });
      pedacos = [];
      gravador.ondataavailable = (e) => {
        if (e.data && e.data.size) pedacos.push(e.data);
      };
      gravador.start(250);
      return true;
    } catch {
      gravador = null;
      return false;
    }
  }

  // Devolve uma promessa com o vídeo pronto (Blob) ou null
  function parar() {
    if (!gravador) return Promise.resolve(null);
    const g = gravador;
    gravador = null;
    promessaFim = new Promise((resolver) => {
      g.onstop = () => {
        const tipo = formato.split(';')[0];
        resolver(pedacos.length ? new Blob(pedacos, { type: tipo }) : null);
        pedacos = [];
      };
      try {
        g.stop();
      } catch {
        resolver(null);
      }
    });
    return promessaFim;
  }

  function descartar() {
    if (!gravador) return;
    const g = gravador;
    gravador = null;
    g.ondataavailable = null;
    try {
      g.stop();
    } catch {
      // já parado
    }
    pedacos = [];
  }

  return {
    disponivel,
    formato,
    get gravando() {
      return Boolean(gravador);
    },
    comecar,
    parar,
    descartar,
  };
}

// Baixa ou compartilha o vídeo. nome: sem extensão. Prefere a janela de compartilhar do celular
// (Instagram, WhatsApp...); se não der, baixa o arquivo.
export async function salvarVideo(blob, nome = 'gol') {
  if (!blob) return 'nada';
  const extensao = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const arquivo = `${nome}.${extensao}`;
  try {
    if (navigator.share && typeof File === 'function') {
      const file = new File([blob], arquivo, { type: blob.type });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Free Kick Legends' });
        return 'compartilhado';
      }
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelado';
    // cai no download
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = arquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'baixado';
}
