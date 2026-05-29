let editorPreviewDebounce = null;
let currentEditorItemIndex = 0;

function fecharModalEditor() {
    document.getElementById('modalEditorOverlay').style.display = 'none';
}

function abrirModalEditor() {
    if (!window.sistema || !window.sistema.dadosPlanilha || window.sistema.dadosPlanilha.length === 0) {
        alert("Sistema ainda não está carregado ou você precisa carregar um dicionário primeiro!");
        return;
    }
    
    // Mostra o modal
    document.getElementById('modalEditorOverlay').style.display = 'flex';
    
    // Popula a barra lateral se houver dados
    popularListaEditor();
}

function popularListaEditor() {
    if (!window.sistema) return;
    
    const container = document.getElementById('editorListaItens');
    if (!container) return;
    
    // Tenta ler o banco de dados diretamente para construir a lista
    // Assumimos que window.sistema aponta para o objeto principal no navegador
    // e o gerenciador de dados retornado expõe os dados brutos de alguma forma.
    // Como a arquitetura foi refatorada, vamos usar a função `abrirEditorParaItem` iterativamente 
    // ou acessar diretamente `window.sistema.buscar("")` para listar tudo.
    
    const todosItens = window.sistema.obterTodosDadosBrutos ? window.sistema.obterTodosDadosBrutos() : [];
    
    container.innerHTML = '';
    
    if (todosItens.length === 0) {
        container.innerHTML = '<div style="padding: 15px; color: #666; font-size: 0.9em; text-align: center;">Nenhum item carregado.</div>';
        return;
    }
    
    // Atualiza o contador
    const counter = document.getElementById('editorCounter');
    if (counter) counter.textContent = `${todosItens.length} itens`;

    const fragment = document.createDocumentFragment();
    
    todosItens.forEach(item => {
        const div = document.createElement('div');
        div.className = 'editor-list-item';
        // Estilo básico caso CSS não esteja definido
        div.style.padding = '10px 15px';
        div.style.borderBottom = '1px solid #f1f5f9';
        div.style.cursor = 'pointer';
        div.style.transition = 'background 0.2s';
        
        div.onmouseover = () => div.style.backgroundColor = '#f8fafc';
        div.onmouseout = () => { if(currentEditorItemIndex !== item.indice) div.style.backgroundColor = 'transparent'; };
        
        div.textContent = item.itemLexical || `Item ${item.indice}`;
        
        div.onclick = () => {
            // Remove classe ativa de todos
            document.querySelectorAll('.editor-list-item').forEach(el => el.style.backgroundColor = 'transparent');
            div.style.backgroundColor = '#e2e8f0';
            
            carregarItemNoEditor(item.indice);
        };
        
        fragment.appendChild(div);
    });
    
    container.appendChild(fragment);
    
    // Reaplica os destaques visuais de erro na nova lista
    if (typeof destacarErrosNoEditor === 'function') {
        destacarErrosNoEditor();
    }
    
    // Carrega o primeiro item por padrão
    carregarItemNoEditor(todosItens[0].indice);
}

