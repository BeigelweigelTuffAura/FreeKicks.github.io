// Ranking do dia: a melhor sequência de gols de cada pessoa no Desafio do Dia vai para um banco na
// internet (Supabase: serviço de banco de dados com API HTTP; a chave pública "anon" fica na página,
// que é o desenho normal dele). Todo mundo que abre o jogo vê o ranking de hoje; cada dia começa do zero.
// Sem Three.js, sem sorteio e sem estado global: roda no Node (testes/ranking.mjs).

export const NOME_MAXIMO = 24;   // letras no nome
export const LINHAS_MAXIMO = 50; // linhas mostradas no ranking
const TEMPO_LIMITE_MS = 8000;    // 8 s esperando a internet; depois desiste
const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/;

// Tira quebras de linha e espaços sobrando e corta no tamanho máximo
export function limparNome(nome) {
  return String(nome ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NOME_MAXIMO)
    .trim();
}

// Chama fetch com limite de tempo (AbortController: cancela a chamada quando passa do tempo)
async function buscar(fetchFn, url, opcoes, tempoLimiteMs, oQue) {
  const controle = typeof AbortController === 'function' ? new AbortController() : null;
  const relogio = controle ? setTimeout(() => controle.abort(), tempoLimiteMs) : null;
  try {
    return await fetchFn(url, { ...opcoes, signal: controle ? controle.signal : undefined });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error(`A internet demorou demais para ${oQue}. Tente de novo.`);
    throw new Error(`Sem conexão para ${oQue}. Tente de novo.`);
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}

// Uma linha por nome (fica a maior sequência), ordenadas por gols (empate: nome), com posição
// de 1 em diante (empates com a mesma posição: 1, 2, 2, 4) e no máximo LINHAS_MAXIMO linhas.
export function ordenarRanking(linhas) {
  const porNome = new Map();
  for (const linha of Array.isArray(linhas) ? linhas : []) {
    if (!linha) continue;
    const nome = limparNome(linha.nome);
    const gols = Math.floor(Number(linha.gols));
    if (!nome || !Number.isFinite(gols) || gols < 1) continue;
    if (!porNome.has(nome) || porNome.get(nome) < gols) porNome.set(nome, gols);
  }
  const ordenadas = [...porNome.entries()]
    .map(([nome, gols]) => ({ nome, gols }))
    .sort((a, b) => b.gols - a.gols || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, LINHAS_MAXIMO);
  let posicao = 0;
  return ordenadas.map((linha, i) => {
    if (i === 0 || linha.gols !== ordenadas[i - 1].gols) posicao = i + 1;
    return { ...linha, posicao };
  });
}

// url: endereço do projeto no Supabase; chave: a chave pública "anon"; tabela: nome da tabela.
// fetchFn substitui o fetch do navegador nos testes; tempoLimiteMs só muda nos testes.
export function criarRanking({ url = '', chave = '', tabela = 'ranking', fetchFn, tempoLimiteMs = TEMPO_LIMITE_MS } = {}) {
  const disponivel = typeof url === 'string' && url.trim() !== '' && typeof chave === 'string' && chave.trim() !== '';
  const base = disponivel ? `${url.trim().replace(/\/+$/, '')}/rest/v1/${tabela}` : '';
  const cabecalhos = { apikey: chave, Authorization: `Bearer ${chave}` };
  const buscarFn = () => fetchFn || (typeof fetch === 'function' ? fetch : null);

  function conferir() {
    if (!disponivel) throw new Error('Ranking ainda não ligado');
    if (!buscarFn()) throw new Error('Este navegador não consegue acessar o ranking');
  }

  return {
    disponivel,

    // Manda a melhor sequência do dia. Devolve true quando o banco aceitou; senão lança Error.
    async enviar({ dia, nome, gols } = {}) {
      conferir();
      const nomeLimpo = limparNome(nome);
      const golsInteiro = Number(gols);
      if (!nomeLimpo) throw new Error('Escreva seu nome para entrar no ranking');
      if (!Number.isInteger(golsInteiro) || golsInteiro < 1) throw new Error('Só entra no ranking quem fez pelo menos 1 gol');
      if (!DIA_VALIDO.test(String(dia))) throw new Error('Dia inválido para o ranking');
      const resposta = await buscar(buscarFn(), base, {
        method: 'POST',
        headers: { ...cabecalhos, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ dia, nome: nomeLimpo, gols: golsInteiro }),
      }, tempoLimiteMs, 'enviar');
      if (!resposta || !resposta.ok) throw new Error(`Não consegui enviar: HTTP ${resposta ? resposta.status : '?'}`);
      return true;
    },

    // Lista o ranking de um dia: [{ nome, gols, posicao }], já sem repetidos e ordenado.
    async listar(dia) {
      conferir();
      if (!DIA_VALIDO.test(String(dia))) throw new Error('Dia inválido para o ranking');
      const endereco = `${base}?select=nome,gols&dia=eq.${dia}&order=gols.desc&limit=500`;
      const resposta = await buscar(buscarFn(), endereco, { method: 'GET', headers: { ...cabecalhos } }, tempoLimiteMs, 'carregar o ranking');
      if (!resposta || !resposta.ok) throw new Error(`Não consegui carregar o ranking: HTTP ${resposta ? resposta.status : '?'}`);
      let linhas;
      try {
        linhas = await resposta.json();
      } catch {
        throw new Error('O ranking veio num formato que não entendi');
      }
      if (!Array.isArray(linhas)) throw new Error('O ranking veio num formato que não entendi');
      return ordenarRanking(linhas);
    },
  };
}
