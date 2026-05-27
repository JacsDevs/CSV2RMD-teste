let editorPreviewDebounce = null;
let currentEditorItemIndex = 0;

function fecharModalEditor() {
    document.getElementById('modalEditorOverlay').style.display = 'none';
}

function abrirModalEditor() {
    if (!window.sistema || !window.sistema.abrirEditorParaItem) {
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
    
    // Carrega o primeiro item por padrão
    carregarItemNoEditor(todosItens[0].indice);
}

function carregarItemNoEditor(indice) {
    if (!window.sistema) return;
    
    currentEditorItemIndex = indice;
    const dados = window.sistema.abrirEditorParaItem(indice);
    if (!dados) return;
    
    // Preenche o formulário da esquerda
    document.getElementById('einp_ITEM_LEXICAL').value = dados.camposBasicos.ITEM_LEXICAL || '';
    document.getElementById('einp_CLASSE_GRAMATICAL').value = dados.camposBasicos.CLASSE_GRAMATICAL || '';
    document.getElementById('einp_CAMPO_SEMANTICO').value = dados.camposBasicos.CAMPO_SEMANTICO || '';
    document.getElementById('einp_SUB_CAMPO_SEMANTICO').value = dados.camposBasicos.SUB_CAMPO_SEMANTICO || '';
    document.getElementById('einp_TRADUCAO_SIGNIFICADO').value = dados.camposBasicos.TRADUCAO_SIGNIFICADO || '';
    document.getElementById('einp_ITENS_RELACIONADOS').value = dados.camposBasicos.ITENS_RELACIONADOS || '';
    document.getElementById('einp_DESCRICAO').value = dados.camposBasicos.DESCRICAO || '';
    document.getElementById('einp_ARQUIVO_VIDEO').value = dados.camposBasicos.ARQUIVO_VIDEO || '';
    
    // Força o trigger do preview
    window.dispatchEvent(new Event('input'));
}

window.addEventListener('input', function(e) {
    if (e.target.closest('#editorFormContent')) {
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
    
    // Coletar os dados da tela
    const dados = {
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
        variacoes: [], // TODO: Mapear seções complexas
        exemplos: [],
        imagens: []
    };

    const activeTab = document.querySelector('.preview-tab.active');
    if (!activeTab) return;
    
    const formatMap = {
        'Card (HTML)': 'preview-html-card',
        'Linear (HTML)': 'preview-html-linear',
        'PDF (Typst)': 'preview-pdf'
    };
    const formato = formatMap[activeTab.textContent.trim()];
    
    if (formato === 'preview-pdf') {
        document.getElementById('preview-pdf-frame').src = 'about:blank'; // Limpa antes de gerar
    }
    
    const previewData = await window.sistema.gerarPreview(dados, formato);
    
    if (formato === 'preview-html-card' || formato === 'preview-html-linear') {
        const container = document.getElementById(formato);
        if (container && previewData) container.innerHTML = previewData;
    } else if (formato === 'preview-pdf') {
        if (previewData) {
            document.getElementById('preview-pdf-frame').src = previewData;
        }
    }
}
