// Mathom-House Experience Switcher Modal and Floating Button

(function() {
  const experiences = [
    {
      id: 'estatica',
      name: 'Página estática (HTML / CSS)',
      desc: 'Arquivo digital pessoal, ensaios técnicos, biblioteca e notas.',
      badge: 'React · Clássico',
      href: '/estatica.html',
      match: (path, search) => path.includes('estatica') || path.includes('/app')
    },
    {
      id: 'interativo',
      name: 'Passeio Interativo (WebGL Híbrido)',
      desc: 'Caminhada contínua pela toca com transições, chamas e paralaxe.',
      badge: 'WebGL2 · Shaders',
      href: '/passeio-interativo.html',
      match: (path, search) => path.includes('passeio-interativo') && !search.includes('3d')
    },
    {
      id: 'leve',
      name: 'Passeio Leve (Animação Otimizada por Frames)',
      desc: 'Passeio cinematográfico renderizado quadro a quadro em Canvas 2D.',
      badge: 'Canvas 2D · Leve',
      href: '/passeio-leve.html',
      match: (path, search) => path.includes('passeio-leve') || path.includes('frames')
    },
    {
      id: 'guiado',
      name: 'Passeio Guiado (Sequência Pré-renderizada)',
      desc: 'Laboratório de visualização realista Cycles com pontos interativos.',
      badge: 'Cycles · Cinema',
      href: '/passeio-guiado.html',
      match: (path, search) => path.includes('passeio-guiado') || (path.includes('passeio') && !path.includes('interativo') && !path.includes('leve'))
    },
    {
      id: 'modelo',
      name: 'Modelo Interativo (3D em Tempo Real via Canvas)',
      desc: 'Modelo 3D da toca com órbita livre, modo caminhada (L) e iluminação.',
      badge: 'Three.js · 3D',
      href: '/modelo-interativo.html',
      match: (path, search) => path.includes('modelo')
    },
    {
      id: 'relevo',
      name: 'Vista do Relevo (Malha Topográfica 3D)',
      desc: 'Reconstrução volumétrica das fotografias via mapa de profundidade.',
      badge: 'Depth Anything · 3D',
      href: '/passeio-interativo.html?3d',
      match: (path, search) => (path.includes('passeio-interativo') || path.includes('vista-relevo')) && search.includes('3d')
    }
  ];

  function initSwitcher() {
    // Only init if not already mounted
    if (document.querySelector('.mathom-switcher-btn')) return;

    const currentPath = window.location.pathname;
    const currentSearch = window.location.search;

    // Do not show the floating trigger on the main menu / portal page
    const isRoot = currentPath === '/' || currentPath === '/index.html' || currentPath === '';
    if (isRoot) return;

    // Create trigger button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mathom-switcher-btn';
    btn.setAttribute('aria-label', 'Alternar experiência da Mathom-house');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>
      <span>Experiências</span>
    `;

    // Create modal
    const overlay = document.createElement('div');
    overlay.className = 'mathom-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    let itemsHtml = '';
    experiences.forEach(exp => {
      const isCurrent = exp.match(currentPath, currentSearch);
      itemsHtml += `
        <a href="${exp.href}" class="mathom-modal-item ${isCurrent ? 'is-current' : ''}">
          <div class="mathom-item-info">
            <span class="mathom-item-name">${exp.name}</span>
            <span class="mathom-item-desc">${exp.desc}</span>
          </div>
          <span class="mathom-item-badge">${exp.badge}</span>
        </a>
      `;
    });

    overlay.innerHTML = `
      <div class="mathom-modal-card">
        <div class="mathom-modal-header">
          <div>
            <h2 class="mathom-modal-title">Mathom-house</h2>
            <p class="mathom-modal-subtitle">Escolha uma experiência da toca</p>
          </div>
          <button type="button" class="mathom-modal-close" aria-label="Fechar">&times;</button>
        </div>
        <div class="mathom-modal-list">
          ${itemsHtml}
        </div>
        <div class="mathom-modal-footer">
          <a href="/index.html" class="mathom-home-link">← Voltar ao Menu Principal</a>
        </div>
      </div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('.mathom-modal-close');

    function openModal() {
      overlay.classList.add('is-active');
    }

    function closeModal() {
      overlay.classList.remove('is-active');
    }

    btn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('is-active')) {
        closeModal();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSwitcher);
  } else {
    initSwitcher();
  }
})();
