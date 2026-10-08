// Painel de ajuste: sliders que mudam os números do CONFIG na hora.
// Os valores ficam salvos no aparelho até a próxima versão do jogo.

const CAMPOS = [
  { secao: 'Chute' },
  { chave: 'velocidadeMin', rotulo: 'Velocidade com a barra vazia (m/s)', min: 8, max: 22, passo: 0.5 },
  { chave: 'velocidadeMax', rotulo: 'Velocidade com a barra cheia (m/s)', min: 22, max: 45, passo: 0.5 },
  { chave: 'elevacaoBase', rotulo: 'Ângulo de saída da bola (graus)', min: 5, max: 30, passo: 0.5 },
  { chave: 'tempoCarga', rotulo: 'Tempo para encher a barra (s)', min: 0.5, max: 2.5, passo: 0.05 },

  { secao: 'Ponto de contato' },
  { chave: 'giroLateralMax', rotulo: 'Força da curva', min: 0, max: 120, passo: 1 },
  { chave: 'giroVerticalMax', rotulo: 'Força da queda (em cima) e flutuação (embaixo)', min: 0, max: 60, passo: 1 },
  { chave: 'elevacaoContatoEmbaixo', rotulo: 'Pé embaixo: graus a mais na saída', min: 0, max: 15, passo: 0.5 },
  { chave: 'elevacaoContatoEmCima', rotulo: 'Pé em cima: graus a menos na saída', min: 0, max: 15, passo: 0.5 },
  { chave: 'perdaVelocidadeContato', rotulo: 'Velocidade perdida ao bater na borda', min: 0, max: 0.5, passo: 0.01 },
  { chave: 'semRotacaoAmplitude', rotulo: 'Bola sem rotação: quanto ela dança', min: 0, max: 15, passo: 0.5 },

  { secao: 'Ar e gravidade' },
  { chave: 'gravidade', rotulo: 'Gravidade', min: 5, max: 15, passo: 0.1 },
  { chave: 'arrasto', rotulo: 'Resistência do ar', min: 0, max: 0.03, passo: 0.001 },
  { chave: 'magnus', rotulo: 'Quanto o giro desvia a bola', min: 0, max: 0.012, passo: 0.0005 },

  { secao: 'Posição da falta (para testar)' },
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
      if (typeof salvo.valores?.[c.chave] === 'number') gravar(config, c.chave, salvo.valores[c.chave]);
    }
  }

  const painel = document.getElementById('painel');
  const lista = document.getElementById('painel-campos');
  const aviso = document.getElementById('painel-aviso');
  const entradas = new Map();

  // Mostra tantas casas decimais quanto o passo do slider pede (0.5 -> 1 casa, 0.001 -> 3 casas)
  const formatar = (c, v) => v.toFixed(Math.max(0, Math.ceil(-Math.log10(c.passo) - 1e-9)));

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
    Object.assign(entrada, { type: 'range', min: c.min, max: c.max, step: c.passo });
    entrada.value = ler(config, c.chave);
    valor.textContent = formatar(c, Number(entrada.value));
    entrada.addEventListener('input', () => {
      const v = Number(entrada.value);
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
      entrada.value = v;
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
