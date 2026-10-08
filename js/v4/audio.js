// Som do jogo: tudo sintetizado na hora com WebAudio, sem nenhum arquivo de áudio para baixar.
// Chute, trave, rede, barreira, defesa, quique, apito e a torcida (ambiente, tensão, gol e o "uuuh").
//
// Uso no jogo:
//   const audio = criarAudio(CONFIG);   // ainda não toca nada (lê CONFIG.audio, se existir)
//   audio.iniciar();                    // num toque: o celular (principalmente o iPhone) só libera som depois de um toque
//   audio.torcidaAmbiente(0.45);  audio.torcidaTensao();  audio.chute(0.9);  audio.rede();  audio.torcidaGol();
//   audio.mudo = true;                  // fica salvo no aparelho
// Sem WebAudio no navegador, tudo vira função vazia: o jogo segue sem som e sem erro.
//
// Como funciona: um chiado (ruído) gerado uma vez e filtrado em faixas vira torcida, rede e estalos;
// osciladores (tons puros) viram o "tum" do chute, o "plim" da trave, o apito e as vozes da multidão.
// Tudo passa por um compressor (deixa o volume mais parelho) e um limitador (nunca estoura).
// Feito para gastar pouco processador no celular: filtros fixos (filtro que muda de frequência a
// cada instante custa o triplo), eco feito com atrasos em vez de convolução, e nada de ScriptProcessor.
// A síntese (montarMotor) roda em qualquer contexto de áudio: o testes/audio.html renderiza cada som
// sem tocar (OfflineAudioContext) e mede pico, volume e duração.

export const PADRAO_AUDIO = {
  volume: 1,            // volume geral
  volumeEfeitos: 1,     // chute, trave, rede, barreira, defesa, quique e apito
  volumeTorcida: 0.8,   // torcida: ambiente, tensão, gol e "uuuh"
  eco: 0.35,            // eco do estádio (0 = som seco)
  bumbo: 0.6,           // bumbo da torcida organizada ao fundo (0 = sem bumbo)
  assobios: 0.6,        // assobios soltos na arquibancada (0 = nenhum)
  gritos: 0.6,          // gritos soltos de torcedor, longe ("ê!", "vai!") (0 = nenhum)
};

const CHAVE_MUDO = 'fkl-mudo';

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
const lerCfg = (cfg) => ({ ...PADRAO_AUDIO, ...((cfg && cfg.audio) || {}) });

// Interpola uma lista de pontos [u, valor] (u de 0 a 1, em ordem)
function interpolar(pontos, u) {
  if (u <= pontos[0][0]) return pontos[0][1];
  for (let i = 1; i < pontos.length; i++) {
    const [u1, v1] = pontos[i];
    if (u <= u1) {
      const [u0, v0] = pontos[i - 1];
      return v0 + ((v1 - v0) * (u - u0)) / (u1 - u0 || 1);
    }
  }
  return pontos[pontos.length - 1][1];
}

// ---------- Curvas de distorção ----------

// Limitador: reto até 0,75 e depois dobra suave até no máximo 0,94 (o som nunca estoura).
// O nó recebe o sinal pela metade, então entradas de -2 a 2 cabem na curva.
const TETO = 0.94;
const JOELHO = 0.75;
const FAIXA_LIMITADOR = 2;
function curvaLimitador() {
  const n = 4097;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = ((i / (n - 1)) * 2 - 1) * FAIXA_LIMITADOR;
    const m = Math.abs(a);
    const y = m <= JOELHO ? m : JOELHO + (TETO - JOELHO) * Math.tanh((m - JOELHO) / (TETO - JOELHO));
    c[i] = Math.sign(a) * y;
  }
  return c;
}

// Saturação suave: arredonda o grave e cria harmônicos. Alto-falante de celular quase não toca
// abaixo de 200 Hz; os harmônicos fazem o ouvido "completar" o grave que falta.
function curvaSaturacao(forca) {
  const n = 1025;
  const c = new Float32Array(n);
  const norma = Math.tanh(forca);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(forca * ((i / (n - 1)) * 2 - 1)) / norma;
  return c;
}

// ---------- Matéria-prima: gerada uma vez, na criação ----------

function bufferRuido(ctx, canais, segundos, aleatorio) {
  const b = ctx.createBuffer(canais, Math.round(ctx.sampleRate * segundos), ctx.sampleRate);
  for (let c = 0; c < canais; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = aleatorio() * 2 - 1;
  }
  return b;
}

// Buffer com taxa baixa (para curvas de volume, que não precisam de agudos): economiza memória e tempo
function bufferLento(ctx, segundos) {
  for (const taxa of [4000, 8000, 22050, ctx.sampleRate]) {
    try {
      return ctx.createBuffer(1, Math.round(taxa * segundos), taxa);
    } catch {
      // taxa não aceita neste navegador: tenta a próxima
    }
  }
  return null;
}

// Ondas lentas e aleatórias (de -1 a 1) para mexer em volumes: `pps` pontos sorteados por segundo,
// ligados por curvas suaves. Emenda o fim no começo (toca em loop). Tocada mais devagar ou mais
// depressa, a mesma curva serve para as ondas da torcida (segundos) e para o tremido das vozes.
function bufferCurva(ctx, segundos, pps, aleatorio) {
  const b = bufferLento(ctx, segundos);
  const pontos = Math.round(segundos * pps);
  const v = [];
  for (let k = 0; k < pontos; k++) v.push(aleatorio() * 2 - 1);
  v.push(v[0]);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const pos = (i / d.length) * pontos;
    const k = Math.floor(pos);
    const x = pos - k;
    const s = x * x * (3 - 2 * x);
    d[i] = v[k] * (1 - s) + v[k + 1] * s;
  }
  return b;
}

// Aplausos: centenas de palmas sorteadas (cada uma um estalo curto com a ressonância das mãos).
// Densas e sobrepostas, viram o chiado "crepitante" de uma arquibancada aplaudindo.
function bufferAplausos(ctx, aleatorio) {
  const sr = ctx.sampleRate;
  const segundos = 2;
  const n = Math.round(sr * segundos);
  const b = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    const palmas = segundos * 110;
    for (let k = 0; k < palmas; k++) {
      const i0 = Math.floor(aleatorio() * n);
      let amp = 0.25 + 0.75 * aleatorio() * aleatorio();
      const tau = sr * (0.0012 + 0.0028 * aleatorio());
      const queda = Math.exp(-1 / tau);
      // Passa-faixa (biquad) na ressonância da palma: mão em concha = grave, espalmada = aguda
      const w = (2 * Math.PI * (700 + 1900 * aleatorio())) / sr;
      const alfa = Math.sin(w) / (2 * 1.6);
      const a0 = 1 + alfa;
      const b0 = alfa / a0;
      const a1 = (-2 * Math.cos(w)) / a0;
      const a2 = (1 - alfa) / a0;
      let x1 = 0;
      let x2 = 0;
      let y1 = 0;
      let y2 = 0;
      for (let j = 0; j < tau * 5; j++) {
        const x = (aleatorio() * 2 - 1) * amp;
        amp *= queda;
        const y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        d[(i0 + j) % n] += y;
      }
    }
  }
  return b;
}

