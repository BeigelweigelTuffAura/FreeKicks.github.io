// Testes do ranking do dia (sem internet: o fetch é falso). Rodar com: node testes/ranking.mjs
import assert from 'node:assert/strict';
import { criarRanking, limparNome, ordenarRanking, LINHAS_MAXIMO } from '../js/ranking.js';

const teste = (nome, fn) => Promise.resolve(fn()).then(() => console.log('ok -', nome));

// fetch falso: guarda cada chamada e responde o que mandarmos
function fetchFalso(resposta = { ok: true, status: 201 }) {
  const chamadas = [];
  const fn = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    if (typeof resposta === 'function') return resposta(url, opcoes);
    return resposta;
  };
  fn.chamadas = chamadas;
  return fn;
}

const URL = 'https://abc.supabase.co';
const CHAVE = 'chave-anon';

await teste('sem url e chave, disponivel é false e as chamadas lançam', async () => {
  const r = criarRanking({ fetchFn: fetchFalso() });
  assert.equal(r.disponivel, false);
  await assert.rejects(r.enviar({ dia: '2026-10-10', nome: 'Ana', gols: 3 }), { message: 'Ranking ainda não ligado' });
  await assert.rejects(r.listar('2026-10-10'), { message: 'Ranking ainda não ligado' });
  assert.equal(criarRanking({ url: URL, fetchFn: fetchFalso() }).disponivel, false);
  assert.equal(criarRanking({ chave: CHAVE, fetchFn: fetchFalso() }).disponivel, false);
  assert.equal(criarRanking().disponivel, false);
});

await teste('enviar monta a URL, os cabeçalhos e o corpo certos e devolve true', async () => {
  const fetchFn = fetchFalso();
  const r = criarRanking({ url: `${URL}/`, chave: CHAVE, fetchFn });
  assert.equal(r.disponivel, true);
  assert.equal(await r.enviar({ dia: '2026-10-10', nome: 'Ana', gols: 3 }), true);
  assert.equal(fetchFn.chamadas.length, 1);
  const { url, opcoes } = fetchFn.chamadas[0];
  assert.equal(url, `${URL}/rest/v1/ranking`);
  assert.equal(opcoes.method, 'POST');
  assert.equal(opcoes.headers.apikey, CHAVE);
  assert.equal(opcoes.headers.Authorization, `Bearer ${CHAVE}`);
  assert.equal(opcoes.headers['Content-Type'], 'application/json');
  assert.equal(opcoes.headers.Prefer, 'return=minimal');
  assert.deepEqual(JSON.parse(opcoes.body), { dia: '2026-10-10', nome: 'Ana', gols: 3 });
  assert.ok(opcoes.signal, 'manda o sinal do AbortController (limite de tempo)');
});

await teste('tabela diferente entra no endereço', async () => {
  const fetchFn = fetchFalso({ ok: true, status: 200, json: async () => [] });
  const r = criarRanking({ url: URL, chave: CHAVE, tabela: 'ranking_teste', fetchFn });
  await r.enviar({ dia: '2026-10-10', nome: 'Ana', gols: 1 });
  assert.equal(fetchFn.chamadas[0].url, `${URL}/rest/v1/ranking_teste`);
  await r.listar('2026-10-10');
  assert.ok(fetchFn.chamadas[1].url.startsWith(`${URL}/rest/v1/ranking_teste?`));
});

await teste('o nome é limpo: sem espaços sobrando, sem quebras de linha, no máximo 24 letras', async () => {
  assert.equal(limparNome('  Zé  da\nSilva \t'), 'Zé da Silva');
  assert.equal(limparNome('Um nome muito comprido mesmo, demais'), 'Um nome muito comprido m');
  assert.equal(limparNome('Um nome muito comprido mesmo, demais').length, 24);
  assert.equal(limparNome(null), '');
  const fetchFn = fetchFalso();
  const r = criarRanking({ url: URL, chave: CHAVE, fetchFn });
  await r.enviar({ dia: '2026-10-10', nome: '  Zé\nda Silva com um nome enorme demais  ', gols: 2 });
  const corpo = JSON.parse(fetchFn.chamadas[0].opcoes.body);
  assert.equal(corpo.nome, 'Zé da Silva com um nome');
  assert.ok(!/[\r\n]/.test(corpo.nome));
  assert.ok(corpo.nome.length <= 24);
});

await teste('enviar recusa nome vazio, gols inválidos e dia fora do formato (sem chamar a internet)', async () => {
  const fetchFn = fetchFalso();
  const r = criarRanking({ url: URL, chave: CHAVE, fetchFn });
  await assert.rejects(r.enviar({ dia: '2026-10-10', nome: '   ', gols: 3 }), /nome/);
  await assert.rejects(r.enviar({ dia: '2026-10-10', nome: 'Ana', gols: 0 }), /gol/);
  await assert.rejects(r.enviar({ dia: '2026-10-10', nome: 'Ana', gols: 2.5 }), /gol/);
  await assert.rejects(r.enviar({ dia: '2026-10-10', nome: 'Ana', gols: 'muitos' }), /gol/);
  await assert.rejects(r.enviar({ dia: '10/10/2026', nome: 'Ana', gols: 3 }), /Dia inválido/);
  await assert.rejects(r.enviar({ nome: 'Ana', gols: 3 }), /Dia inválido/);
  assert.equal(fetchFn.chamadas.length, 0);
});

