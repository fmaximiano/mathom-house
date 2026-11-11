// Editor da Mathom-house — só carrega com ?editor na URL.
// Serve para ver, no lugar certo, como um texto fica antes de colá-lo em content.js.
// Nada é salvo no site: o editor gera o trecho de código para copiar.

const KINDS = {
  hero: 'Abertura (título grande)',
  title: 'Título de cômodo',
  note: 'Nota (título pequeno + texto)',
  line: 'Frase (só texto, grande)',
  whisper: 'Sussurro (texto miúdo)',
  contact: 'Contato',
  finale: 'Final',
};
const HAS = {
  hero: ['eyebrow', 'title', 'text'],
  title: ['eyebrow', 'title', 'text'],
  note: ['eyebrow', 'title', 'text'],
  line: ['eyebrow', 'text'],
  whisper: ['text'],
  contact: ['eyebrow', 'title', 'text'],
  finale: ['eyebrow', 'title'],
};
const DRAFT_KEY = 'mathom-editor-draft';
const r3 = (x) => Math.round(x * 1000) / 1000;
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '<br>')}'`;

const CSS = `
.ed { position: fixed; z-index: 60; top: 12px; right: 12px; bottom: 12px; width: min(360px, calc(100vw - 24px));
  display: flex; flex-direction: column; background: rgba(20, 14, 9, 0.94); color: var(--ink); border: 1px solid rgba(240,176,103,.35);
  border-radius: 10px; font: 13px/1.4 var(--mono); box-shadow: 0 10px 40px rgba(0,0,0,.6); backdrop-filter: blur(6px); }
.ed.is-min { bottom: auto; }
.ed.is-min .ed__body { display: none; }
.ed__head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid rgba(240,176,103,.2); }
.ed__head strong { flex: 1; color: var(--ember); letter-spacing: .12em; text-transform: uppercase; font-size: 11px; }
.ed__body { overflow-y: auto; overscroll-behavior: contain; padding: 12px; display: grid; gap: 10px; }
.ed label { display: grid; gap: 3px; font-size: 11px; color: var(--ink-dim); }
.ed input, .ed select, .ed textarea { font: inherit; color: var(--ink); background: rgba(0,0,0,.35);
  border: 1px solid rgba(245,233,208,.2); border-radius: 5px; padding: 6px 7px; width: 100%; box-sizing: border-box; }
.ed textarea { resize: vertical; min-height: 70px; }
.ed button { font: inherit; font-size: 12px; color: var(--paper-ink); background: var(--paper); border: 0; border-radius: 5px;
  padding: 6px 9px; cursor: pointer; }
.ed button.is-ghost { background: transparent; color: var(--ink); border: 1px solid rgba(245,233,208,.3); }
.ed button.is-on { background: var(--ember); }
.ed__row { display: flex; gap: 6px; flex-wrap: wrap; align-items: end; }
.ed__row > * { flex: 1; }
.ed__now { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; padding: 8px; background: rgba(0,0,0,.3); border-radius: 6px; }
.ed__now b { color: var(--ember); font-weight: 500; }
.ed__hint { font-size: 11px; color: var(--ink-faint); margin: 0; }
.ed__warn { font-size: 12px; margin: 0; padding: 6px 8px; border-radius: 5px; background: rgba(0,0,0,.3); }
.ed__warn.is-bad { background: rgba(170, 60, 30, .45); }
.ed__warn.is-ok { color: var(--moss); }
.ed pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 11px; background: rgba(0,0,0,.4);
  padding: 8px; border-radius: 6px; max-height: 180px; overflow: auto; }
.ed h4 { margin: 6px 0 0; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--ember); font-weight: 500; }
.ed-catch { position: fixed; inset: 0; z-index: 55; cursor: crosshair; display: none; }
.ed-catch.is-on { display: block; }
.ed-dot { position: fixed; z-index: 56; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%;
  border: 2px solid var(--ember); box-shadow: 0 0 0 2px rgba(0,0,0,.6); pointer-events: none; display: none; }
.block.is-editing::after { content: ''; position: absolute; inset: -10px; border: 1px dashed var(--ember); border-radius: 6px;
  pointer-events: none; transform: translate(var(--ox, 0), -50%); }
`;

export class Editor {
  constructor(engine, blocks, { travelTo, progress, mathoms = [], hidden = [] }) {
    Object.assign(this, { engine, blocks, travelTo, progress, mathoms, hidden });
    this.item = null;       // bloco em edição (já existente ou novo)
    this.isNew = false;
    this.mode = null;       // o que o próximo clique na cena marca: 'block' | 'free'
    this._build();
    this._restoreDraft();
    this._tick();
  }