// Uma batida de bumbo ouvida de longe: tom grave que cai de afinação (saturado), o "tapa" da pele
// em ~260 Hz e um passa-baixa (a distância tira o agudo). O grave bem fundo quase some (de longe
// chega mais o corpo da pele) e o eco da arquibancada já vem junto.
function bufferBumbo(ctx, grave, aleatorio) {
  const sr = ctx.sampleRate;
  const n = Math.round(sr * 0.75);
  const b = ctx.createBuffer(1, n, sr);
  const d = b.getChannelData(0);
  const fIni = grave ? 105 : 125;
  const fFim = grave ? 66 : 80;
  const queda = grave ? 0.13 : 0.09;
  // Biquad passa-faixa da pele
  const w = (2 * Math.PI * 260) / sr;
  const alfa = Math.sin(w) / (2 * 1.2);
  const a0 = 1 + alfa;
  const b0 = alfa / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - alfa) / a0;
  const kBaixa = 1 - Math.exp((-2 * Math.PI * 600) / sr);
  const kAlta = Math.exp((-2 * Math.PI * 85) / sr);
  const norma = Math.tanh(1.8);
  const seco = new Float32Array(n);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  let fase = 0;
  let pb = 0;
  let paEntrada = 0;
  let pa = 0;
  let pico = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    fase += (2 * Math.PI * (fFim + (fIni - fFim) * Math.exp(-t / 0.03))) / sr;
    const env = t < 0.002 ? t / 0.002 : Math.exp(-(t - 0.002) / queda);
    const corpo = Math.tanh(1.8 * env * Math.sin(fase)) / norma;
    const x = (aleatorio() * 2 - 1) * Math.exp(-t / 0.025);
    const pele = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = pele;
    pb += kBaixa * (corpo + 1.6 * pele - pb);
    pa = kAlta * (pa + pb - paEntrada); // passa-alta de 1 polo
    paEntrada = pb;
    seco[i] = pa;
    pico = Math.max(pico, Math.abs(pa));
  }
  // Eco embutido: duas repetições mais fracas
  const ecos = [[Math.round(sr * 0.21), 0.22], [Math.round(sr * 0.37), 0.1]];
  for (let i = 0; i < n; i++) {
    let v = seco[i];
    for (const [atraso, vol] of ecos) if (i >= atraso) v += vol * seco[i - atraso];
    d[i] = (0.9 * v) / (pico || 1);
  }
  return b;
}

// ---------- Motor de síntese ----------
// Funciona em qualquer contexto de áudio (o do jogo ou um OfflineAudioContext de teste).
// Todo som aceita `quando` (tempo do contexto, em s); sem ele, toca agora.
// opcoes: cfg (o CONFIG do jogo; lê cfg.audio na hora), aleatorio (função de 0 a 1, para testes
// repetíveis) e cru (só para medir: tira o compressor e o limitador, para ver o volume de verdade).

