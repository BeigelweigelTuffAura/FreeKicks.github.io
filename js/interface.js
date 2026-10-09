// Interface (HUD): cartão do cobrador, lista "Quem bate?", resultado, placar e botões do topo.
// Só mexe na página (HTML); não sabe nada de 3D nem de física.

import { overall } from './elenco.js?v=6';

const ATRIBUTOS = [
  ['FOR', 'Força'],
  ['CUR', 'Curva'],
  ['QUE', 'Queda'],
  ['PRE', 'Precisão'],
  ['FRI', 'Frieza'],
];

const NOMES_ESPECIAIS = {
  trivela: 'Trivela',
  semRotacao: 'Sem rotação',
  folhaSeca: 'Folha seca',
};

const $ = (id) => document.getElementById(id);

// Cor da nota: verde para as altas, amarelo para as médias, laranja para as baixas
function corDaNota(nota) {
  if (nota >= 90) return '#4ade80';
  if (nota >= 80) return '#f7d84a';
  return '#f59e0b';
}

function barrasDeAtributos(jogador) {
  return ATRIBUTOS.map(([chave, nome]) => {
    const v = jogador.atributos[chave];
    return `<div class="atributo" title="${nome}">
      <span>${nome}</span>
      <i><b style="width:${Math.max(0, (v - 50) * 2)}%;background:${corDaNota(v)}"></b></i>
      <em>${v}</em>
    </div>`;
  }).join('');
}

function selos(jogador) {
  const pe = `<span class="selo">${jogador.pe === 'E' ? 'Canhoto' : 'Destro'}</span>`;
  const especiais = (jogador.especiais || [])
    .map((e) => `<span class="selo especial">${NOMES_ESPECIAIS[e] || e}</span>`)
    .join('');
  return pe + especiais;
}

export function criarInterface({ aoEscolherCobrador, aoAlternarMudo, aoAlternarFixar }) {
  const cartao = $('cartao-cobrador');
  const lista = $('lista-cobradores');
  const itens = $('lista-itens');
  const resultado = $('resultado');
  const hud = $('hud');
  let atual = null;
  let opcoes = [];

  function desenharCartao() {
    if (!atual) return;
    const { jogador, nota, sugerido } = atual;
    cartao.innerHTML = `
      <div class="cartao-linha">
        <span class="cartao-numero">${jogador.numero}</span>
        <div class="cartao-nome">
          <b>${jogador.nome}</b>
          <small>${jogador.apelido} · ${jogador.estilo}</small>
        </div>
        <div class="cartao-ovr"><b>${overall(jogador)}</b><small>OVR</small></div>
      </div>
      <div class="cartao-nota">${sugerido ? 'O mais indicado · ' : ''}nota para esta falta <b>${Math.round(nota)}</b> · <u>trocar</u></div>`;
  }

  function desenharLista() {
    itens.innerHTML = opcoes.map(({ jogador, nota }, i) => `
      <button class="item-cobrador${atual && atual.jogador === jogador ? ' escolhido' : ''}" data-indice="${i}" type="button">
        <span class="item-numero">${jogador.numero}</span>
        <span class="item-meio">
          <b>${jogador.nome}${i === 0 ? ' <span class="selo sugerido">Sugerido</span>' : ''}</b>
          <small>${jogador.apelido} · ${jogador.posicao} · ${jogador.estilo}</small>
          <span class="item-selos">${selos(jogador)}</span>
          <span class="atributos">${barrasDeAtributos(jogador)}</span>
        </span>
        <span class="item-notas">
          <b style="color:${corDaNota(nota)}">${Math.round(nota)}</b><small>esta falta</small>
          <em>${overall(jogador)} OVR</em>
        </span>
      </button>`).join('');
  }

  cartao.addEventListener('click', () => {
    desenharLista();
    lista.hidden = false;
    const escolhido = itens.querySelector('.escolhido');
    if (escolhido) escolhido.scrollIntoView({ block: 'nearest' });
  });
  itens.addEventListener('click', (e) => {
    const botao = e.target.closest('.item-cobrador');
    if (!botao) return;
    const { jogador, nota } = opcoes[Number(botao.dataset.indice)];
    lista.hidden = true;
    aoEscolherCobrador(jogador, nota);
  });
  $('lista-fechar').addEventListener('click', () => {
    lista.hidden = true;
  });

  const botaoMudo = $('botao-mudo');
  botaoMudo.hidden = false;
  botaoMudo.addEventListener('click', (e) => {
    e.currentTarget.blur();
    aoAlternarMudo();
  });
  const botaoFixar = $('botao-fixar');
  botaoFixar.hidden = false;
  botaoFixar.addEventListener('click', (e) => {
    e.currentTarget.blur();
    aoAlternarFixar();
  });

  return {
    // opcoes: lista ordenada [{ jogador, nota }] (a primeira é a sugerida)
    mostrarCobrador(jogador, nota, listaOrdenada) {
      opcoes = listaOrdenada;
      atual = { jogador, nota, sugerido: listaOrdenada[0] && listaOrdenada[0].jogador === jogador };
      desenharCartao();
    },
    listaAberta: () => !lista.hidden,
    // rival: nome do time cujas cores a barreira e o goleiro vestem (opcional)
    mostrarFalta({ distancia, angulo }, rival = '') {
      const lado = angulo > 4 ? 'pela direita' : angulo < -4 ? 'pela esquerda' : 'frontal';
      const contra = rival ? ` · vs ${rival}` : '';
      $('info').innerHTML = `Falta · <b>${Math.round(distancia)} m</b><br><small>${lado}${contra}</small>`;
    },
    mostrarPlacar(texto) {
      $('placar').textContent = texto;
    },
    mostrarMensagem(texto) {
      $('mensagem').textContent = texto;
    },
    mostrarResultado({ tipo, titulo, sub }) {
      $('resultado-titulo').textContent = titulo;
      $('resultado-sub').textContent = sub || '';
      resultado.className = tipo;
      void resultado.offsetWidth; // reinicia a animação
      resultado.classList.add('mostrar');
    },
    esconderResultado() {
      resultado.className = '';
    },
    emJogo(sim) {
      hud.classList.toggle('em-jogo', sim);
    },
    // Replay: esconde os controles e mostra a etiqueta REPLAY
    modoReplay(sim) {
      hud.classList.toggle('replay', sim);
    },
    definirMudo(mudo) {
      botaoMudo.textContent = mudo ? '🔇' : '🔊';
      botaoMudo.setAttribute('aria-label', mudo ? 'Ligar som' : 'Desligar som');
    },
    definirFixar(fixo) {
      botaoFixar.classList.toggle('ativo', fixo);
      botaoFixar.textContent = fixo ? '📍 Falta fixa' : '🎲 Falta sorteada';
    },
  };
}