  _build() {
    document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`);
    const el = document.createElement('aside');
    el.className = 'ed';
    el.setAttribute('aria-label', 'Editor de textos');
    const opts = this.blocks.items.map((it) => `<option value="${it.def.id}">${it.def.id}</option>`).join('');
    el.innerHTML = `
      <div class="ed__head"><strong>Editor</strong>
        <button type="button" class="is-ghost" data-act="min" title="Recolher">–</button></div>
      <div class="ed__body">
        <div class="ed__now">
          <span>momento <b data-now="t">0</b></span><span>cômodo <b data-now="scene">—</b></span>
        </div>
        <label>Bloco
          <select data-f="pick"><option value="">— escolha —</option>${opts}<option value="__new">+ novo bloco</option></select>
        </label>
        <div data-form hidden>
          <div style="display:grid;gap:10px">
            <div class="ed__row">
              <label>id <input data-f="id"></label>
              <label>tipo <select data-f="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
            </div>
            <label data-has="eyebrow">sobretítulo (eyebrow) <input data-f="eyebrow"></label>
            <label data-has="title">título <input data-f="title"></label>
            <label data-has="text">texto <textarea data-f="text" rows="4"></textarea></label>
            <p class="ed__hint">Enter quebra a linha (vira &lt;br&gt;). &lt;em&gt;itálico&lt;/em&gt; funciona.</p>
            <p class="ed__warn" data-warn></p>
            <label>alinhamento <select data-f="align"><option value="left">esquerda</option><option value="center">centro</option><option value="right">direita</option></select></label>

            <h4>Onde</h4>
            <div class="ed__row">
              <button type="button" data-act="pickBlock">📍 Marcar na cena</button>
              <label>recuo <input data-f="depth" type="number" step="0.1" min="0"></label>
            </div>
            <p class="ed__hint" data-where>—</p>

            <h4>Quando</h4>
            <div class="ed__row">
              <label>aparece <input data-f="t0" type="number" step="0.005"></label>
              <label>completo <input data-f="t1" type="number" step="0.005"></label>
            </div>
            <div class="ed__row">
              <label>começa a sumir <input data-f="t2" type="number" step="0.005"></label>
              <label>sumiu <input data-f="t3" type="number" step="0.005"></label>
            </div>
            <div class="ed__row">
              <button type="button" class="is-ghost" data-act="tHere">Centrar no momento atual</button>
              <button type="button" class="is-ghost" data-act="go">Ir até o bloco</button>
            </div>
            <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-f="pin" checked style="width:auto">
              manter visível enquanto edito</label>

            <h4>Código para content.js</h4>
            <pre data-out></pre>
            <div class="ed__row">
              <button type="button" data-act="copy">Copiar</button>
              <button type="button" class="is-ghost" data-act="reset">Desfazer mudanças</button>
            </div>
            <p class="ed__hint" data-place></p>
          </div>
        </div>

        <h4>Marcador livre</h4>
        <p class="ed__hint">Para objetos do Mathom (<code>mathoms</code>) e cantos escondidos (<code>hidden</code>): clique na cena e copie as coordenadas.</p>
        <div class="ed__row"><button type="button" class="is-ghost" data-act="pickFree">📍 Marcar ponto</button></div>
        <pre data-free>—</pre>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.catcher = Object.assign(document.createElement('div'), { className: 'ed-catch' });
    this.dot = Object.assign(document.createElement('div'), { className: 'ed-dot' });
    document.body.append(this.catcher, this.dot);

    const f = (n) => el.querySelector(`[data-f="${n}"]`);
    this.f = f;
    f('pick').addEventListener('change', (e) => this.select(e.target.value));
    el.addEventListener('input', (e) => { if (e.target.dataset.f && e.target.dataset.f !== 'pick') this.apply(); });
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act) this[`_${act}`]();
    });
    this.catcher.addEventListener('click', (e) => this._picked(e.clientX, e.clientY));
    addEventListener('keydown', (e) => { if (e.key === 'Escape') this._arm(null); });
  }

  // ─── seleção e formulário ───
  select(id) {
    if (this.item) this._unmark();
    if (this.isNew && this.item) this.blocks.remove(this.item);
    this.item = null; this.isNew = false;
    this.el.querySelector('[data-form]').hidden = !id;
    if (!id) { try { localStorage.removeItem(DRAFT_KEY); } catch { /* */ } return; }
    if (id === '__new') {
      const t = this.engine.state.t;
      const def = {
        id: `novo-${Date.now().toString(36).slice(-4)}`, scene: this.engine.state.scene, kind: 'note',
        at: [0.5, 0.5, 1.0], t: [t - 0.02, t - 0.01, t + 0.02, t + 0.03].map(r3), align: 'left',
        eyebrow: 'Sobretítulo', title: 'Título', text: 'Escreva aqui.',
      };
      this.isNew = true;
      this.item = this.blocks.set(def);
    } else {
      this.item = this.blocks.items.find((it) => it.def.id === id);
    }
    this.original = { ...this.item.def };
    this._fill(this.item.def);
    this.apply();
  }

  _fill(d) {
    const f = this.f;
    f('id').value = d.id; f('kind').value = d.kind; f('align').value = d.align || 'left';
    for (const k of ['eyebrow', 'title', 'text']) f(k).value = (d[k] || '').replace(/<br\s*\/?>/g, '\n');
    f('depth').value = d.at ? d.at[2] ?? 0 : '';
    ['t0', 't1', 't2', 't3'].forEach((k, i) => { f(k).value = d.t[i]; });
    f('depth').disabled = !d.at;
  }

  // Lê o formulário, redesenha o bloco e atualiza o código.
  apply() {
    if (!this.item) return;
    const f = this.f, old = this.item.def;
    const kind = f('kind').value;
    const def = { ...old, id: f('id').value.trim() || old.id, kind, align: f('align').value };
    for (const k of ['eyebrow', 'title', 'text']) {
      if (HAS[kind].includes(k)) def[k] = f(k).value.replace(/\n/g, '<br>');
      else delete def[k];
    }
    if (old.at) def.at = [old.at[0], old.at[1], +f('depth').value || 0];
    def.t = ['t0', 't1', 't2', 't3'].map((k, i) => (f(k).value === '' ? old.t[i] : +f(k).value));
    this.el.querySelectorAll('[data-has]').forEach((l) => { l.hidden = !HAS[kind].includes(l.dataset.has); });
    this.blocks.set(def, this.item);
    this._mark();
    this._output();
    this._saveDraft();
  }

  _mark() {
    this.item.pinned = this.f('pin').checked;
    this.item.el.classList.add('is-editing');
  }
  _unmark() {
    this.item.pinned = false;
    this.item.el.classList.remove('is-editing');
  }

  _output() {
    const d = this.item.def;
    const pos = d.at ? `at: [${d.at.map(r3).join(', ')}]` : `screen: [${d.screen.join(', ')}]`;
    const lines = [`id: ${q(d.id)}, scene: ${q(d.scene)}, kind: ${q(d.kind)}, ${pos}, t: [${d.t.join(', ')}], align: ${q(d.align)},`];
    for (const k of ['eyebrow', 'title', 'text']) if (d[k] != null) lines.push(`${k}: ${q(d[k])},`);
    if (d.kind === 'hero' && d.text === this.original.text && this.original.text != null) lines[lines.length - 1] = 'text: site.tagline,';
    this.code = `  {\n    ${lines.join('\n    ')}\n  },`;
    this.el.querySelector('[data-out]').textContent = this.code;
    this.el.querySelector('[data-where]').textContent = d.at
      ? `cômodo ${d.scene} · ponto (${r3(d.at[0])}, ${r3(d.at[1])}) da imagem`
      : `posição fixa na tela (${d.screen.join(', ')}) — não depende da cena`;
    this.el.querySelector('[data-place]').textContent = this.isNew
      ? 'Cole dentro de "export const blocks = [ … ]", junto dos blocos do mesmo cômodo.'
      : `Substitua o bloco com id '${this.original.id}' em js/content.js.`;
  }

  // Tamanho do texto em relação à tela: o que realmente importa para o design.
  _measure() {
    const warn = this.el.querySelector('[data-warn]');
    if (!this.item) return;
    const r = this.item.el.getBoundingClientRect();
    if (!r.width || this.item.el.style.visibility === 'hidden') {
      warn.className = 'ed__warn';
      warn.textContent = 'Fora de vista agora: vá até o cômodo do bloco para medir.';
      return;
    }
    const hPct = Math.round((r.height / innerHeight) * 100), wPct = Math.round((r.width / innerWidth) * 100);
    const chars = (this.item.def.text || '').replace(/<[^>]+>/g, '').length;
    const limit = { hero: 50, title: 40, note: 25, line: 25, whisper: 10, contact: 40, finale: 35 }[this.item.def.kind] || 35;
    const bad = hPct > limit;
    warn.className = `ed__warn ${bad ? 'is-bad' : 'is-ok'}`;
    warn.textContent = `Ocupa ${hPct}% da altura e ${wPct}% da largura da tela · ${chars} caracteres. `
      + (bad ? `Grande demais para este tipo (ideal ≤ ${limit}% da altura): encurte o texto.` : 'Tamanho bom.');
  }

  // ─── botões ───
  _min() { this.el.classList.toggle('is-min'); }
  _tHere() {
    const t = this.engine.state.t, d = this.item.def;
    const [a, b, c, e] = d.t, mid = (b + c) / 2;
    ['t0', 't1', 't2', 't3'].forEach((k, i) => { this.f(k).value = r3([a, b, c, e][i] - mid + t); });
    this.apply();
  }
  _go() { const d = this.item.def; this.travelTo(Math.max(0, Math.min(1, (d.t[1] + d.t[2]) / 2))); }
  _copy() {
    const btn = this.el.querySelector('[data-act="copy"]');
    const done = () => { btn.textContent = 'Copiado ✓'; setTimeout(() => { btn.textContent = 'Copiar'; }, 1500); };
    navigator.clipboard?.writeText(this.code).then(done, () => this._selectOut());
    if (!navigator.clipboard) this._selectOut();
  }
  _selectOut() {
    const sel = getSelection(), range = document.createRange();
    range.selectNodeContents(this.el.querySelector('[data-out]'));
    sel.removeAllRanges(); sel.addRange(range);
  }
  _reset() {
    if (!this.item) return;
    this._fill(this.original);
    this.item.def = { ...this.original };
    this.apply();
  }

  // ─── marcar na cena ───
  _arm(mode) {
    this.mode = mode;
    this.catcher.classList.toggle('is-on', !!mode);
    this.el.querySelector('[data-act="pickBlock"]').classList.toggle('is-on', mode === 'block');
    this.el.querySelector('[data-act="pickFree"]').classList.toggle('is-on', mode === 'free');
  }
  _pickBlock() { this._arm(this.mode === 'block' ? null : 'block'); }
  _pickFree() { this._arm(this.mode === 'free' ? null : 'free'); }
  _picked(x, y) {
    const hit = this.engine.pick(x, y);
    const mode = this.mode;
    this._arm(null);
    if (!hit) return;
    const room = this.engine.world.rooms[hit.scene];
    const { u, v } = room.frame.project(hit.point);
    this.dot.style.cssText = `display:block;left:${x}px;top:${y}px`;
    setTimeout(() => { this.dot.style.display = 'none'; }, 1200);
    if (mode === 'free') {
      const t = r3(this.engine.state.t);
      this.el.querySelector('[data-free]').textContent =
        `cômodo: ${hit.scene}\nat: [${r3(u)}, ${r3(v)}]\nmomento (t): ${t}\n\n`
        + `mathom → at: [${r3(u)}, ${r3(v)}], t: ${t}\n`
        + `hidden → scene: '${hit.scene}', at: [${r3(u)}, ${r3(v)}], t: [${r3(t - 0.02)}, ${r3(t - 0.01)}, ${r3(t + 0.02)}, ${r3(t + 0.03)}]`;
      return;
    }
    if (!this.item) return;
    const d = this.item.def;
    d.scene = hit.scene;
    d.at = [r3(u), r3(v), d.at ? d.at[2] : 1.0];
    delete d.screen;
    this.f('depth').disabled = false;
    this.f('depth').value = d.at[2];
    this.apply();
  }

  // ─── rascunho (sobrevive a recarregar a página) ───
  _saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ def: this.item.def, isNew: this.isNew, original: this.original })); } catch { /* */ }
  }
  _restoreDraft() {
    let draft;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { /* */ }
    if (!draft?.def) return;
    const pick = this.f('pick');
    if (draft.isNew) {
      this.el.querySelector('[data-form]').hidden = false;
      this.isNew = true;
      this.item = this.blocks.set(draft.def);
      this.original = draft.original;
      pick.value = '__new';
    } else {
      const it = this.blocks.items.find((i) => i.def.id === draft.original?.id);
      if (!it) return;
      this.el.querySelector('[data-form]').hidden = false;
      this.item = it;
      this.original = { ...it.def };
      this.blocks.set(draft.def, it);
      pick.value = draft.original.id;
    }
    this._fill(this.item.def);
    this.apply();
  }

  _tick() {
    const now = this.el.querySelector('[data-now="t"]'), sc = this.el.querySelector('[data-now="scene"]');
    let last = 0;
    const loop = (ms) => {
      if (ms - last > 150) {
        last = ms;
        now.textContent = r3(this.engine.state.t).toFixed(3);
        sc.textContent = this.engine.state.scene;
        this._measure();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