function carregarItemNoEditor(indice) {
    if (!window.sistema) return;
    
    currentEditorItemIndex = indice;
    const dados = window.sistema.abrirEditorParaItem(indice);
    if (!dados) return;
    
    // Mostrar form e esconder empty state
    const emptyState = document.getElementById('editorEmptyState');
    const formContent = document.getElementById('editorFormContent');
    if (emptyState) emptyState.style.display = 'none';
    if (formContent) formContent.style.display = 'block';
    
    // Extrai seções complexas já normalizadas
    window.editorStateVars = JSON.parse(JSON.stringify(dados.variacoes || []));
    if (window.editorStateVars.length === 0) window.editorStateVars.push({item: '', audio: '', fone: '', fonet: ''});
    
    // Preenche o formulário da esquerda
    document.getElementById('einp_ITEM_LEXICAL').value = window.editorStateVars[0]?.item || '';
    document.getElementById('einp_CLASSE_GRAMATICAL').value = dados.camposBasicos?.CLASSE_GRAMATICAL || '';
    document.getElementById('einp_CAMPO_SEMANTICO').value = dados.camposBasicos?.CAMPO_SEMANTICO || '';
    document.getElementById('einp_SUB_CAMPO_SEMANTICO').value = dados.camposBasicos?.SUB_CAMPO_SEMANTICO || '';
    document.getElementById('einp_TRADUCAO_SIGNIFICADO').value = dados.camposBasicos?.TRADUCAO_SIGNIFICADO || '';
    document.getElementById('einp_ITENS_RELACIONADOS').value = dados.camposBasicos?.ITENS_RELACIONADOS || '';
    document.getElementById('einp_DESCRICAO').value = dados.camposBasicos?.DESCRICAO || '';
    document.getElementById('einp_ARQUIVO_VIDEO').value = dados.camposBasicos?.ARQUIVO_VIDEO || '';
    
    window.editorStateExs = JSON.parse(JSON.stringify(dados.exemplos || []));
    window.editorStateImgs = JSON.parse(JSON.stringify(dados.imagens || []));
    
    if (window.renderizarBlocosEditor) window.renderizarBlocosEditor();
    
    // Força o trigger do preview
    window.dispatchEvent(new Event('input'));
}

window.addEventListener('input', function(e) {
    const isFormContent = e.target && typeof e.target.closest === 'function' && e.target.closest('#editorFormContent');
    const isWindow = e.target === window;
    
    if (isFormContent || isWindow) {
        clearTimeout(editorPreviewDebounce);
        editorPreviewDebounce = setTimeout(async () => {
            await rederizarPreviewEditor();
        }, 800);
    }
});

window.addEventListener('previewTabChanged', async function(e) {
    await rederizarPreviewEditor();
});

async function rederizarPreviewEditor() {
    if (!window.sistema || !window.sistema.gerarPreview) return;
    
    const dadosForm = {
        camposBasicos: {
            ITEM_LEXICAL: document.getElementById('einp_ITEM_LEXICAL').value,
            CLASSE_GRAMATICAL: document.getElementById('einp_CLASSE_GRAMATICAL').value,
            CAMPO_SEMANTICO: document.getElementById('einp_CAMPO_SEMANTICO').value,
            SUB_CAMPO_SEMANTICO: document.getElementById('einp_SUB_CAMPO_SEMANTICO').value,
            TRADUCAO_SIGNIFICADO: document.getElementById('einp_TRADUCAO_SIGNIFICADO').value,
            ITENS_RELACIONADOS: document.getElementById('einp_ITENS_RELACIONADOS').value,
            DESCRICAO: document.getElementById('einp_DESCRICAO').value,
            ARQUIVO_VIDEO: document.getElementById('einp_ARQUIVO_VIDEO').value
        },
        variacoes: window.editorStateVars || [],
        exemplos: window.editorStateExs || [],
        imagens: window.editorStateImgs || []
    };
    
    const activeTab = document.querySelector('.preview-tab.active');
    if (!activeTab) return;
    
    // O ID formato já está no próprio onclick!
    const match = activeTab.getAttribute('onclick').match(/'([^']+)'/);
    const formato = match ? match[1] : null;
    if (!formato) return;
    
    // Agora gerarPreview recebe a árvore normalizada!
    const previewData = await window.sistema.gerarPreview(dadosForm, formato);
    
    if (formato === 'preview-html-card' || formato === 'preview-html-linear') {
        const container = document.getElementById(formato);
        if (container && previewData) container.innerHTML = previewData;
    } else if (formato === 'preview-pdf') {
        if (previewData) {
            document.getElementById('preview-pdf-frame').src = previewData;
        }
    }
}