await teste('erro HTTP ao enviar vira Error curto em português', async () => {
  const r = criarRanking({ url: URL, chave: CHAVE, fetchFn: fetchFalso({ ok: false, status: 401 }) });
  await assert.rejects(r.enviar({ dia: '2026-10-10', nome: 'Ana', gols: 3 }), { message: 'Não consegui enviar: HTTP 401' });
});

await teste('falha de rede ao enviar vira Error em português', async () => {
  const fetchFn = async () => { throw new TypeError('Failed to fetch'); };
  const r = criarRanking({ url: URL, chave: CHAVE, fetchFn });
  await assert.rejects(r.enviar({ dia: '2026-10-10', nome: 'Ana', gols: 3 }), /Sem conexão/);
});

await teste('passou do tempo: a chamada é cancelada e vira Error em português', async () => {
  const fetchFn = (url, { signal }) => new Promise((resolver, rejeitar) => {
    signal.addEventListener('abort', () => rejeitar(Object.assign(new Error('abortado'), { name: 'AbortError' })));
  });
  const r = criarRanking({ url: URL, chave: CHAVE, fetchFn, tempoLimiteMs: 20 });
  await assert.rejects(r.listar('2026-10-10'), /demorou demais/);
  await assert.rejects(r.enviar({ dia: '2026-10-10', nome: 'Ana', gols: 3 }), /demorou demais/);
});

await teste('listar monta a URL e os cabeçalhos certos', async () => {
  const fetchFn = fetchFalso({ ok: true, status: 200, json: async () => [] });
  const r = criarRanking({ url: URL, chave: CHAVE, fetchFn });
  assert.deepEqual(await r.listar('2026-10-10'), []);
  const { url, opcoes } = fetchFn.chamadas[0];
  assert.equal(url, `${URL}/rest/v1/ranking?select=nome,gols&dia=eq.2026-10-10&order=gols.desc&limit=500`);
  assert.equal(opcoes.method, 'GET');
  assert.equal(opcoes.headers.apikey, CHAVE);
  assert.equal(opcoes.headers.Authorization, `Bearer ${CHAVE}`);
  assert.ok(opcoes.signal);
  await assert.rejects(r.listar('hoje'), /Dia inválido/);
});

await teste('listar deixa uma linha por nome (a maior sequência), ordena e numera com empates', async () => {
  const linhas = [
    { nome: 'Bia', gols: 4 },
    { nome: 'Ana', gols: 2 },
    { nome: 'Ana', gols: 5 },
    { nome: 'Caio', gols: 5 },
    { nome: 'Duda ', gols: 4 },
    { nome: 'Edu', gols: 1 },
    { nome: ' Ana', gols: 3 },
    { nome: '', gols: 9 },
    { nome: 'Fabi', gols: 0 },
    { nome: 'Gui', gols: 'x' },
  ];
  const fetchFn = fetchFalso({ ok: true, status: 200, json: async () => linhas });
  const r = criarRanking({ url: URL, chave: CHAVE, fetchFn });
  assert.deepEqual(await r.listar('2026-10-10'), [
    { nome: 'Ana', gols: 5, posicao: 1 },
    { nome: 'Caio', gols: 5, posicao: 1 },
    { nome: 'Bia', gols: 4, posicao: 3 },
    { nome: 'Duda', gols: 4, posicao: 3 },
    { nome: 'Edu', gols: 1, posicao: 5 },
  ]);
  // Empate no meio: 1, 2, 2, 4
  assert.deepEqual(
    ordenarRanking([{ nome: 'A', gols: 9 }, { nome: 'C', gols: 7 }, { nome: 'B', gols: 7 }, { nome: 'D', gols: 6 }]).map((l) => `${l.posicao}:${l.nome}`),
    ['1:A', '2:B', '2:C', '4:D'],
  );
});

await teste('listar limita a 50 linhas', async () => {
  const linhas = Array.from({ length: 120 }, (_, i) => ({ nome: `Jogador ${String(i).padStart(3, '0')}`, gols: 1 + (i % 7) }));
  const fetchFn = fetchFalso({ ok: true, status: 200, json: async () => linhas });
  const r = criarRanking({ url: URL, chave: CHAVE, fetchFn });
  const resultado = await r.listar('2026-10-10');
  assert.equal(resultado.length, LINHAS_MAXIMO);
  assert.equal(resultado[0].gols, 7);
  assert.equal(resultado[0].posicao, 1);
  for (let i = 1; i < resultado.length; i++) {
    assert.ok(resultado[i].gols <= resultado[i - 1].gols, 'ordem decrescente');
    assert.ok(resultado[i].posicao >= resultado[i - 1].posicao, 'posição nunca volta');
  }
});

await teste('erro HTTP ou resposta estranha ao listar vira Error em português', async () => {
  const r500 = criarRanking({ url: URL, chave: CHAVE, fetchFn: fetchFalso({ ok: false, status: 500 }) });
  await assert.rejects(r500.listar('2026-10-10'), { message: 'Não consegui carregar o ranking: HTTP 500' });
  const rJson = criarRanking({ url: URL, chave: CHAVE, fetchFn: fetchFalso({ ok: true, status: 200, json: async () => { throw new Error('x'); } }) });
  await assert.rejects(rJson.listar('2026-10-10'), /formato/);
  const rObjeto = criarRanking({ url: URL, chave: CHAVE, fetchFn: fetchFalso({ ok: true, status: 200, json: async () => ({ erro: 1 }) }) });
  await assert.rejects(rObjeto.listar('2026-10-10'), /formato/);
});

console.log('Todos os testes do ranking passaram.');