export function montarMotor(ctx, { cfg = null, aleatorio = Math.random, cru = false } = {}) {
  const sorteio = (min, max) => min + (max - min) * aleatorio();
  const agora = (quando) => (quando === undefined || quando === null ? ctx.currentTime : quando);
  const config = () => lerCfg(cfg);

  const ruido = bufferRuido(ctx, 1, 1, aleatorio);          // chiado dos efeitos
  const ruidoEstereo = bufferRuido(ctx, 2, 2, aleatorio);   // chiado da torcida (esquerda ≠ direita)
  const curva = bufferCurva(ctx, 8, 4, aleatorio);          // ondas aleatórias para volumes
  let aplausos = null; // feito depois (preparar), para o primeiro toque não engasgar
  const preparar = () => aplausos || (aplausos = bufferAplausos(ctx, aleatorio));
  const saturacao = curvaSaturacao(2.2);
  const temPanorama = typeof ctx.createStereoPanner === 'function';

  // ----- Pecinhas -----

  function ganho(v = 1) {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  }
  // Ganho que junta tudo num canal só (os filtros depois dele trabalham pela metade)
  function mono(v = 1) {
    const g = ganho(v);
    g.channelCount = 1;
    g.channelCountMode = 'explicit';
    return g;
  }
  function filtro(tipo, freq, q = 0.707, g = 0) {
    const f = ctx.createBiquadFilter();
    f.type = tipo;
    f.frequency.value = freq;
    f.Q.value = q;
    if (g) f.gain.value = g;
    return f;
  }
  function panorama(v) {
    if (!temPanorama) return ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = v;
    return p;
  }
  // Liga os nós em fila (a → b → c ...)
  function serie(...nos) {
    for (let i = 0; i < nos.length - 1; i++) nos[i].connect(nos[i + 1]);
    return nos[0];
  }
  // Toca um buffer em loop a partir de um ponto sorteado
  function fonte(buffer, t, dur, taxa = 1) {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.playbackRate.value = taxa;
    s.start(t, aleatorio() * buffer.duration * 0.95);
    if (dur) s.stop(t + dur);
    return s;
  }
  // Mexe num AudioParam com a curva aleatória: velocidade 1 = 4 sobes-e-desces por segundo
  function modulador(t, param, velocidade, profundidade, dur) {
    const m = fonte(curva, t, dur, velocidade);
    serie(m, ganho(profundidade), param);
    return m;
  }
  // Congela um AudioParam no valor atual (para mudar de rumo sem pulo)
  function segurar(param, t) {
    if (typeof param.cancelAndHoldAtTime === 'function') {
      param.cancelAndHoldAtTime(t);
    } else {
      const v = param.value;
      param.cancelScheduledValues(t);
      param.setValueAtTime(v, t);
    }
  }
  // Envelope de pancada: sobe até `pico` em `ataque` s e cai exponencialmente (τ = `queda` s).
  // Devolve quando o som já está em silêncio (−60 dB).
  function pancada(param, t, pico, ataque, queda) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(pico, t + ataque);
    param.setTargetAtTime(0, t + ataque, queda);
    return t + ataque + queda * 7;
  }

  // ----- Saída: barramentos, eco, compressor e limitador -----
  // efeitos ─┐
  // torcida ─┼─ compressor ─ limitador ─ volume geral (e mudo) ─ alto-falante
  // eco ─────┘
  const c0 = config();
  const mestre = ganho(limitar(c0.volume, 0, 1));
  mestre.connect(ctx.destination);
  const limitador = ctx.createWaveShaper();
  limitador.curve = curvaLimitador();
  limitador.connect(mestre);
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.knee.value = 10;
  compressor.ratio.value = 2.5;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.2;
  serie(compressor, ganho(1 / FAIXA_LIMITADOR), limitador);
  const busEfeitos = ganho(limitar(c0.volumeEfeitos, 0, 2));
  const busTorcida = ganho(limitar(c0.volumeTorcida, 0, 2));
  const entrada = cru ? mestre : compressor;
  busEfeitos.connect(entrada);
  busTorcida.connect(entrada);

  // Eco do estádio: três linhas de atraso que se realimentam, com passa-baixa no laço. Cada repetição
  // volta mais fraca e mais abafada, como o som batendo nas arquibancadas (uma à esquerda, uma à
  // direita e uma no fundo). Antes, dois "difusores" espalham cada som em vários reflexos
  // pequenos, para o eco soar como um sopro e não como estalos repetidos. Tudo num canal só: custa pouco.
  const ecoEntrada = mono(1);
  const ecoRetorno = ganho(0.6 * limitar(c0.eco, 0, 1.5));
  const juntarEco = ctx.createChannelMerger(2);
  serie(juntarEco, ecoRetorno, entrada);
  // Os laços do eco gastam processador mesmo em silêncio. Desligados da saída, o navegador nem os
  // calcula: o eco "dorme" 2,5 s depois do último som que mandou algo para ele (já morreu tudo lá dentro).
  let ecoLigado = true;
  let ecoAte = 0;
  function acordarEco(tFim) {
    ecoAte = Math.max(ecoAte, tFim + 2.5);
    if (!ecoLigado) {
      ecoRetorno.connect(entrada);
      ecoLigado = true;
    }
  }
  function cochilarEco() {
    if (ecoLigado && ctx.currentTime > ecoAte) {
      ecoRetorno.disconnect();
      ecoLigado = false;
    }
  }
  // O grave não volta (eco de grave embola o som; de longe, a arquibancada devolve mais o médio)
  const semGrave = filtro('highpass', 250, 0.6);
  ecoEntrada.connect(semGrave);
  const difuso = [0.0113, 0.0071].reduce((anterior, tempo) => difusor(anterior, tempo, 0.62), semGrave);
  for (const [tempo, volta, esquerda, direita] of [[0.137, 0.4, 1, 0.25], [0.199, 0.36, 0.25, 1], [0.291, 0.3, 0.7, 0.7]]) {
    const atraso = ctx.createDelay(0.5);
    atraso.delayTime.value = tempo;
    const abafar = filtro('lowpass', 1900, 0.5);
    serie(difuso, atraso, abafar, ganho(volta), atraso); // o laço
    serie(abafar, ganho(esquerda)).connect(juntarEco, 0, 0);
    serie(abafar, ganho(direita)).connect(juntarEco, 0, 1);
  }
  // Difusor (filtro "passa-tudo" com atraso): devolve o som inteiro, mas espalhado no tempo.
  // w = x + g·w(atrasado);  saída = w(atrasado) − g·w
  function difusor(de, tempo, g) {
    const w = mono(1);
    const atraso = ctx.createDelay(0.05);
    atraso.delayTime.value = tempo;
    const saidaDifusor = mono(1);
    de.connect(w);
    serie(w, atraso, ganho(g), w);
    atraso.connect(saidaDifusor);
    serie(w, ganho(-g), saidaDifusor);
    return saidaDifusor;
  }

  // Volumes do painel: só mexe quando algum número mudou
  const assinatura = (c) => [c.volume, c.volumeEfeitos, c.volumeTorcida, c.eco].join();
  let volumes = assinatura(c0);
  let mudo = false;
  function aplicarVolumes(quando) {
    const t = agora(quando);
    const c = config();
    const novos = assinatura(c);
    if (novos === volumes) return;
    volumes = novos;
    const ajustar = (param, v) => {
      segurar(param, t);
      param.setTargetAtTime(v, t, 0.05);
    };
    ajustar(busEfeitos.gain, limitar(c.volumeEfeitos, 0, 2));
    ajustar(busTorcida.gain, limitar(c.volumeTorcida, 0, 2));
    ajustar(ecoRetorno.gain, 0.6 * limitar(c.eco, 0, 1.5));
    if (!mudo) ajustar(mestre.gain, limitar(c.volume, 0, 1));
  }
  function definirMudo(sim, imediato = false, quando) {
    const t = agora(quando);
    mudo = sim;
    const alvo = sim ? 0 : limitar(config().volume, 0, 1);
    segurar(mestre.gain, t);
    if (imediato) mestre.gain.setValueAtTime(alvo, t);
    else mestre.gain.setTargetAtTime(alvo, t, 0.015); // rápido, mas sem estalo
  }

  // Nó de saída de um som: vai para o barramento e manda um pouco (`envio`) para o eco.
  // t e dur (s): quando o som começa e quanto dura, para o eco ficar acordado o tempo certo.
  function saida({ bus = busEfeitos, envio = 0.15, nivel = 1, t = ctx.currentTime, dur = 1.2 } = {}) {
    const g = ganho(nivel);
    g.connect(bus);
    if (envio > 0) {
      serie(g, ganho(envio), ecoEntrada);
      acordarEco(t + dur);
    }
    return g;
  }

  // "Tum": tom grave com a afinação caindo, saturado (ver curvaSaturacao).
  // forca (0 a ~1,5) controla o quanto satura; nivel, o volume que sai.
  function baque(t, destino, { fIni, fFim, tempoQueda = 0.06, forca = 1, nivel = 1, queda, corte = 1500 }) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(fIni, t);
    o.frequency.exponentialRampToValueAtTime(fFim, t + tempoQueda);
    const g = ctx.createGain();
    const fim = pancada(g.gain, t, forca, 0.0015, queda);
    const sat = ctx.createWaveShaper();
    sat.curve = saturacao;
    serie(o, g, sat, filtro('lowpass', corte), ganho(nivel), destino);
    o.start(t);
    o.stop(fim);
    return fim;
  }

  // Tom curto com a afinação caindo um pouco (a "voz" do objeto: bola, luva, corpo)
  function toque(t, destino, { tipo = 'triangle', fIni, fFim, tempoQueda = 0.05, pico, queda }) {
    const o = ctx.createOscillator();
    o.type = tipo;
    o.frequency.setValueAtTime(fIni, t);
    o.frequency.exponentialRampToValueAtTime(fFim, t + tempoQueda);
    const g = ctx.createGain();
    const fim = pancada(g.gain, t, pico, 0.001, queda);
    serie(o, g, destino);
    o.start(t);
    o.stop(fim);
  }

  // Estalo: chiado curtinho filtrado numa faixa (couro, luva, camisa, palma)
  function estalo(t, destino, { freq, q = 1, pico, queda, ataque = 0.0008, tipo = 'bandpass' }) {
    const g = ctx.createGain();
    const fim = pancada(g.gain, t, pico, ataque, queda);
    serie(fonte(ruido, t, fim - t), filtro(tipo, freq, q), g, destino);
    return fim;
  }

  // ---------- Efeitos ----------

  // Chute: "tum" seco com corpo. Mais força = mais grave, mais forte e um estalo mais seco.
  function chute(forca = 0.7, quando) {
    const t = agora(quando);
    const f = limitar(forca, 0, 1);
    const v = sorteio(0.96, 1.04); // cada chute um pouco diferente
    const destino = saida({ envio: 0.06, nivel: 0.34 + 0.46 * f, t });
    // Corpo: o pé afundando a bola (grave saturado)
    baque(t, destino, {
      fIni: (210 - 70 * f) * v, fFim: (95 - 32 * f) * v, tempoQueda: 0.07,
      forca: 0.8 + 0.5 * f, nivel: 0.4, queda: 0.032 + 0.022 * f, corte: 1400,
    });
    // "Póc": a bola cheia de ar ressoando (é o que o alto-falante do celular mais toca)
    // (entra 1,5 ms depois do estalo: os picos não se somam e o som fica mais limpo)
    toque(t + 0.0015, destino, { fIni: (560 - 130 * f) * v, fFim: (430 - 100 * f) * v, pico: 0.58 + 0.16 * f, queda: 0.032 });
    toque(t + 0.0015, destino, { tipo: 'sine', fIni: (1180 - 200 * f) * v, fFim: (980 - 160 * f) * v, pico: 0.15, queda: 0.014 });
    // Estalo do couro: o "seco" do chute
    estalo(t, destino, { freq: 2200, q: 0.8, pico: 1.5 + 1.2 * f, queda: 0.005 + 0.004 * f });
    estalo(t, destino, { freq: 800, q: 0.9, pico: 1.5 + 0.8 * f, queda: 0.02 });
  }

  // Quique da bola no gramado (impacto de 0 a 1): "tup" abafado
  function quique(impacto = 0.5, quando) {
    const t = agora(quando);
    const f = limitar(impacto, 0, 1);
    if (f < 0.02) return;
    const destino = saida({ envio: 0.08, nivel: 0.2 + 0.5 * f, t });
    baque(t, destino, { fIni: 170, fFim: 90, tempoQueda: 0.05, forca: 0.9, nivel: 0.5, queda: 0.03, corte: 900 });
    toque(t, destino, { fIni: 420, fFim: 340, pico: 0.3, queda: 0.022 });
    estalo(t, destino, { freq: 700, q: 0.9, pico: 1.2, queda: 0.012 });
  }

  // Trave: o "plim" metálico de um tubo de alumínio levando a bolada, mais a pancada da bola.
  // Os parciais (múltiplos não inteiros da nota base) são os de uma barra vibrando: soam como metal.
  // Cada parcial vem em par levemente desafinado, para o brilho "tremer" enquanto morre.
  function trave(forca = 0.8, quando) {
    const t = agora(quando);
    const f = limitar(forca, 0, 1);
    const v = sorteio(0.97, 1.03);
    const destino = saida({ envio: 0.3, nivel: 0.45 + 0.55 * f, t, dur: 2 });
    baque(t, destino, { fIni: 230, fFim: 110, tempoQueda: 0.04, forca: 1, nivel: 0.45, queda: 0.03, corte: 1800 });
    toque(t, destino, { fIni: 520, fFim: 420, pico: 0.25, queda: 0.025 });
    estalo(t, destino, { freq: 2600, q: 0.9, pico: 1.8, queda: 0.005 });
    const PARCIAIS = [
      // razão, volume, queda (s): o segundo (~1,9 kHz) é o "plim" que fica soando
      [1, 0.2, 0.3],
      [2.756, 0.32, 0.42],
      [5.404, 0.18, 0.2],
      [8.933, 0.08, 0.1],
    ];
    const base = 690 * v;
    for (const [razao, vol, queda] of PARCIAIS) {
      for (const desafino of [0.9975, 1.0025]) {
        const o = ctx.createOscillator();
        o.frequency.value = base * razao * desafino;
        const g = ctx.createGain();
        const fim = pancada(g.gain, t, vol / 2, 0.0008, queda * (0.9 + 0.2 * f));
        serie(o, g, destino);
        o.start(t);
        o.stop(fim);
      }
    }
  }

  // Rede: o "chuá". Primeiro o "chu" (chiado agudo da bola entrando, que vai ficando grave), depois
  // o "á" (a rede segurando e soltando), com o crepitar das cordas e um baque abafado da bola.
  // O "ficando grave" é feito trocando o volume de duas faixas fixas (filtro que se move custa caro).
  function rede(forca = 0.8, quando) {
    const t = agora(quando);
    const f = limitar(forca, 0, 1);
    const destino = saida({ envio: 0.18, nivel: 0.5 + 0.5 * f, t, dur: 1.3 });
    const cordas = mono(0.65); // crepitar das cordas: o volume treme ~30 vezes por segundo
    modulador(t, cordas.gain, 7, 0.35, 1.3);
    cordas.connect(destino);
    const chiadoRede = fonte(ruido, t, 1.3);
    // "chu": faixa aguda que entra forte e some rápido
    const agudo = ctx.createGain();
    agudo.gain.setValueAtTime(0, t);
    agudo.gain.linearRampToValueAtTime(1.4, t + 0.022);
    agudo.gain.setValueAtTime(1.4, t + 0.05);
    agudo.gain.setTargetAtTime(0, t + 0.05, 0.08);
    serie(chiadoRede, filtro('bandpass', 3300, 0.8), agudo, cordas);
    // ... passando para uma faixa média, mais longa
    const medio = ctx.createGain();
    medio.gain.setValueAtTime(0, t);
    medio.gain.linearRampToValueAtTime(1.3, t + 0.06);
    medio.gain.setValueAtTime(1.3, t + 0.1);
    medio.gain.setTargetAtTime(0, t + 0.1, 0.17);
    serie(chiadoRede, filtro('bandpass', 1500, 0.8), medio, cordas);
    // "á": a rede devolvendo (vogal aberta, mais grave)
    const aberto = ctx.createGain();
    aberto.gain.setValueAtTime(0, t + 0.06);
    aberto.gain.linearRampToValueAtTime(0.9, t + 0.14);
    aberto.gain.setTargetAtTime(0, t + 0.14, 0.2);
    serie(chiadoRede, filtro('bandpass', 950, 1.4), aberto, cordas);
    // Baque da bola na rede
    baque(t, destino, { fIni: 140, fFim: 75, tempoQueda: 0.08, forca: 0.7, nivel: 0.45, queda: 0.06, corte: 800 });
  }

  // Barreira: bolada no corpo. "Póf" abafado (sem o estalo seco do pé) e o tapa na camisa.
  function barreira(forca = 0.8, quando) {
    const t = agora(quando);
    const f = limitar(forca, 0, 1);
    const destino = saida({ envio: 0.07, nivel: 0.42 + 0.5 * f, t });
    baque(t, destino, { fIni: 170, fFim: 80, tempoQueda: 0.06, forca: 1, nivel: 0.5, queda: 0.042, corte: 900 });
    toque(t, destino, { tipo: 'sine', fIni: 340, fFim: 250, tempoQueda: 0.06, pico: 0.65, queda: 0.035 });
    estalo(t, destino, { freq: 480, q: 0.7, pico: 2.4, queda: 0.03 });
    estalo(t, destino, { freq: 1300, q: 1.1, pico: 1.2, queda: 0.01 });
  }

  // Defesa do goleiro (força 0 a 1): o tapa da luva na bola. Forte = "pá!" seco de espalmada;
  // fraca = "tup" de encaixe.
  function defesa(forca = 0.6, quando) {
    const t = agora(quando);
    const f = limitar(forca, 0, 1);
    const destino = saida({ envio: 0.07, nivel: 0.36 + 0.5 * f, t });
    baque(t, destino, { fIni: 190, fFim: 100, tempoQueda: 0.05, forca: 0.6 + 0.4 * f, nivel: 0.4, queda: 0.022 + 0.014 * f, corte: 1200 });
    toque(t, destino, { fIni: 480 + 120 * f, fFim: 380 + 80 * f, pico: 0.3, queda: 0.02 });
    estalo(t, destino, { freq: 1000 + 900 * f, q: 0.9, pico: 1.2 + 1.1 * f, queda: 0.008 + 0.008 * f });
    estalo(t, destino, { freq: 3600, q: 1.2, pico: 0.7 * f, queda: 0.004 });
  }

  // Apito do juiz: tom de ~3 kHz que treme ~30 vezes por segundo (a bolinha dentro do apito),
  // mais o sopro. tipo: 'curto' (autoriza a cobrança), 'longo' ou 'fim' (dois curtos e um longo).
  function apito(tipo = 'curto', quando) {
    const t = agora(quando);
    soltarTensao(t, 0.3);
    const sopros = tipo === 'fim'
      ? [[0, 0.2], [0.34, 0.2], [0.68, 1]]
      : tipo === 'longo' ? [[0, 0.8]] : [[0, 0.24]];
    const destino = saida({ envio: 0.35, nivel: 0.19, t, dur: sopros[sopros.length - 1][0] + sopros[sopros.length - 1][1] });
    const nota = 2950 * sorteio(0.98, 1.02);
    for (const [inicio, dur] of sopros) {
      const t0 = t + inicio;
      const t1 = t0 + dur;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = sorteio(28, 36);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(1, t0 + 0.015);
      env.gain.setValueAtTime(1, t1 - 0.03);
      env.gain.linearRampToValueAtTime(0, t1);
      const tremor = ganho(0.75); // volume que treme com a bolinha
      serie(lfo, ganho(0.25), tremor.gain);
      serie(tremor, env, destino);
      for (const [multiplo, vol] of [[1, 1], [2, 0.12]]) {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(nota * multiplo * 0.93, t0); // entra um pouco abaixo e sobe
        o.frequency.exponentialRampToValueAtTime(nota * multiplo, t0 + 0.03);
        serie(lfo, ganho(nota * multiplo * 0.035), o.frequency);
        serie(o, ganho(vol), tremor);
        o.start(t0);
        o.stop(t1 + 0.01);
      }
      lfo.start(t0);
      lfo.stop(t1 + 0.01);
      // Sopro
      serie(fonte(ruido, t0, dur + 0.01), filtro('bandpass', 3300, 1.4), ganho(0.35), env);
    }
  }

  // ---------- Torcida ----------

  // Vozes da multidão: osciladores dente-de-serra (zumbido rico em harmônicos, como a voz) com
  // afinações espalhadas, cada um com seu atraso, tremido e desvio. Somados, viram um coro desafinado.
  // contorno: [[u, multiplicador da afinação]] ao longo do som (u de 0 a 1).
  function vozes(t, destino, { n, de, ate, dur, contorno, ataque = 0.08, nivel = 1 }) {
    const pontos = Math.max(8, Math.round(dur * 32));
    for (let k = 0; k < n; k++) {
      const base = de * Math.pow(ate / de, (k + aleatorio()) / n); // espalhado como numa escala musical
      const atraso = sorteio(0, 0.1);
      const fase = aleatorio() * 6.283;
      const vibrato = sorteio(4.5, 6.5);
      const profVibrato = sorteio(0.004, 0.012);
      const notas = new Float32Array(pontos);
      let desvio = 0;
      for (let i = 0; i < pontos; i++) {
        const u = i / (pontos - 1);
        desvio = (desvio + (aleatorio() - 0.5) * 0.008) * 0.97;
        notas[i] = base * interpolar(contorno, u) * (1 + desvio + profVibrato * Math.sin(fase + vibrato * u * dur * 6.283));
      }
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueCurveAtTime(notas, t + atraso, dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + atraso);
      g.gain.linearRampToValueAtTime((nivel * sorteio(0.5, 1)) / Math.sqrt(n), t + atraso + ataque * sorteio(0.7, 1.4));
      serie(o, g, destino);
      o.start(t + atraso);
      o.stop(t + atraso + dur);
    }
  }

  // Vogal: filtros fixos em paralelo nas frequências que dão cara de "u", "ô" ou "a" (os formantes).
  // Tudo num canal só (a largura vem das outras camadas e do eco). formantes: [[freq, Q, volume]]
  function vogal(formantes, destino) {
    const entrada = mono(1);
    for (const [f, q, g] of formantes) serie(entrada, filtro('bandpass', f, q), ganho(g), destino);
    return entrada;
  }

  function aplauso(t, dur, destino, { pico, ataque = 0.4, queda = 0.5 }) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(pico, t + ataque);
    g.gain.setTargetAtTime(0, t + Math.max(ataque, dur - queda * 4), queda);
    serie(fonte(preparar(), t, dur), filtro('highpass', 450), g, destino);
  }

  // Assobio de torcedor (intensidade ~0 a 1,5): "fiu-fiu", um longo que sobe e desce, ou um curto
  function assobio(t, intensidade) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = sorteio(1500, 2500);
    const vol = 0.06 * intensidade * sorteio(0.4, 1);
    const tipo = aleatorio();
    const p = o.frequency;
    g.gain.setValueAtTime(0, t);
    let fim;
    if (tipo < 0.35) {
      // fiu-fiu
      p.setValueAtTime(f * 0.75, t);
      p.exponentialRampToValueAtTime(f * 1.1, t + 0.12);
      g.gain.linearRampToValueAtTime(vol, t + 0.03);
      g.gain.linearRampToValueAtTime(0, t + 0.13);
      p.setValueAtTime(f * 0.7, t + 0.2);
      p.exponentialRampToValueAtTime(f * 1.2, t + 0.36);
      p.exponentialRampToValueAtTime(f * 0.85, t + 0.62);
      g.gain.setValueAtTime(0, t + 0.2);
      g.gain.linearRampToValueAtTime(vol, t + 0.24);
      g.gain.linearRampToValueAtTime(0, t + 0.62);
      fim = t + 0.64;
    } else if (tipo < 0.75) {
      const dur = sorteio(0.5, 1.1);
      p.setValueAtTime(f * 0.8, t);
      p.exponentialRampToValueAtTime(f * 1.15, t + dur * 0.4);
      p.exponentialRampToValueAtTime(f * 0.9, t + dur);
      g.gain.linearRampToValueAtTime(vol, t + 0.06);
      g.gain.setValueAtTime(vol, t + dur - 0.1);
      g.gain.linearRampToValueAtTime(0, t + dur);
      fim = t + dur + 0.02;
    } else {
      p.setValueAtTime(f, t);
      p.exponentialRampToValueAtTime(f * 1.25, t + 0.18);
      g.gain.linearRampToValueAtTime(vol, t + 0.02);
      g.gain.linearRampToValueAtTime(0, t + 0.2);
      fim = t + 0.22;
    }
    serie(o, g, panorama(sorteio(-0.8, 0.8)), saida({ bus: busTorcida, envio: 0.6, t, dur: fim - t }));
    o.start(t);
    o.stop(fim);
  }

  // Grito solto de um torcedor, longe ("ê!", "vai!", "ô-ô!"): uma voz (dente-de-serra com um pouco de
  // sopro) com cara de vogal, que sobe e cai de afinação. Baixinho e com eco, some no meio da torcida.
  const VOGAIS = [[800, 1250], [480, 1850], [520, 900], [640, 1700], [350, 2100]]; // a, ê, ô, é, i
  function grito(t, intensidade) {
    const [f1, f2] = VOGAIS[Math.floor(aleatorio() * VOGAIS.length)];
    const silabas = aleatorio() < 0.35 ? 2 : 1;
    const durSilaba = sorteio(0.18, 0.4);
    const dur = silabas * (durSilaba + 0.08);
    const destino = saida({ bus: busTorcida, envio: 0.5, nivel: 0.055 * intensidade * sorteio(0.5, 1), t, dur });
    const voz = vogal([[f1, 5, 1], [f2, 6, 0.55]], serie(filtro('lowpass', 2600), panorama(sorteio(-0.9, 0.9)), destino));
    const tom = sorteio(170, 320);
    for (let k = 0; k < silabas; k++) {
      const t0 = t + k * (durSilaba + 0.08);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const notas = new Float32Array(12);
      for (let i = 0; i < 12; i++) {
        const u = i / 11;
        notas[i] = tom * (k ? 0.9 : 1) * (1 + 0.12 * Math.sin(Math.PI * Math.min(1, u * 1.6)) - 0.15 * u) * (1 + (aleatorio() - 0.5) * 0.02);
      }
      o.frequency.setValueCurveAtTime(notas, t0, durSilaba);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(1, t0 + 0.03);
      g.gain.setValueAtTime(1, t0 + durSilaba * 0.6);
      g.gain.linearRampToValueAtTime(0, t0 + durSilaba);
      serie(o, g, voz);
      serie(fonte(ruido, t0, durSilaba), ganho(0.5), g);
      o.start(t0);
      o.stop(t0 + durSilaba);
    }
  }

  // Bumbo da torcida organizada, longe. Toca várias vezes por segundo, então cada batida é
  // calculada uma vez só (bufferBumbo, já com o eco) e depois só é repetida: 2 nós por batida.
  let bumbos = null;
  let saidaBumbo = null;
  function batidaBumbo(t, forca, grave) {
    if (!bumbos) {
      bumbos = [bufferBumbo(ctx, true, aleatorio), bufferBumbo(ctx, false, aleatorio)];
      saidaBumbo = panorama(-0.35);
      saidaBumbo.connect(busTorcida);
    }
    const s = ctx.createBufferSource();
    s.buffer = bumbos[grave ? 0 : 1];
    s.playbackRate.value = sorteio(0.98, 1.02);
    serie(s, ganho(0.3 * forca), saidaBumbo);
    s.start(t);
  }

  // ----- Ambiente: o chiado de fundo de um estádio cheio -----
  // Três faixas (rumor grave, vozes, gritos agudos), cada uma subindo e descendo em ondas lentas
  // independentes, mais um tremido rápido (o "falatório" de milhares de pessoas) e uma onda geral
  // bem lenta (a arquibancada inteira esquentando e esfriando).
  const CAMADAS = [
    // centro (Hz) e Q da faixa, volume, ondas lentas [velocidade, profundidade], tremido [velocidade, profundidade]
    { f: 300, q: 0.75, ganho: 1, lenta: [0.07, 0.4], rapida: [0, 0] },
    { f: 850, q: 0.9, ganho: 0.75, lenta: [0.09, 0.45], rapida: [1.7, 0.18] },
    { f: 2300, q: 1.1, ganho: 0.42, lenta: [0.12, 0.55], rapida: [2.6, 0.25], agudo: true },
  ];
  const NIVEL_AMBIENTE = 0.42;
  const ambiente = { saida: null, agudo: null, fontes: [], alvo: 0, desligarEm: Infinity };
  const eventos = { assobio: 0, grito: 0, tocando: false, troca: 0, batida: 0, passo: 0, bpm: 104, padrao: null };
  // Batidas do bumbo em colcheias (0 = pausa; 1 = forte e grave)
  const PADROES = [
    [1, 0, 0, 0.7, 1, 0, 0.7, 0],
    [1, 0, 0.6, 0.6, 1, 0, 0, 0],
    [1, 0, 0.6, 0, 1, 0.5, 0.6, 0],
  ];

  function ligarAmbiente(t) {
    const s = ganho(0);
    const ondas = ganho(1);
    serie(ondas, filtro('lowpass', 4200, 0.5), s, busTorcida);
    const fontes = [modulador(t, ondas.gain, 0.06, 0.4)];
    let agudo = null;
    for (const c of CAMADAS) {
      const g = ganho(c.ganho);
      const src = fonte(ruidoEstereo, t, 0);
      serie(src, filtro('bandpass', c.f, c.q), g);
      if (c.agudo) {
        agudo = ganho(0.5); // a faixa aguda cresce com o nível: torcida quente é mais estridente
        serie(g, agudo, ondas);
      } else {
        g.connect(ondas);
      }
      fontes.push(src, modulador(t, g.gain, c.lenta[0], c.ganho * c.lenta[1]));
      if (c.rapida[0]) fontes.push(modulador(t, g.gain, c.rapida[0], c.ganho * c.rapida[1]));
    }
    Object.assign(ambiente, { saida: s, agudo, fontes, desligarEm: Infinity });
    eventos.assobio = t + sorteio(1.5, 5);
    eventos.grito = t + sorteio(1, 4);
    eventos.tocando = false;
    eventos.troca = t + sorteio(3, 9);
  }
  function desligarAmbiente() {
    for (const f of ambiente.fontes) f.stop();
    ambiente.saida.disconnect();
    Object.assign(ambiente, { saida: null, agudo: null, fontes: [], alvo: 0, desligarEm: Infinity });
  }

  // nivel de 0 (silêncio) a 1 (estádio fervendo); muda devagar
  function torcidaAmbiente(nivel = 0.5, quando) {
    const t = agora(quando);
    const n = limitar(nivel, 0, 1);
    if (ambiente.saida && Math.abs(n - ambiente.alvo) < 0.002) return;
    if (n > 0 && !ambiente.saida) ligarAmbiente(t);
    if (!ambiente.saida) return;
    ambiente.alvo = n;
    segurar(ambiente.saida.gain, t);
    ambiente.saida.gain.setTargetAtTime(NIVEL_AMBIENTE * n, t, 0.7);
    segurar(ambiente.agudo.gain, t);
    ambiente.agudo.gain.setTargetAtTime(0.35 + 0.65 * n, t, 0.7);
    ambiente.desligarEm = n > 0 ? Infinity : t + 5; // em silêncio, desliga tudo (economiza bateria)
  }

  // Agenda os detalhes da torcida (assobios e bumbo) até o tempo tFim. Chamado de tempos em tempos.
  function agendarAte(tFim) {
    const t = ctx.currentTime;
    cochilarEco();
    if (ambiente.saida && t > ambiente.desligarEm) desligarAmbiente();
    if (!ambiente.saida || ambiente.alvo <= 0) return;
    const c = config();
    const n = ambiente.alvo;
    // Assobios soltos
    if (eventos.assobio < t) eventos.assobio = t + 0.05; // ficou para trás (aba escondida, travada)
    while (eventos.assobio < tFim) {
      if (c.assobios > 0) assobio(eventos.assobio, c.assobios * (0.25 + 0.75 * n));
      eventos.assobio += sorteio(2.5, 8) / (0.5 + n);
    }
    // Gritos soltos
    if (eventos.grito < t) eventos.grito = t + 0.05;
    while (eventos.grito < tFim) {
      if (c.gritos > 0) grito(eventos.grito, c.gritos * (0.3 + 0.7 * n));
      eventos.grito += sorteio(1.5, 6) / (0.5 + n);
    }
    // Bumbo: toca uns 15–30 s, descansa uns 8–20 s
    for (let seguranca = 0; seguranca < 200; seguranca++) {
      if (!eventos.tocando) {
        if (eventos.troca < t) eventos.troca = t + 0.05;
        if (eventos.troca >= tFim) break;
        eventos.tocando = true;
        eventos.batida = eventos.troca;
        eventos.passo = 0;
        eventos.bpm = sorteio(96, 112);
        eventos.padrao = PADROES[Math.floor(aleatorio() * PADROES.length)];
        eventos.troca = eventos.batida + sorteio(15, 30);
        continue;
      }
      const colcheia = 30 / eventos.bpm;
      while (eventos.batida < t - 0.02) {
        eventos.batida += colcheia;
        eventos.passo++;
      }
      if (eventos.batida >= tFim) break;
      if (eventos.batida >= eventos.troca && eventos.passo % 8 === 0) {
        eventos.tocando = false;
        eventos.troca = eventos.batida + sorteio(8, 20);
        continue;
      }
      const forca = eventos.padrao[eventos.passo % 8];
      if (forca > 0 && c.bumbo > 0) {
        batidaBumbo(eventos.batida, forca * limitar(c.bumbo, 0, 1.5) * n * sorteio(0.85, 1), forca >= 1);
      }
      eventos.batida += colcheia;
      eventos.passo++;
    }
  }

  // ----- Tensão: o "ôôôô" que cresce enquanto o cobrador corre para a bola -----
  // Sobe durante `duracao` s, segura enquanto a bola voa e some sozinho (ou quando vem o gol, o "uuuh" ou o apito).
  let tensao = null;
  function torcidaTensao(duracao = 0.9, quando) {
    const t = agora(quando);
    soltarTensao(t, 0.08);
    const subida = limitar(duracao, 0.3, 3);
    const dur = subida + 3.4;
    const destino = saida({ bus: busTorcida, envio: 0.12, nivel: 0.75, t, dur });
    const env = ganho(0);
    env.connect(destino);
    const g = env.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(0.1, t + 0.12);
    g.exponentialRampToValueAtTime(1, t + subida);       // cresce cada vez mais rápido
    g.linearRampToValueAtTime(0.8, t + subida + 1.6);    // a bola no ar: prende a respiração
    g.setTargetAtTime(0, t + subida + 1.6, 0.4);         // nada aconteceu: o murmúrio some
    const tremido = ganho(0.85);
    modulador(t, tremido.gain, 1.9, 0.15, dur);
    tremido.connect(env);
    const voz = vogal([[500, 2.4, 1], [930, 3, 0.6], [2500, 4, 0.1]], tremido); // "ô"
    serie(fonte(ruido, t, dur), ganho(1.6), voz);
    vozes(t, voz, {
      n: 6, de: 120, ate: 210, dur,
      contorno: [[0, 0.94], [subida / dur, 1.1], [1, 1.04]], ataque: 0.25, nivel: 0.7,
    });
    // Rumor grave de muita gente, com a largura do estéreo
    serie(fonte(ruidoEstereo, t, dur), filtro('lowpass', 320), ganho(0.6), env);
    tensao = { env, fim: t + dur };
  }
  function soltarTensao(t, tau) {
    if (!tensao) return;
    if (t < tensao.fim) {
      segurar(tensao.env.gain, t);
      tensao.env.gain.setTargetAtTime(0, t, tau);
    }
    tensao = null;
  }

  // ----- Gol: a arquibancada explode ("AAAAH!") e o grito vai baixando em 3–4 s -----
  function torcidaGol(quando) {
    const t = agora(quando);
    soltarTensao(t, 0.15);
    const DUR = 4.4;
    const destino = saida({ bus: busTorcida, envio: 0.3, t, dur: DUR });
    const env = ganho(0);
    env.connect(destino);
    const g = env.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(0.4, t + 0.07);   // o primeiro grito
    g.linearRampToValueAtTime(1, t + 0.32);     // a explosão
    g.linearRampToValueAtTime(0.82, t + 1.3);
    g.setTargetAtTime(0, t + 1.3, 0.72);
    const tremido = ganho(0.85);
    modulador(t, tremido.gain, 2.4, 0.15, DUR);
    tremido.connect(env);
    // Rugido: chiado largo com cor de "aaa". O agudo (grito) cansa antes: o rugido vai ficando grave.
    const agudo = ctx.createGain();
    agudo.gain.setValueAtTime(1, t);
    agudo.gain.setTargetAtTime(0.3, t + 0.5, 1);
    serie(fonte(ruidoEstereo, t, DUR), filtro('bandpass', 1400, 0.5), agudo, tremido);
    // "AAAA": formantes de "a" no chiado e nas vozes (gritando = afinação alta)
    const voz = vogal([[800, 2.5, 1], [1250, 3, 0.75], [2700, 4, 0.3]], tremido);
    serie(fonte(ruido, t, DUR), ganho(1.3), voz);
    vozes(t, voz, {
      n: 9, de: 210, ate: 440, dur: DUR,
      contorno: [[0, 0.85], [0.07, 1.1], [0.3, 1], [1, 0.82]], ataque: 0.2, nivel: 1.1,
    });
    // Grave: gente pulando na arquibancada
    serie(fonte(ruidoEstereo, t, DUR), filtro('lowpass', 220), ganho(0.75), env);
    // Aplausos e assobios por cima
    aplauso(t + 0.5, DUR - 0.5, destino, { pico: 0.55, ataque: 0.6, queda: 0.6 });
    for (let k = 0; k < 4; k++) assobio(t + sorteio(0.3, 2.4), 1.4);
  }

  // ----- "Uuuh": a bola passou raspando (ou o goleiro fez milagre) -----
  // Um "u" da multidão que vem de susto e vai descendo de afinação, e uns aplausos pela tentativa.
  function torcidaUhh(quando) {
    const t = agora(quando);
    soltarTensao(t, 0.1);
    const DUR = 2.6;
    const destino = saida({ bus: busTorcida, envio: 0.25, t, dur: DUR });
    const env = ganho(0);
    env.connect(destino);
    const g = env.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(1, t + 0.15);
    g.linearRampToValueAtTime(0.78, t + 0.65);
    g.setTargetAtTime(0, t + 0.65, 0.42);
    const tremido = ganho(0.88);
    modulador(t, tremido.gain, 2, 0.12, DUR);
    tremido.connect(env);
    const voz = vogal([[330, 3, 1], [800, 4, 0.6], [2400, 5, 0.12]], tremido); // "u"
    serie(fonte(ruido, t, DUR), ganho(2), voz);
    vozes(t, voz, {
      n: 8, de: 135, ate: 270, dur: DUR,
      contorno: [[0, 0.92], [0.06, 1.07], [0.25, 1], [1, 0.72]], ataque: 0.1, nivel: 1.2,
    });
    serie(fonte(ruidoEstereo, t, DUR), filtro('lowpass', 280), ganho(0.55), env);
    aplauso(t + 0.6, 2.4, destino, { pico: 0.22, ataque: 0.5, queda: 0.4 });
  }

  return {
    chute, quique, trave, rede, barreira, defesa, apito,
    torcidaAmbiente, torcidaTensao, torcidaGol, torcidaUhh,
    agendarAte, aplicarVolumes, definirMudo, preparar,
    saida: mestre,
  };
}