window.salvarEdicaoAtual = function() {
    if (!window.sistema || currentEditorItemIndex < 0) return;
    
    if (window.editorStateVars.length === 0) window.editorStateVars.push({item: '', audio: '', fone: '', fonet: ''});
    window.editorStateVars[0].item = document.getElementById('einp_ITEM_LEXICAL').value;
    
    const dadosEditados = {
        camposBasicos: {
            CLASSE_GRAMATICAL: document.getElementById('einp_CLASSE_GRAMATICAL').value,
            CAMPO_SEMANTICO: document.getElementById('einp_CAMPO_SEMANTICO').value,
            SUB_CAMPO_SEMANTICO: document.getElementById('einp_SUB_CAMPO_SEMANTICO').value,
            TRADUCAO_SIGNIFICADO: document.getElementById('einp_TRADUCAO_SIGNIFICADO').value,
            ITENS_RELACIONADOS: document.getElementById('einp_ITENS_RELACIONADOS').value,
            DESCRICAO: document.getElementById('einp_DESCRICAO').value,
            ARQUIVO_VIDEO: document.getElementById('einp_ARQUIVO_VIDEO').value
        },
        variacoes: window.editorStateVars || [],
        exemplos: window.editorStateExs || [],
        imagens: window.editorStateImgs || []
    };
    
    const salvarFunc = window.sistema.salvarItemEditado || window.sistema.salvarItemDoEditor;

    if (salvarFunc && salvarFunc(currentEditorItemIndex, dadosEditados)) {
        alert('Edição salva com sucesso!');
        if (typeof popularListaEditor === 'function') popularListaEditor(); // Atualiza a lista na esquerda
    } else {
        alert('Erro ao salvar item.');
    }
};

