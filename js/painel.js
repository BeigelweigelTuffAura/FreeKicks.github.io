// Painel de ajuste: sliders que mudam os números do CONFIG na hora.
// Os valores ficam salvos no aparelho até a próxima versão do jogo.

const CAMPOS = [
  { secao: 'Chute' },
  { chave: 'velocidadeMin', rotulo: 'Velocidade com a barra vazia (m/s)', min: 8, max: 22, passo: 0.5 },
  { chave: 'velocidadeMax', rotulo: 'Velocidade com a barra cheia (m/s)', min: 22, max: 45, passo: 0.5 },
  { chave: 'elevacaoBase', rotulo: 'Ângulo de saída da bola (graus)', min: 5, max: 30, passo: 0.5 },
  { chave: 'tempoCarga', rotulo: 'Tempo para encher a barra (s)', min: 0.5, max: 2.5, passo: 0.05 },

  { secao: 'Mira e erro' },
  { chave: 'erroMiraBase', rotulo: 'Tamanho do cone de erro (graus)', min: 0, max: 3, passo: 0.05 },
  { chave: 'forcaIdeal', rotulo: 'Ponto ideal da barra de força', min: 0.5, max: 1, passo: 0.01 },
  { chave: 'erroAcimaIdeal', rotulo: 'Erro a mais com a barra cheia', min: 0, max: 5, passo: 0.1 },
  { chave: 'pesoAtributos', rotulo: 'Peso dos atributos (diferença entre nota 60 e 99)', min: 0, max: 0.4, passo: 0.01 },
  { chave: 'mira.sensibilidade', rotulo: 'Sensibilidade da mira no dedo', min: 0.3, max: 2, passo: 0.05 },

  { secao: 'Ponto de contato' },
  { chave: 'giroLateralMax', rotulo: 'Força da curva', min: 0, max: 120, passo: 1 },
  { chave: 'giroVerticalMax', rotulo: 'Força da queda (pé em cima)', min: 0, max: 100, passo: 1 },
  { chave: 'giroEmbaixoMax', rotulo: 'Flutuação (pé embaixo)', min: 0, max: 60, passo: 1 },
  { chave: 'elevacaoContatoEmbaixo', rotulo: 'Pé embaixo: graus a mais na saída', min: 0, max: 15, passo: 0.5 },
  { chave: 'elevacaoCavadinha', rotulo: 'Pé bem embaixo: graus a mais (cavadinha)', min: 0, max: 30, passo: 0.5 },
  { chave: 'elevacaoContatoEmCima', rotulo: 'Pé em cima: graus a menos na saída', min: 0, max: 15, passo: 0.5 },
  { chave: 'rasteiroInicio', rotulo: 'Altura do contato onde a bola começa a sair baixa', min: 0.4, max: 0.8, passo: 0.01 },
  { chave: 'elevacaoRasteiro', rotulo: 'Ângulo do chute rasteiro (graus)', min: -3, max: 8, passo: 0.5 },
  { chave: 'perdaVelocidadeContato', rotulo: 'Velocidade perdida ao bater na borda', min: 0, max: 0.5, passo: 0.01 },

  { secao: 'Folha seca, trivela e sem rotação' },
  { chave: 'quedaTardia', rotulo: 'Folha seca: quanto a queda cresce no fim', min: 0, max: 10, passo: 0.5 },
  { chave: 'quedaTardiaInicio', rotulo: 'Folha seca: queda logo depois do chute (fração)', min: 0.1, max: 1, passo: 0.05 },
  { chave: 'trivelaGiro', rotulo: 'Trivela de quem não é especialista: fração da curva', min: 0.2, max: 1.2, passo: 0.05 },
  { chave: 'trivelaTardia', rotulo: 'Trivela de especialista: quanto a curva fica para o fim', min: 0, max: 6, passo: 0.5 },
  { chave: 'semRotacaoAmplitude', rotulo: 'Sem rotação: quanto a bola dança', min: 0, max: 15, passo: 0.5 },
  { chave: 'semRotacaoEspecialista', rotulo: 'Sem rotação: dança do especialista (vezes)', min: 0.5, max: 3, passo: 0.1 },
  { chave: 'semRotacaoQueda', rotulo: 'Sem rotação: queda de repente no fim (m/s²)', min: 0, max: 10, passo: 0.5 },

  { secao: 'Goleiro' },
  { chave: 'goleiro.reflexo', rotulo: 'Tempo de reação (s)', min: 0.1, max: 0.6, passo: 0.01 },
  { chave: 'goleiro.erroLeitura', rotulo: 'Erro ao ler a bola (m, mais = mais gols)', min: 0, max: 1.2, passo: 0.05 },
  { chave: 'goleiro.velocidadeMergulho', rotulo: 'Velocidade do mergulho (m/s)', min: 2.5, max: 7, passo: 0.1 },
  { chave: 'goleiro.alcance', rotulo: 'Alcance dos braços (m)', min: 0.5, max: 1.2, passo: 0.01 },
  { chave: 'goleiro.alturaMaxima', rotulo: 'Altura máxima das mãos no pulo (m)', min: 2, max: 2.8, passo: 0.01 },
  { chave: 'goleiro.atrasoBarreira', rotulo: 'Atraso quando a barreira tapa a visão (s)', min: 0, max: 0.3, passo: 0.01 },
  { chave: 'goleiro.pesoCurva', rotulo: 'Quanto a curva engana', min: 0, max: 5, passo: 0.1 },
  { chave: 'goleiro.pesoSemRotacao', rotulo: 'Quanto a bola sem rotação engana', min: 0, max: 3, passo: 0.1 },
  { chave: 'goleiro.velocidadeSegura', rotulo: 'Bola mais rápida que ele ainda encaixa (m/s)', min: 5, max: 25, passo: 0.5 },
  { chave: 'goleiro.deslocamento', rotulo: 'Quanto vai para o lado sem barreira (m)', min: 0, max: 1.5, passo: 0.05 },

  { secao: 'Barreira' },
  { chave: 'barreira.chancePulo', rotulo: 'Chance de pular', min: 0, max: 1, passo: 0.05 },
  { chave: 'barreira.altura', rotulo: 'Altura média dos jogadores (m)', min: 1.6, max: 2.1, passo: 0.01 },
  { chave: 'barreira.alturaPulo', rotulo: 'Altura do pulo (m)', min: 0.05, max: 0.7, passo: 0.01 },
  { chave: 'barreira.atrasoPulo', rotulo: 'Atraso do pulo depois do chute (s)', min: 0.05, max: 0.4, passo: 0.01 },
  { chave: 'barreira.sobraTrave', rotulo: 'Quanto passa da trave (m)', min: -0.5, max: 1, passo: 0.05 },

  { secao: 'Gramado e gol' },
  { chave: 'quiqueChao', rotulo: 'Quique no gramado (batida lenta)', min: 0.2, max: 0.9, passo: 0.05 },
  { chave: 'atritoDeslize', rotulo: 'Atrito da grama com a bola escorregando', min: 0.05, max: 1, passo: 0.05 },
  { chave: 'atritoGrama', rotulo: 'Freada da bola rolando (m/s²)', min: 0.5, max: 5, passo: 0.1 },
  { chave: 'quiqueTrave', rotulo: 'Quanto a bola volta ao bater na trave', min: 0, max: 1, passo: 0.05 },
  { chave: 'redeRigidez', rotulo: 'Rigidez da rede (menor = estufa mais)', min: 500, max: 8000, passo: 100 },

  { secao: 'Cobrador e câmera de trás' },
  { chave: 'cobrador.distancia', rotulo: 'Distância da corrida (m)', min: 0.8, max: 4, passo: 0.1 },
  { chave: 'cobrador.angulo', rotulo: 'Ângulo da corrida (graus)', min: 0, max: 60, passo: 1 },
  { chave: 'cobrador.corrida', rotulo: 'Tempo correndo (s)', min: 0.15, max: 1.2, passo: 0.05 },
  { chave: 'cobrador.chute', rotulo: 'Tempo do chute (s, contato em 55%)', min: 0.45, max: 1.4, passo: 0.05 },
  { chave: 'camera.pesoCobrador', rotulo: 'Câmera: atrás da bola (0) ou do cobrador (1)', min: 0, max: 1, passo: 0.05 },
  { chave: 'camera.atras', rotulo: 'Câmera: distância para trás (m)', min: 3, max: 12, passo: 0.25 },
  { chave: 'camera.altura', rotulo: 'Câmera: altura (m)', min: 1.2, max: 5, passo: 0.1 },
  { chave: 'camera.larguraVisivel', rotulo: 'Câmera: largura visível (graus, menos = mais zoom)', min: 16, max: 40, passo: 0.5 },

  { secao: 'Câmera aérea' },
  { chave: 'camera.aerea', rotulo: 'Câmera aérea depois do chute', tipo: 'liga' },
  { chave: 'camera.aereaAltura', rotulo: 'Aérea: altura (m)', min: 4, max: 30, passo: 0.5 },
  { chave: 'camera.aereaAtras', rotulo: 'Aérea: distância atrás da bola (m)', min: -5, max: 20, passo: 0.5 },
  { chave: 'camera.aereaLado', rotulo: 'Aérea: quanto fica de lado (m)', min: 0, max: 20, passo: 0.5 },
  { chave: 'camera.aereaAlvo', rotulo: 'Aérea: para onde olha (0 = bola, 1 = gol)', min: 0, max: 1, passo: 0.05 },
  { chave: 'camera.aereaAproxima', rotulo: 'Aérea: quanto anda junto com a bola', min: 0, max: 0.9, passo: 0.05 },
  { chave: 'camera.aereaTransicao', rotulo: 'Aérea: tempo da troca de câmera (s, 0 = corte seco)', min: 0, max: 1.5, passo: 0.05 },
  { chave: 'rastro', rotulo: 'Rastro atrás da bola', tipo: 'liga' },
  { chave: 'camera.cameraLenta', rotulo: 'Câmera lenta perto do gol', tipo: 'liga' },
  { chave: 'camera.cameraLentaFator', rotulo: 'Câmera lenta: velocidade do tempo (1 = normal)', min: 0.1, max: 1, passo: 0.05 },
  { chave: 'camera.cameraLentaDuracao', rotulo: 'Câmera lenta: duração (s de jogo)', min: 0.1, max: 1.5, passo: 0.05 },
  { chave: 'camera.cameraLentaDistancia', rotulo: 'Câmera lenta: começa a quantos m do gol', min: 1, max: 10, passo: 0.5 },
  { chave: 'replay', rotulo: 'Gravar o vídeo do gol (replay)', tipo: 'liga' },

  { secao: 'Som' },
  { chave: 'audio.volume', rotulo: 'Volume geral', min: 0, max: 1, passo: 0.05 },
  { chave: 'audio.volumeEfeitos', rotulo: 'Volume dos efeitos (chute, trave, rede, apito)', min: 0, max: 1.5, passo: 0.05 },
  { chave: 'audio.volumeTorcida', rotulo: 'Volume da torcida', min: 0, max: 1.5, passo: 0.05 },
  { chave: 'audio.eco', rotulo: 'Eco do estádio (0 = seco)', min: 0, max: 1, passo: 0.05 },
  { chave: 'audio.bumbo', rotulo: 'Bumbo da torcida (0 = sem)', min: 0, max: 1.5, passo: 0.05 },
  { chave: 'audio.assobios', rotulo: 'Assobios na arquibancada (0 = nenhum)', min: 0, max: 1.5, passo: 0.05 },
  { chave: 'audio.gritos', rotulo: 'Gritos soltos de torcedor (0 = nenhum)', min: 0, max: 1.5, passo: 0.05 },

  { secao: 'Rede, trave e torcida' },
  { chave: 'cenario.redeFirmeza', rotulo: 'Rede: firmeza (mais = ondas rápidas, volta logo)', min: 1, max: 12, passo: 0.5 },
  { chave: 'cenario.redeFreio', rotulo: 'Rede: freio do balanço (menos = balança mais vezes)', min: 0, max: 6, passo: 0.1 },
  { chave: 'cenario.redePeso', rotulo: 'Rede: peso (mais = mais caída e lenta)', min: 0.3, max: 3, passo: 0.1 },
  { chave: 'cenario.redeEstufa', rotulo: 'Rede: quanto o fundo estufa além da bola', min: 0, max: 2, passo: 0.1 },
  { chave: 'cenario.redeBarriga', rotulo: 'Rede: fundo inteiro estufa junto com a bolsa', min: 0, max: 2, passo: 0.1 },
  { chave: 'cenario.redeBalanco', rotulo: 'Rede: tranco no teto e nas laterais no gol', min: 0, max: 3, passo: 0.1 },
  { chave: 'cenario.redeEmpurrao', rotulo: 'Rede: tranco da bola batendo por fora', min: 0, max: 2, passo: 0.1 },
  { chave: 'cenario.traveTremor', rotulo: 'Trave: quanto o gol treme', min: 0, max: 3, passo: 0.1 },
  { chave: 'cenario.festaSegura', rotulo: 'Torcida: tempo no auge da festa (s)', min: 0.5, max: 4, passo: 0.1 },
  { chave: 'cenario.festaDuracao', rotulo: 'Torcida: tempo para acalmar (s)', min: 1, max: 8, passo: 0.5 },
  { chave: 'cenario.festaPlacas', rotulo: 'Placas GOOOL: duração (s)', min: 0.5, max: 2, passo: 0.1 },

  { secao: 'Ar e gravidade' },
  { chave: 'gravidade', rotulo: 'Gravidade', min: 5, max: 15, passo: 0.1 },
  { chave: 'arrasto', rotulo: 'Resistência do ar', min: 0, max: 0.03, passo: 0.001 },
  { chave: 'magnus', rotulo: 'Quanto o giro desvia a bola', min: 0, max: 0.012, passo: 0.0005 },

  { secao: 'Posição da falta (fixa a falta)' },
  { chave: 'falta.distancia', rotulo: 'Distância do gol (m)', min: 16, max: 35, passo: 1 },
  { chave: 'falta.angulo', rotulo: 'Ângulo (graus, + = direita)', min: -40, max: 40, passo: 1 },
];