// ---------- Mudo salvo no aparelho ----------

function lerMudo() {
  try {
    return localStorage.getItem(CHAVE_MUDO) === '1';
  } catch {
    return false;
  }
}
function salvarMudo(sim) {
  try {
    localStorage.setItem(CHAVE_MUDO, sim ? '1' : '0');
  } catch {
    // sem armazenamento (aba anônima, bloqueado): só não lembra
  }
}

// ---------- O som do jogo ----------
// cfg: o CONFIG do jogo (opcional; lê cfg.audio na hora, então o painel muda o volume ao vivo).
// opcoes.contexto: um contexto pronto (os testes passam um OfflineAudioContext); opcoes.aleatorio.

export function criarAudio(cfg = null, opcoes = {}) {
  const temJanela = typeof window !== 'undefined';
  const Contexto = temJanela ? window.AudioContext || window.webkitAudioContext : null;
  const contextoFixo = opcoes.contexto || null;
  const disponivel = Boolean(contextoFixo || Contexto);
  let ctx = null;
  let motor = null;
  let falhou = false;
  let mudo = lerMudo();
  let nivelAmbiente = 0;
  let retomandoAte = 0; // pouco depois de pedir para retomar, os sons já valem (o contexto liga em instantes)
  let esperaSuspender = null;
  let ultimoTique = 0;
  const relogio = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function aviso(e) {
    if (typeof console !== 'undefined') console.warn('[som]', e);
  }

  function criarContexto() {
    try {
      return new Contexto({ latencyHint: 'interactive' });
    } catch {
      try {
        return new Contexto();
      } catch (e) {
        aviso(e);
        return null;
      }
    }
  }

  // Retoma o contexto (precisa vir de um toque na primeira vez). Se o navegador não deixar, a
  // promessa fica parada: por isso a janela de "retomando" é curta (senão os sons se acumulariam
  // e tocariam todos juntos quando o som enfim ligasse).
  function retomar() {
    if (!ctx || contextoFixo || ctx.state === 'running' || ctx.state === 'closed') return;
    retomandoAte = relogio() + 400;
    try {
      Promise.resolve(ctx.resume()).catch(() => {});
    } catch {
      retomandoAte = 0;
    }
  }

  // iPhone antigo: tocar um som vazio dentro do toque destrava o áudio de vez
  function destravar() {
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch {
      // nada a fazer
    }
  }

  function iniciar() {
    if (!disponivel || falhou) return;
    try {
      if (!ctx) {
        ctx = contextoFixo || criarContexto();
        if (!ctx) {
          falhou = true;
          return;
        }
        motor = montarMotor(ctx, { cfg, aleatorio: opcoes.aleatorio || Math.random });
        motor.definirMudo(mudo, true);
        if (nivelAmbiente > 0) motor.torcidaAmbiente(nivelAmbiente);
        if (!contextoFixo) {
          setInterval(tique, 250);
          setTimeout(() => motor && motor.preparar(), 1500);
          if (typeof document !== 'undefined') document.addEventListener('visibilitychange', aoMudarVisibilidade);
        }
      }
      if (mudo) {
        // Mudo desde o começo: deixa o áudio parado (o contexto pode estar ligando neste instante)
        if (!contextoFixo && ctx.state !== 'closed') ctx.suspend().catch(() => {});
      } else {
        retomar();
        if (!contextoFixo) destravar();
      }
    } catch (e) {
      aviso(e);
      falhou = true;
      motor = null;
    }
  }

  // Tela apagada ou outra aba: pausa o som (economiza bateria); na volta, retoma
  function aoMudarVisibilidade() {
    if (!ctx) return;
    if (document.hidden) {
      if (ctx.state === 'running') ctx.suspend().catch(() => {});
    } else if (!mudo) {
      retomar();
    }
  }

  // Detalhes da torcida (assobios, bumbo) e volumes do painel
  function tique() {
    ultimoTique = relogio();
    if (!motor || mudo || !ctx || (!contextoFixo && ctx.state !== 'running')) return;
    try {
      motor.aplicarVolumes();
      motor.agendarAte(ctx.currentTime + 0.6);
    } catch (e) {
      aviso(e);
    }
  }

  const pronto = () => motor && !mudo && (contextoFixo || ctx.state === 'running' || relogio() < retomandoAte);
  const tocar = (nome) => (...args) => {
    if (!pronto()) return;
    try {
      motor[nome](...args);
    } catch (e) {
      aviso(e);
    }
  };

  // Garante o destravamento mesmo que o jogo chame iniciar() num evento que o celular não aceita
  // (no toque, só o "soltar o dedo" vale como gesto para liberar som).
  if (Contexto && !contextoFixo && typeof document !== 'undefined') {
    const aoTocar = () => {
      if (!ctx || (!mudo && ctx.state !== 'running')) iniciar();
    };
    for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) {
      document.addEventListener(ev, aoTocar, { capture: true, passive: true });
    }
  }

  return {
    iniciar,
    get mudo() {
      return mudo;
    },
    set mudo(sim) {
      mudo = Boolean(sim);
      salvarMudo(mudo);
      if (!motor) return;
      try {
        clearTimeout(esperaSuspender);
        motor.definirMudo(mudo);
        if (contextoFixo) return;
        if (mudo) {
          // Depois do volume chegar a zero, para o áudio de vez (economiza bateria)
          esperaSuspender = setTimeout(() => {
            if (mudo && ctx.state === 'running') ctx.suspend().catch(() => {});
          }, 300);
        } else {
          retomar();
          destravar();
        }
      } catch (e) {
        aviso(e);
      }
    },
    get disponivel() {
      return disponivel && !falhou;
    },
    // 'sem-audio', 'parado' (antes do primeiro toque), 'suspended', 'running', 'interrupted'...
    get estado() {
      if (!disponivel || falhou) return 'sem-audio';
      return ctx ? ctx.state : 'parado';
    },
    get contexto() {
      return ctx;
    },
    chute: tocar('chute'),
    quique: tocar('quique'),
    trave: tocar('trave'),
    rede: tocar('rede'),
    barreira: tocar('barreira'),
    defesa: tocar('defesa'),
    apito: tocar('apito'),
    torcidaTensao: tocar('torcidaTensao'),
    torcidaGol: tocar('torcidaGol'),
    torcidaUhh: tocar('torcidaUhh'),
    torcidaAmbiente(nivel) {
      nivelAmbiente = limitar(Number(nivel) || 0, 0, 1);
      if (!motor) return;
      try {
        motor.torcidaAmbiente(nivelAmbiente);
      } catch (e) {
        aviso(e);
      }
    },
    // Opcional (o som funciona sem): chamar a cada quadro deixa assobios, bumbo e volumes do painel em dia
    atualizar() {
      if (relogio() - ultimoTique > 100) tique();
    },
  };
}