window.switchPreviewTab = function(evt, tabId) {
    // Esconder todos os painéis de preview
    document.querySelectorAll('.preview-panel').forEach(panel => {
        panel.style.display = 'none';
        panel.classList.remove('active');
    });
    
    // Remover classe ativa de todas as abas de preview
    document.querySelectorAll('.preview-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Mostrar painel selecionado
    const selectedPanel = document.getElementById(tabId);
    if (selectedPanel) {
        selectedPanel.style.display = 'block';
        selectedPanel.classList.add('active');
    }
    
    // Adicionar classe ativa na aba clicada
    if (evt && evt.currentTarget) {
        evt.currentTarget.classList.add('active');
    }
    
    // Disparar evento para re-renderizar
    window.dispatchEvent(new Event('previewTabChanged'));
};

window.switchTabEditor = function(evt, tabId) {
    document.querySelectorAll('#editorFormContent .tab-content').forEach(panel => {
        panel.style.display = 'none';
        panel.classList.remove('active');
    });
    
    document.querySelectorAll('#editorFormContent .tab-btn').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const selectedPanel = document.getElementById(tabId);
    if (selectedPanel) {
        selectedPanel.style.display = 'block';
        selectedPanel.classList.add('active');
    }
    
    if (evt && evt.currentTarget) {
        evt.currentTarget.classList.add('active');
    }
};


// --- ESTADO GLOBAL DAS SEÇÕES COMPLEXAS ---
window.editorStateVars = [];
window.editorStateExs = [];
window.editorStateImgs = [];

window.adicionarBlocoEditor = function(tipo) {
    if (tipo === 'vars') window.editorStateVars.push({ item: '', audio: '', fone: '', fonet: '' });
    if (tipo === 'exs') window.editorStateExs.push({ audio: '', trans: '', trad: '' });
    if (tipo === 'imgs') window.editorStateImgs.push({ img: '', leg: '' });
    window.renderizarBlocosEditor();
    window.dispatchEvent(new Event('input')); // Dispara o preview ao adicionar
};

window.removerBlocoEditor = function(tipo, i) {
    if (tipo === 'vars' && i > 0) window.editorStateVars.splice(i, 1);
    if (tipo === 'exs') window.editorStateExs.splice(i, 1);
    if (tipo === 'imgs') window.editorStateImgs.splice(i, 1);
    window.renderizarBlocosEditor();
    window.dispatchEvent(new Event('input')); // Dispara o preview ao remover
};

window.renderizarBlocosEditor = function() {
    // Variações
    const cVars = document.getElementById('econtainer-vars');
    if (cVars) {
        cVars.innerHTML = window.editorStateVars.map((obj, i) => `
            <div style="border:1px solid var(--border-color); border-radius:6px; padding:10px; margin-bottom:10px; background:var(--bg-secondary);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="font-size:13px; color:var(--text-main);">Variação ${i + 1}${i===0?' (Principal)':''}</strong>
                    ${i > 0 ? `<button class="btn btn-sm" style="color:var(--danger);" onclick="removerBlocoEditor('vars', ${i})">🗑️ Remover</button>` : ''}
                </div>
                <div class="grid-row">
                    <div class="form-group"><label>Forma/Item</label><input type="text" value="${obj.item || ''}" oninput="window.editorStateVars[${i}].item = this.value; window.dispatchEvent(new Event('input'));"></div>
                    <div class="form-group">
                        <label>Áudio (Opcional)</label>
                        <div style="display:flex; gap:6px;">
                            <input type="text" style="flex:1;" value="${obj.audio || ''}" oninput="window.editorStateVars[${i}].audio = this.value; window.dispatchEvent(new Event('input'));">
                            <button class="btn btn-sm btn-outline" onclick="uploadMidiaEditor('audio', (nome) => { window.editorStateVars[${i}].audio = nome; renderizarBlocosEditor(); window.dispatchEvent(new Event('input')); })">📁</button>
                        </div>
                    </div>
                </div>
                <div class="grid-row">
                    <div class="form-group"><label>Transcr. Fonêmica</label><input type="text" value="${obj.fone || ''}" oninput="window.editorStateVars[${i}].fone = this.value; window.dispatchEvent(new Event('input'));"></div>
                    <div class="form-group"><label>Transcr. Fonética</label><input type="text" value="${obj.fonet || ''}" oninput="window.editorStateVars[${i}].fonet = this.value; window.dispatchEvent(new Event('input'));"></div>
                </div>
            </div>
        `).join('');
    }

    // Exemplos
    const cExs = document.getElementById('econtainer-exs');
    if (cExs) {
        cExs.innerHTML = window.editorStateExs.map((obj, i) => `
            <div style="border:1px solid var(--border-color); border-radius:6px; padding:10px; margin-bottom:10px; background:var(--bg-secondary);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="font-size:13px; color:var(--text-main);">Exemplo ${i + 1}</strong>
                    <button class="btn btn-sm" style="color:var(--danger);" onclick="removerBlocoEditor('exs', ${i})">🗑️ Remover</button>
                </div>
                <div class="form-group">
                    <label>Transcrição (Usa Markdown)</label>
                    <textarea rows="2" oninput="window.editorStateExs[${i}].trans = this.value; window.dispatchEvent(new Event('input'));">${obj.trans || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>Tradução</label>
                    <textarea rows="2" oninput="window.editorStateExs[${i}].trad = this.value; window.dispatchEvent(new Event('input'));">${obj.trad || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>Áudio do Exemplo</label>
                    <div style="display:flex; gap:6px;">
                        <input type="text" style="flex:1;" value="${obj.audio || ''}" oninput="window.editorStateExs[${i}].audio = this.value; window.dispatchEvent(new Event('input'));">
                        <button class="btn btn-sm btn-outline" onclick="uploadMidiaEditor('audio', (nome) => { window.editorStateExs[${i}].audio = nome; renderizarBlocosEditor(); window.dispatchEvent(new Event('input')); })">📁</button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Imagens
    const cImgs = document.getElementById('econtainer-imgs');
    if (cImgs) {
        cImgs.innerHTML = window.editorStateImgs.map((obj, i) => `
            <div style="border:1px solid var(--border-color); border-radius:6px; padding:10px; margin-bottom:10px; background:var(--bg-secondary);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="font-size:13px; color:var(--text-main);">Imagem ${i + 1}</strong>
                    <button class="btn btn-sm" style="color:var(--danger);" onclick="removerBlocoEditor('imgs', ${i})">🗑️ Remover</button>
                </div>
                <div class="form-group">
                    <label>Arquivo da Imagem</label>
                    <div style="display:flex; gap:6px;">
                        <input type="text" style="flex:1;" value="${obj.img || ''}" oninput="window.editorStateImgs[${i}].img = this.value; window.dispatchEvent(new Event('input'));">
                        <button class="btn btn-sm btn-outline" onclick="uploadMidiaEditor('imagem', (nome) => { window.editorStateImgs[${i}].img = nome; renderizarBlocosEditor(); window.dispatchEvent(new Event('input')); })">📁</button>
                    </div>
                </div>
                <div class="form-group">
                    <label>Legenda</label>
                    <input type="text" value="${obj.leg || ''}" oninput="window.editorStateImgs[${i}].leg = this.value; window.dispatchEvent(new Event('input'));">
                </div>
            </div>
        `).join('');
    }
};

window.uploadMidiaEditor = function(tipo, callback) {
    const input = document.createElement('input');
    input.type = 'file';
    const extensoes = {
        audio: '.mp3,.wav,.ogg,.m4a,.flac,.wma',
        imagem: '.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg',
        video: '.mp4,.webm,.avi,.mov,.mkv'
    };
    if (extensoes[tipo]) input.accept = extensoes[tipo];
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            await window.sistema.vfs.adicionarArquivos(tipo, [file]);
            callback(file.name);
        } catch (err) {
            alert('Erro ao carregar mídia: ' + err.message);
        }
    };
    input.click();
};

window.filtrarListaEditor = function() {
    const searchEl = document.getElementById('editorSearch');
    if (!searchEl) return;
    const termo = searchEl.value.toLowerCase();
    document.querySelectorAll('.editor-list-item').forEach(item => {
        if (item.textContent.toLowerCase().includes(termo)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
};

// --- VALIDAÇÃO E FILTRO DE ERROS ---
window.editorErrosCampos = [];
window.editorErrosMidia = {};
window.editorFiltroErrosAtivo = false;

function verificarBarras(linha, campos) {
    const contagens = campos.map(campo => {
        const valor = String(linha[campo] || '').trim();
        if (!valor || valor.toLowerCase() === 'nan') return 0;
        return valor.split('|').filter(v => v.trim() !== '').length;
    });
    const contagensNaoZero = contagens.filter(c => c > 0);
    if (contagensNaoZero.length <= 1) return [true, ''];
    const primeiraContagem = contagensNaoZero[0];
    const ok = contagensNaoZero.every(c => c === primeiraContagem);
    return [ok, ok ? '' : `Inconsistência no número de elementos separados por | entre os campos ${campos.join(', ')}`];
}

function destacarErrosNoEditor() {
    const items = document.querySelectorAll('.editor-list-item');
    items.forEach((el, index) => {
        // Remove classes anteriores
        el.classList.remove('error-fields', 'error-media', 'error-both');
        
        let temErroCampos = window.editorErrosCampos.includes(index);
        let temErroMidia = !!window.editorErrosMidia[index];
        
        if (temErroCampos && temErroMidia) {
            el.classList.add('error-both');
        } else if (temErroCampos) {
            el.classList.add('error-fields');
        } else if (temErroMidia) {
            el.classList.add('error-media');
        }
    });
    
    // Atualiza botão de filtro
    const btn = document.getElementById('btnFiltrarErros');
    if (btn) {
        const totalErros = Object.keys(window.editorErrosMidia).length + window.editorErrosCampos.length;
        if (totalErros > 0) {
            btn.style.display = 'inline-block';
            btn.textContent = `⚠️ Filtrar erros (${totalErros})`;
        } else {
            btn.style.display = 'none';
        }
    }
}

window.verificarMidiasNoEditor = function() {
    if (!window.sistema || !window.sistema.dadosPlanilha) return;
    
    window.editorErrosMidia = {};
    const vfs = window.sistema.vfs;
    
    const midiasReferenciadas = { audio: new Set(), imagem: new Set(), video: new Set() };
    
    window.sistema.dadosPlanilha.forEach((item, idx) => {
        const faltantes = [];
        
        (item.ARQUIVO_SONORO || '').split('|').forEach(arq => {
            const nome = arq.trim();
            if (nome) {
                midiasReferenciadas.audio.add(nome);
                if (!vfs.arquivos.audio.has(nome)) faltantes.push('ARQUIVO_SONORO');
            }
        });
        
        (item.ARQUIVO_SONORO_EXEMPLO || '').split('|').forEach(arq => {
            const nome = arq.trim();
            if (nome) {
                midiasReferenciadas.audio.add(nome);
                if (!vfs.arquivos.audio.has(nome)) faltantes.push('ARQUIVO_SONORO_EXEMPLO');
            }
        });
        
        (item.IMAGEM || '').split('|').forEach(img => {
            const nome = img.trim();
            if (nome) {
                midiasReferenciadas.imagem.add(nome);
                if (!vfs.arquivos.imagem.has(nome)) faltantes.push('IMAGEM');
            }
        });
        
        (item.ARQUIVO_VIDEO || '').split('|').forEach(vid => {
            const nome = vid.trim();
            if (nome) {
                midiasReferenciadas.video.add(nome);
                if (!vfs.arquivos.video.has(nome)) faltantes.push('ARQUIVO_VIDEO');
            }
        });
        
        if (faltantes.length > 0) window.editorErrosMidia[idx] = faltantes;
    });
    
    destacarErrosNoEditor();
    
    // Verificar mídias sobrando (na pasta mas não na planilha)
    const midiasSobrando = [];
    
    if (vfs.arquivos.audio) {
        for (const nome of vfs.arquivos.audio.keys()) {
            if (!midiasReferenciadas.audio.has(nome)) midiasSobrando.push(`Áudio: ${nome}`);
        }
    }
    if (vfs.arquivos.imagem) {
        for (const nome of vfs.arquivos.imagem.keys()) {
            if (!midiasReferenciadas.imagem.has(nome)) midiasSobrando.push(`Imagem: ${nome}`);
        }
    }
    if (vfs.arquivos.video) {
        for (const nome of vfs.arquivos.video.keys()) {
            if (!midiasReferenciadas.video.has(nome)) midiasSobrando.push(`Vídeo: ${nome}`);
        }
    }
    
    const totalErros = Object.keys(window.editorErrosMidia).length;
    let mensagem = "";
    
    if (totalErros > 0) {
        mensagem += `⚠️ Encontrados ${totalErros} itens na tabela com mídias ausentes na pasta.\n\n`;
    } else {
        mensagem += `✅ Todas as mídias da tabela foram encontradas na pasta!\n\n`;
    }
    
    if (midiasSobrando.length > 0) {
        mensagem += `ℹ️ Há ${midiasSobrando.length} arquivo(s) na pasta que não foram utilizados na tabela:\n`;
        // Mostrar no máximo 5 arquivos sobrando para não estourar o alert
        mensagem += midiasSobrando.slice(0, 5).join('\n');
        if (midiasSobrando.length > 5) mensagem += `\n... e mais ${midiasSobrando.length - 5} arquivo(s).`;
    } else {
        mensagem += `✅ Não há arquivos de mídia sobrando na pasta virtual.`;
    }
    
    alert(mensagem);
};

window.verificarCamposNoEditor = function() {
    if (!window.sistema || !window.sistema.dadosPlanilha) return;
    
    window.editorErrosCampos = [];
    
    window.sistema.dadosPlanilha.forEach((item, idx) => {
        let invalido = false;
        
        // Reconstrói uma linha plana para validar como no antigo sistema
        const cb = item.camposBasicos || {};
        const vars = item.variacoes || [];
        const exs = item.exemplos || [];
        const imgs = item.imagens || [];
        
        const linhaPlana = {
            ITEM_LEXICAL: vars.map(v => v.item || '').join(' | '),
            CLASSE_GRAMATICAL: cb.CLASSE_GRAMATICAL || '',
            CAMPO_SEMANTICO: cb.CAMPO_SEMANTICO || '',
            TRADUCAO_SIGNIFICADO: cb.TRADUCAO_SIGNIFICADO || '',
            ARQUIVO_SONORO: vars.map(v => v.audio || '').join(' | '),
            TRANSCRICAO_FONEMICA: vars.map(v => v.fone || '').join(' | '),
            TRANSCRICAO_FONETICA: vars.map(v => v.fonet || '').join(' | '),
            ARQUIVO_SONORO_EXEMPLO: exs.map(e => e.audio || '').join(' | '),
            TRANSCRICAO_EXEMPLO: exs.map(e => e.trans || '').join(' | '),
            TRADUCAO_EXEMPLO: exs.map(e => e.trad || '').join(' | '),
            IMAGEM: imgs.map(i => i.img || '').join(' | '),
            LEGENDA_IMAGEM: imgs.map(i => i.leg || '').join(' | ')
        };
        
        const CAMPOS_OBRIGATORIOS = ["ITEM_LEXICAL", "TRADUCAO_SIGNIFICADO", "CAMPO_SEMANTICO"];
        CAMPOS_OBRIGATORIOS.forEach(campo => {
            if (!linhaPlana[campo] || String(linhaPlana[campo]).trim() === '') invalido = true;
        });
        
        const resultado1 = verificarBarras(linhaPlana, ['ITEM_LEXICAL', 'ARQUIVO_SONORO', 'TRANSCRICAO_FONEMICA', 'TRANSCRICAO_FONETICA']);
        if (!resultado1[0]) invalido = true;
        
        const resultado2 = verificarBarras(linhaPlana, ['ARQUIVO_SONORO_EXEMPLO', 'TRANSCRICAO_EXEMPLO', 'TRADUCAO_EXEMPLO']);
        if (!resultado2[0]) invalido = true;
        
        const resultado3 = verificarBarras(linhaPlana, ['IMAGEM', 'LEGENDA_IMAGEM']);
        if (!resultado3[0]) invalido = true;
        
        if (invalido) window.editorErrosCampos.push(idx);
    });
    
    destacarErrosNoEditor();
    
    if (window.editorErrosCampos.length > 0) {
        alert(`⚠️ ${window.editorErrosCampos.length} itens com problemas de validação (campos vazios ou inconsistentes).`);
    } else {
        alert('✅ Todos os itens passaram na validação de campos!');
    }
};

window.toggleFiltroErros = function() {
    window.editorFiltroErrosAtivo = !window.editorFiltroErrosAtivo;
    const btn = document.getElementById('btnFiltrarErros');
    
    if (window.editorFiltroErrosAtivo) {
        btn.style.background = '#f59e0b';
        btn.style.color = '#fff';
        const comErro = new Set([
            ...Object.keys(window.editorErrosMidia).map(Number),
            ...window.editorErrosCampos
        ]);
        
        document.querySelectorAll('.editor-list-item').forEach((item, idx) => {
            if (comErro.has(idx)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    } else {
        btn.style.background = '#fef3c7';
        btn.style.color = '#92400e';
        document.querySelectorAll('.editor-list-item').forEach(item => item.style.display = 'block');
        window.filtrarListaEditor(); // Reaplica pesquisa por texto se houver
    }
};