const ler = (obj, chave) => chave.split('.').reduce((o, k) => o[k], obj);
function gravar(obj, chave, valor) {
  const partes = chave.split('.');
  const ultima = partes.pop();
  partes.reduce((o, k) => o[k], obj)[ultima] = valor;
}

function lerSalvo(chaveArmazenamento) {
  try {
    return JSON.parse(localStorage.getItem(chaveArmazenamento)) || null;
  } catch {
    return null;
  }
}

function salvar(chaveArmazenamento, dados) {
  try {
    localStorage.setItem(chaveArmazenamento, JSON.stringify(dados));
  } catch {
    // Sem armazenamento (aba anônima, por exemplo): os ajustes valem só até fechar a página
  }
}

export function criarPainel({ config, versao, aoMudar }) {
  const ARMAZENAMENTO = 'fkl-ajustes';
  const padrao = JSON.parse(JSON.stringify(config));
  const campos = CAMPOS.filter((c) => c.chave);

  // Recupera ajustes salvos, mas só se forem desta mesma versão do jogo
  const salvo = lerSalvo(ARMAZENAMENTO);
  if (salvo && salvo.versao === versao) {
    for (const c of campos) {
      const v = salvo.valores?.[c.chave];
      if (typeof v === typeof ler(config, c.chave)) gravar(config, c.chave, v);
    }
  }

  const painel = document.getElementById('painel');
  const lista = document.getElementById('painel-campos');
  const aviso = document.getElementById('painel-aviso');
  const entradas = new Map();

  // Mostra tantas casas decimais quanto o passo do slider pede (0.5 -> 1 casa, 0.001 -> 3 casas)
  const formatar = (c, v) => {
    if (c.tipo === 'liga') return v ? 'sim' : 'não';
    return v.toFixed(Math.max(0, Math.ceil(-Math.log10(c.passo) - 1e-9)));
  };
  // Liga/desliga usa caixa de marcar; o resto, slider
  const lerEntrada = (c, entrada) => (c.tipo === 'liga' ? entrada.checked : Number(entrada.value));
  const mostrarNaEntrada = (c, entrada, v) => {
    if (c.tipo === 'liga') entrada.checked = v;
    else entrada.value = v;
  };

  for (const c of CAMPOS) {
    if (c.secao) {
      const titulo = document.createElement('h3');
      titulo.textContent = c.secao;
      lista.appendChild(titulo);
      continue;
    }
    const linha = document.createElement('label');
    linha.className = 'campo';
    const texto = document.createElement('span');
    texto.textContent = c.rotulo;
    const valor = document.createElement('b');
    const entrada = document.createElement('input');
    if (c.tipo === 'liga') {
      entrada.type = 'checkbox';
      linha.classList.add('liga');
    } else {
      Object.assign(entrada, { type: 'range', min: c.min, max: c.max, step: c.passo });
    }
    mostrarNaEntrada(c, entrada, ler(config, c.chave));
    valor.textContent = formatar(c, ler(config, c.chave));
    entrada.addEventListener('input', () => {
      const v = lerEntrada(c, entrada);
      gravar(config, c.chave, v);
      valor.textContent = formatar(c, v);
      salvarTudo();
      aoMudar(c.chave);
    });
    linha.append(texto, valor, entrada);
    lista.appendChild(linha);
    entradas.set(c.chave, { entrada, valor, c });
  }

  function salvarTudo() {
    const valores = {};
    for (const c of campos) valores[c.chave] = ler(config, c.chave);
    salvar(ARMAZENAMENTO, { versao, valores });
  }

  function textoDosValores() {
    const linhas = [`Free Kick Legends ${versao} — ajustes`];
    for (const c of campos) {
      const atual = ler(config, c.chave);
      const mudou = atual !== ler(padrao, c.chave) ? '  ← mudei' : '';
      linhas.push(`${c.rotulo} [${c.chave}]: ${formatar(c, atual)}${mudou}`);
    }
    return linhas.join('\n');
  }

  document.getElementById('painel-copiar').addEventListener('click', async () => {
    const texto = textoDosValores();
    try {
      await navigator.clipboard.writeText(texto);
      aviso.textContent = 'Valores copiados! Cole na conversa com o Claude.';
    } catch {
      // Sem acesso à área de transferência: mostra o texto para copiar à mão
      aviso.textContent = 'Não consegui copiar sozinho. Selecione o texto abaixo e copie:';
      const caixa = document.createElement('textarea');
      caixa.value = texto;
      caixa.rows = 6;
      aviso.appendChild(caixa);
      caixa.select();
    }
  });

  document.getElementById('painel-restaurar').addEventListener('click', () => {
    for (const { entrada, valor, c } of entradas.values()) {
      const v = ler(padrao, c.chave);
      gravar(config, c.chave, v);
      mostrarNaEntrada(c, entrada, v);
      valor.textContent = formatar(c, v);
      aoMudar(c.chave);
    }
    salvarTudo();
    aviso.textContent = 'Valores originais restaurados.';
  });

  const abrir = (sim) => {
    painel.hidden = !sim;
    aviso.textContent = '';
  };
  // blur(): tira o foco do botão, para a barra de espaço do computador voltar a chutar
  document.getElementById('botao-ajustes').addEventListener('click', (e) => {
    e.currentTarget.blur();
    abrir(painel.hidden);
  });
  document.getElementById('painel-fechar').addEventListener('click', (e) => {
    e.currentTarget.blur();
    abrir(false);
  });
}
