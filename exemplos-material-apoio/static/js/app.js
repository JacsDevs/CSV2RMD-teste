// ============================================
// CSV2DMLI - DICIONÁRIO MULTIMÍDIA WEB
// Versão 4.1 - Corrigida para novo HTML
// ============================================

// ============================================
// 1. SISTEMA DE ARQUIVOS VIRTUAL
// ============================================

const VirtualFS = {
    audio: new Map(),
    imagem: new Map(),
    video: new Map(),
    alfabeto: '',
    templateHtml: null,
    templateHtmlLinear: null,
    templateTex: null,
    templateTypst: null,
    textosExtra: {},
    
    adicionarArquivos(tipo, fileList) {
        if (!this[tipo]) this[tipo] = new Map();
        let adicionados = 0;
        for (const file of fileList) {
            const nome = file.name.split('/').pop().split('\\').pop();
            const ext = nome.split('.').pop().toLowerCase();
            const extValidas = this.getExtensoes(tipo);
            if (extValidas.includes(ext)) {
                this[tipo].set(nome, file);
                adicionados++;
            }
        }
        if (adicionados > 0) {
            log(`${tipo}: ${adicionados} arquivo(s) válido(s)`, 'success');
        }
        this.atualizarUI(tipo);
        this.salvarCache();
        return adicionados;
    },
    
    getExtensoes(tipo) {
        return {
            audio: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'wma'],
            imagem: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'],
            video: ['mp4', 'webm', 'avi', 'mov', 'mkv']
        }[tipo] || [];
    },
    
    getArquivo(tipo, nome) { return this[tipo]?.get(nome) || null; },
    getTodosNomes(tipo) { return this[tipo] ? [...this[tipo].keys()] : []; },
    getContagem(tipo) { return this[tipo]?.size || 0; },
    
    async getBase64(tipo, nome) {
        const file = this.getArquivo(tipo, nome);
        if (!file) return null;
        const LIMITE_MB = tipo === 'video' ? 20 : 10;
        if (file.size > LIMITE_MB * 1024 * 1024) {
            log(`⚠️ ${nome}: excede ${LIMITE_MB}MB`, 'warning');
            return null;
        }
        if (file.size < 100) return null;
        return new Promise((resolve) => {
            const reader = new FileReader();
            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) { resolved = true; reader.abort(); resolve(null); }
            }, 15000);
            reader.onload = () => { if (!resolved) { resolved = true; clearTimeout(timeout); resolve(reader.result); } };
            reader.onerror = () => { if (!resolved) { resolved = true; clearTimeout(timeout); resolve(null); } };
            reader.readAsDataURL(file);
        });
    },
    
    atualizarUI(tipo) {
        const count = this.getContagem(tipo);
        
        // Atualiza contador no painel de mídia
        const countEl = document.getElementById(`count${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`);
        if (countEl) countEl.textContent = count;
        
        // Atualiza classe 'loaded' no painel
        const panel = document.getElementById(`panel${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`);
        if (panel) {
            if (count > 0) {
                panel.classList.add('loaded');
            } else {
                panel.classList.remove('loaded');
            }
        }
        
        // Atualiza status cards no topo
        const statusMap = { audio: 'Audio', imagem: 'Imagem', video: 'Video' };
        const statusEl = document.getElementById(`status${statusMap[tipo]}`);
        if (statusEl) statusEl.textContent = count;
        
        // Atualiza o card de status visual
        const cardMap = { audio: 'statusAudioCard', imagem: 'statusImagemCard', video: 'statusVideoCard' };
        const cardEl = document.getElementById(cardMap[tipo]);
        if (cardEl) {
            if (count > 0) {
                cardEl.classList.add('ok');
                cardEl.classList.remove('error');
            } else {
                cardEl.classList.remove('ok');
            }
        }
        
        // Atualiza badge do passo 2
        this.atualizarBadgeMidias();
    },
    
    atualizarBadgeMidias() {
        const totalMidias = this.getContagem('audio') + this.getContagem('imagem') + this.getContagem('video');
        const badgeMidias = document.getElementById('badgeMidias');
        if (badgeMidias) {
            if (totalMidias > 0) {
                badgeMidias.textContent = `✅ ${totalMidias} arquivos`;
                badgeMidias.className = 'step-badge badge-ok';
            } else {
                badgeMidias.textContent = 'Pendente';
                badgeMidias.className = 'step-badge';
            }
        }
    },
    
    salvarCache() {
        try {
            const cacheData = {
                audioCount: this.audio.size,
                imagemCount: this.imagem.size,
                videoCount: this.video.size,
                textosExtra: this.textosExtra,
                timestamp: Date.now()
            };
            localStorage.setItem('csv2dmli_cache', JSON.stringify(cacheData));
        } catch(e) {
            // localStorage pode estar cheio
        }
    },
    
    carregarCache() {
        const cached = localStorage.getItem('csv2dmli_cache');
        if (cached) {
            try {
                const data = JSON.parse(cached);
                if (Date.now() - data.timestamp < 86400000) {
                    this.textosExtra = data.textosExtra || {};
                    return true;
                }
            } catch(e) {}
        }
        return false;
    }
};

// ============================================
// 2. VARIÁVEIS GLOBAIS E LOG
// ============================================

let dadosGlobais = [];
let colunasCsv = [];
let categoriasUnicas = [];
let templatesCarregados = { html: false, tex: false, typst: false };


// ============================================
// 19. TEMPLATES DE ENTRADA
// ============================================

let templateEntradaCardHtml = null;
let templateEntradaLinearHtml = null;
let templateEntradaTex = null;
let templateEntradaTypst = null;
let templateEntradaAtivo = 'card';

async function carregarTemplatesEntrada() {
    const templates = [
        { 
            varName: 'templateEntradaCardHtml', 
            fileName: 'entrada-card.html', 
            nome: 'HTML Card',
            storageKey: 'csv2dmli_templateEntradaCardHtml'
        },
        { 
            varName: 'templateEntradaLinearHtml', 
            fileName: 'entrada-linear.html', 
            nome: 'HTML Linear',
            storageKey: 'csv2dmli_templateEntradaLinearHtml'
        },
        { 
            varName: 'templateEntradaTypst', 
            fileName: 'entrada.typ', 
            nome: 'Typst',
            storageKey: 'csv2dmli_templateEntradaTypst'
        }
    ];
    
    for (const t of templates) {
        // 1. PRIMEIRO: Verifica se tem template customizado no cache (upload manual)
        const cached = localStorage.getItem(t.storageKey);
        if (cached) {
            window[t.varName] = cached;
            
            // SÓ marca como loaded se foi upload manual (cache)
            const statusId = t.varName === 'templateEntradaCardHtml' ? 'templateEntradaCardHtmlStatus' :
                            (t.varName === 'templateEntradaLinearHtml' ? 'templateEntradaLinearHtmlStatus' : 'templateEntradaTypstStatus');
            const zoneId = t.varName === 'templateEntradaCardHtml' ? 'templateEntradaHtmlZone' :
                          (t.varName === 'templateEntradaLinearHtml' ? 'templateEntradaLinearHtmlZone' : 'templateEntradaTypstZone');
            
            const statusEl = document.getElementById(statusId);
            const zoneEl = document.getElementById(zoneId);
            
            if (statusEl) statusEl.textContent = '✅ Customizado';
            if (zoneEl) zoneEl.classList.add('loaded');
            
            log(`📋 Template de entrada ${t.nome} restaurado do cache (customizado)`, 'success');
            continue;
        }
        
        // 2. SEGUNDO: Carrega da pasta templates/ silenciosamente (sem marcar como loaded)
        if (window[t.varName] === null || window[t.varName] === undefined) {
            try {
                const response = await fetch(`templates/${t.fileName}`);
                if (response.ok) {
                    window[t.varName] = await response.text();
                    
                    // ✅ NÃO marca como loaded - é o padrão da pasta
                    // ✅ NÃO atualiza o texto do status
                    
                    log(`📋 Template de entrada ${t.nome} carregado da pasta templates/ (padrão)`, 'success');
                } else {
                    log(`⚠️ Template ${t.fileName} não encontrado em templates/`, 'warning');
                }
            } catch(e) {
                // Template não encontrado é normal na primeira execução
                console.log(`ℹ️ Template ${t.fileName} não encontrado, aguardando upload`);
            }
        }
    }
    
    // Sincroniza window.variavel com let variavel
    templateEntradaCardHtml = window.templateEntradaCardHtml || templateEntradaCardHtml;
    templateEntradaLinearHtml = window.templateEntradaLinearHtml || templateEntradaLinearHtml;
    templateEntradaTypst = window.templateEntradaTypst || templateEntradaTypst;
    
    // Log do status final
    const stats = [];
    if (window.templateEntradaCardHtml) stats.push('card');
    if (window.templateEntradaLinearHtml) stats.push('linear');
    if (window.templateEntradaTypst) stats.push('typst');
    
    if (stats.length > 0) {
        log(`📚 Templates de entrada carregados: ${stats.join(', ')}`, 'success');
    } else {
        log('💡 Nenhum template de entrada encontrado. Use upload manual ou coloque os arquivos na pasta templates/', 'info');
    }
}


function processarTemplateEntrada(template, dados) {
    
    // Função recursiva que avalia blocos e variáveis dinamicamente
    function processar(textoAtual, contextoAtual) {
        
        // 1. Resolve blocos lógicos e iteradores: {{#CHAVE}}...{{/CHAVE}}
        const regexBloco = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
        
        let textoProcessado = textoAtual.replace(regexBloco, (match, chave, conteudoInterno) => {
            const valor = contextoAtual[chave];
            
            // Regra de Omissão: Se não existe ou está vazio, limpa o bloco.
            if (valor === undefined || valor === null || valor === '' || 
               (Array.isArray(valor) && valor.length === 0)) {
                return '';
            }
            
            // Regra de Iteração (Arrays: SIGNIFICADOS, EXEMPLOS, IMAGENS, TEXTOS, VARIACOES, FRASES)
            if (Array.isArray(valor)) {
                const arrayResultados = valor.map(item => {
                    if (typeof item === 'object' && item !== null) {
                        // ✅ CORRIGIDO: Só verifica as chaves PRÓPRIAS do item, não do contexto herdado
                        const chavesProprias = Object.keys(item);
                        const temConteudoProprio = chavesProprias.some(k => {
                            const v = item[k];
                            return v !== null && v !== undefined && String(v).trim() !== '';
                        });
                        
                        if (!temConteudoProprio) return '';
                        
                        // Mescla o contexto: o item herda acesso aos dados globais, mas sobrescreve com os seus
                        const contextoItem = { ...contextoAtual, ...item };
                        return processar(conteudoInterno, contextoItem);
                    }
                    return ''; 
                });
                return arrayResultados.join('');
            }
            
            // Regra de Condição Simples (Booleans, Strings presentes)
            const novoContexto = (typeof valor === 'object' && valor !== null) 
                ? { ...contextoAtual, ...valor } 
                : contextoAtual;
                
            return processar(conteudoInterno, novoContexto);
        });
        
        // 2. Resolve variáveis simples de texto: {{ CHAVE }}
        const regexVariavel = /\{\{\s*(\w+)\s*\}\}/g;
        textoProcessado = textoProcessado.replace(regexVariavel, (match, chave) => {
            const valor = contextoAtual[chave];
            return (valor !== undefined && valor !== null) ? String(valor) : '';
        });
        
        return textoProcessado;
    }

    // Executa a árvore de renderização
    let resultado = processar(template, dados);

    // 3. Limpeza Final de Artefatos e Formatação
    resultado = resultado
        .replace(/#align\s*\(\s*center\s*\)\s*\[\s*\n?\s*\]/g, '')
        .replace(/#image\s*\(\s*"",[^)]*\)/g, '')
        .replace(/\*_\s*_\*/g, '')
        .replace(/^\s*\.\s*\.\s*$/gm, '')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();

    return resultado;
}

function log(msg, tipo = 'info') {
    const terminal = document.getElementById('terminal');
    if (!terminal) {
        console.log(`[${tipo}] ${msg}`);
        return;
    }
    const tempo = new Date().toLocaleTimeString();
    const classe = `log-${tipo}`;
    terminal.innerHTML += `<div><span class="log-time">[${tempo}]</span><span class="${classe}">${msg}</span></div>`;
    terminal.scrollTop = terminal.scrollHeight;
}

function limparTerminal() { 
    const terminal = document.getElementById('terminal');
    if (terminal) terminal.innerHTML = ''; 
    log('Terminal limpo', 'info'); 
}

async function copiarTerminal() { 
    try { 
        const terminal = document.getElementById('terminal');
        if (terminal) {
            await navigator.clipboard.writeText(terminal.innerText); 
            log('📋 Terminal copiado!', 'success'); 
        }
    } catch(e) { 
        log('Erro ao copiar', 'error'); 
    } 
}

// ============================================
// 3. FILE DROP SETUP E PROCESSAMENTO
// ============================================

// ============================================
// 3. FILE DROP SETUP E PROCESSAMENTO
// ============================================

function setupDropZone(zoneId, inputId, callback, accept = null) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) {
        console.warn(`Drop zone não encontrada: ${zoneId} ou ${inputId}`);
        return;
    }
    if (accept) input.accept = accept;
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => { 
        e.preventDefault(); 
        zone.classList.remove('dragover'); 
        const files = [...e.dataTransfer.files]; 
        if (files.length > 0 && callback) callback(files); 
    });
    input.addEventListener('change', e => { 
        const files = [...e.target.files]; 
        if (files.length > 0 && callback) callback(files); 
    });
}

// Configuração das drop zones principais
setupDropZone('csvDropZone', 'fileCsv', files => processarCSV(files[0]));
setupDropZone('alfabetoDropZone', 'fileAlfabeto', files => processarAlfabeto(files[0]));
setupDropZone('templateHtmlZone', 'fileTemplateHtml', files => processarTemplate(files[0], 'html'));
setupDropZone('templateHtmlLinearZone', 'fileTemplateHtmlLinear', files => processarTemplate(files[0], 'html-linear'));
setupDropZone('templateTypstZone', 'fileTemplateTypst', files => processarTemplate(files[0], 'typst'));
setupDropZone('textosDropZone', 'fileTextos', files => processarTextos(files[0]));

// Drop zones dos templates de entrada
// Upload entrada-card.html
setupDropZone('templateEntradaHtmlZone', 'fileTemplateEntradaCardHtml', files => {
    const reader = new FileReader();
    reader.onload = e => {
        // SEMPRE substitui, independente de já existir
        templateEntradaCardHtml = e.target.result;
        window.templateEntradaCardHtml = e.target.result;
        
        // Marca como loaded (upload manual)
        const statusEl = document.getElementById('templateEntradaCardHtmlStatus');
        const zoneEl = document.getElementById('templateEntradaHtmlZone');
        if (statusEl) statusEl.textContent = `✅ Customizado: ${files[0].name}`;
        if (zoneEl) zoneEl.classList.add('loaded');
        
        try { localStorage.setItem('csv2dmli_templateEntradaCardHtml', templateEntradaCardHtml); } catch(e) {}
        log('📝 Template entrada-card.html carregado', 'success');
    };
    reader.readAsText(files[0]);
});

// Upload entrada-linear.html
setupDropZone('templateEntradaLinearHtmlZone', 'fileTemplateEntradaLinearHtml', files => {
    const reader = new FileReader();
    reader.onload = e => {
        // SEMPRE substitui, independente de já existir
        templateEntradaLinearHtml = e.target.result;
        window.templateEntradaLinearHtml = e.target.result;
        
        // Marca como loaded (upload manual)
        const statusEl = document.getElementById('templateEntradaLinearHtmlStatus');
        const zoneEl = document.getElementById('templateEntradaLinearHtmlZone');
        if (statusEl) statusEl.textContent = `✅ Customizado: ${files[0].name}`;
        if (zoneEl) zoneEl.classList.add('loaded');
        
        try { localStorage.setItem('csv2dmli_templateEntradaLinearHtml', templateEntradaLinearHtml); } catch(e) {}
        log('📝 Template entrada-linear.html carregado', 'success');
    };
    reader.readAsText(files[0]);
});

// Upload entrada.typ
setupDropZone('templateEntradaTypstZone', 'fileTemplateEntradaTypst', files => {
    const reader = new FileReader();
    reader.onload = e => {
        // SEMPRE substitui, independente de já existir
        templateEntradaTypst = e.target.result;
        window.templateEntradaTypst = e.target.result;
        
        // Marca como loaded (upload manual)
        const statusEl = document.getElementById('templateEntradaTypstStatus');
        const zoneEl = document.getElementById('templateEntradaTypstZone');
        if (statusEl) statusEl.textContent = `✅ Customizado: ${files[0].name}`;
        if (zoneEl) zoneEl.classList.add('loaded');
        
        try { localStorage.setItem('csv2dmli_templateEntradaTypst', templateEntradaTypst); } catch(e) {}
        log('📝 Template entrada.typ carregado', 'success');
    };
    reader.readAsText(files[0]);
});

// Arquivos de configuração
setupDropZone('configFullDropZone', 'fileConfigFull', files => {
    const reader = new FileReader();
    reader.onload = e => {
        processarConfigCompleta(e.target.result);
        const zoneEl = document.getElementById('configFullDropZone');
        if (zoneEl) zoneEl.classList.add('loaded');
        log('⚙️ configuracao.txt carregado', 'success');
    };
    reader.readAsText(files[0]);
});

setupDropZone('introHtmlDropZone', 'fileIntroHtml', files => {
    const reader = new FileReader();
    reader.onload = e => {
        const el = document.getElementById('introMarkdown'); // CORRIGIDO: usa introMarkdown
        if (el) el.value = e.target.result;
        const zoneEl = document.getElementById('introHtmlDropZone');
        if (zoneEl) zoneEl.classList.add('loaded');
        salvarEstado();
        log('📄 intro_html.txt carregado', 'success');
    };
    reader.readAsText(files[0]);
});

setupDropZone('introPdfDropZone', 'fileIntroPdf', files => {
    const reader = new FileReader();
    reader.onload = e => {
        const el = document.getElementById('introMarkdown'); // CORRIGIDO: usa introMarkdown
        if (el) el.value = e.target.result;
        const zoneEl = document.getElementById('introPdfDropZone');
        if (zoneEl) zoneEl.classList.add('loaded');
        salvarEstado();
        log('📄 intro_pdf.txt carregado', 'success');
    };
    reader.readAsText(files[0]);
});

setupDropZone('referenciaDropZone', 'fileReferencia', files => {
    const reader = new FileReader();
    reader.onload = e => {
        VirtualFS.textosExtra['_referencia'] = e.target.result;
        VirtualFS.salvarCache();
        const zoneEl = document.getElementById('referenciaDropZone');
        if (zoneEl) zoneEl.classList.add('loaded');
        salvarEstado();
        log('📚 referencia.txt carregado', 'success');
    };
    reader.readAsText(files[0]);
});

function processarCSV(file) {
    log(`📄 Processando: ${file.name}`, 'cmd');
    Papa.parse(file, {
        header: true, 
        skipEmptyLines: true, 
        encoding: 'UTF-8',
        complete: results => {
            dadosGlobais = results.data.filter(linha => 
                Object.values(linha).some(v => v && String(v).trim() !== '')
            );
            colunasCsv = results.meta.fields || [];
            
            // Atualiza todos os indicadores visuais
            const elLinhas = document.getElementById('csvLinhas');
            const elColunas = document.getElementById('csvColunas');
            const elStatusCsv = document.getElementById('statusCsv');
            const elCardStatus = document.getElementById('statusCsvCard');
            const elBadgeCsv = document.getElementById('badgeCsv');
            const elZone = document.getElementById('csvDropZone');
            
            if (elLinhas) elLinhas.textContent = `${dadosGlobais.length} linhas`;
            if (elColunas) elColunas.textContent = `${colunasCsv.length} colunas`;
            if (elStatusCsv) elStatusCsv.textContent = `${dadosGlobais.length} linhas`;
            if (elZone) elZone.classList.add('loaded');
            if (elCardStatus) elCardStatus.classList.add('ok');
            if (elBadgeCsv) {
                elBadgeCsv.textContent = '✅ Carregado';
                elBadgeCsv.className = 'step-badge badge-ok';
            }
            
            extrairCategorias();
            popularEstrutura();
            aplicarConfiguracoesAosGrids();
            
            try {
                localStorage.setItem('csv2dmli_dados', JSON.stringify({ 
                    dados: dadosGlobais, 
                    colunas: colunasCsv, 
                    timestamp: Date.now() 
                }));
            } catch(e) {
                console.warn('Não foi possível salvar CSV no cache:', e);
            }
            
            log(`✅ CSV: ${dadosGlobais.length} linhas, ${colunasCsv.length} colunas`, 'success');
        },
        error: err => log(`❌ Erro CSV: ${err.message}`, 'error')
    });
}

function processarAlfabeto(file) {
    const reader = new FileReader();
    reader.onload = e => {
        VirtualFS.alfabeto = e.target.result.trim();
        const preview = document.getElementById('alfabetoPreview');
        if (preview) {
            preview.textContent = `Ordem: ${VirtualFS.alfabeto.substring(0, 80)}...`;
            preview.style.display = 'block';
        }
        const zone = document.getElementById('alfabetoDropZone');
        if (zone) zone.classList.add('loaded');
        try { localStorage.setItem('csv2dmli_alfabeto', VirtualFS.alfabeto); } catch(e) {}
        log('🔤 Alfabeto carregado', 'success');
    };
    reader.readAsText(file);
}

function processarTemplate(file, tipo) {
    const reader = new FileReader();
    reader.onload = e => {
        const conteudo = e.target.result;
        
        // SEMPRE substitui, independente de já existir
        if (tipo === 'html') VirtualFS.templateHtml = conteudo;
        else if (tipo === 'html-linear') VirtualFS.templateHtmlLinear = conteudo;
        else if (tipo === 'typst') VirtualFS.templateTypst = conteudo;
        
        const tipoKey = tipo === 'html-linear' ? 'html' : tipo;
        templatesCarregados[tipoKey] = true;
        
        // Marca como loaded e atualiza status (upload manual)
        const tipoCapitalized = tipo.charAt(0).toUpperCase() + tipo.slice(1);
        const statusEl = document.getElementById(`template${tipoCapitalized}Status`);
        const zoneEl = document.getElementById(`template${tipoCapitalized}Zone`);
        
        if (statusEl) statusEl.textContent = `✅ Customizado: ${file.name}`;
        if (zoneEl) zoneEl.classList.add('loaded');
        
        // Salva no localStorage SEMPRE
        try { localStorage.setItem(`csv2dmli_template_${tipo}`, conteudo); } catch(e) {}
        log(`🎨 Template ${tipo.toUpperCase()}: ${file.name}`, 'success');
        
        atualizarBadgeEstruturaTemplate();
    };
    reader.readAsText(file);
}

function processarConfigContent(conteudo) {
    const linhas = conteudo.split('\n');
    linhas.forEach(linha => {
        const parts = linha.split('=');
        if (parts.length >= 2) {
            const chave = parts[0].trim();
            const valor = parts.slice(1).join('=').trim();
            
            const mapaCampos = {
                'Titulo-html': 'metaHtml',
                'Titulo-pdf': 'metaPdf',
                'Autor(es)': 'metaAutor',
                'Data do Dicionário': 'metaAno'
            };
            
            if (mapaCampos[chave]) {
                const el = document.getElementById(mapaCampos[chave]);
                if (el) el.value = valor;
            }
            
            if (chave === 'Midias_inclusas') {
                const el = document.getElementById('swMidia');
                if (el) el.checked = (valor === '1');
            }
            if (chave === 'Alterar ordem dos campos') {
                const el = document.getElementById('swSemantic');
                if (el) el.checked = (valor === '1');
            }
            if (chave === 'Manter a ordem alfabética') {
                const el = document.getElementById('swAlpha');
                if (el) el.checked = (valor === '2');
            }
            if (chave === 'Ordem dos campos') VirtualFS.ordemCamposStr = valor;
            if (chave === 'Usar ordem alfabética') VirtualFS.usarOrdemAlfa = valor;
        }
    });
    if (categoriasUnicas.length > 0) aplicarConfiguracoesAosGrids();
    salvarEstado();
    log('⚙️ configuracao.txt carregado', 'success');
}

function processarTextos(file) {
    const reader = new FileReader();
    reader.onload = e => {
        try { 
            const json = JSON.parse(e.target.result);
            const textosMap = {};
            const textosArray = json.textos || (Array.isArray(json) ? json : Object.values(json));
            
            if (Array.isArray(textosArray)) {
                textosArray.forEach(texto => {
                    if (texto.titulo_base) {
                        textosMap[texto.titulo_base] = texto;
                    }
                });
            } else {
                Object.assign(textosMap, textosArray);
            }
            
            VirtualFS.textosExtra = textosMap;
            
            // 🔍 DEBUG 1: Verificar estrutura
            console.log('📦 TEXTOS CARREGADOS:');
            console.log('  Total:', Object.keys(textosMap).length);
            console.log('  Chaves:', Object.keys(textosMap).slice(0, 5));
            console.log('  Exemplo:', textosMap[Object.keys(textosMap)[0]]);
            console.log('  Estrutura de uma variação:', 
                textosMap[Object.keys(textosMap)[0]]?.textos_variacoes?.[0]);
            
            const zone = document.getElementById('textosDropZone');
            if (zone) zone.classList.add('loaded');
            
            const qtdTextos = Object.keys(textosMap).length;
            log(`📝 textos.json carregado (${qtdTextos} títulos base)`, 'success');
        } 
        catch(err) { 
            log(`❌ Erro no textos.json: ${err.message}`, 'error');
            console.error(err);
        }
    };
    reader.readAsText(file);
}
function carregarPasta(tipo) {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.onchange = e => {
        const files = [...e.target.files];
        const adicionados = VirtualFS.adicionarArquivos(tipo, files);
        if (adicionados === 0) log(`⚠️ Nenhum arquivo válido para ${tipo}`, 'warning');
    };
    input.click();
}

// ============================================
// 4. ESTRUTURA E CATEGORIAS
// ============================================

function extrairCategorias() {
    const cats = new Set();
    dadosGlobais.forEach(linha => { 
        const cat = String(linha['CAMPO_SEMANTICO'] || linha['campo_semantico'] || '').trim(); 
        if (cat) cats.add(cat); 
    });
    categoriasUnicas = [...cats].sort();
    const el = document.getElementById('csvCategorias');
    if (el) el.textContent = `${categoriasUnicas.length} categorias`;
}

function popularEstrutura() {
    const gridAlpha = document.getElementById('gridAlpha');
    if (gridAlpha) {
        gridAlpha.innerHTML = '';
        categoriasUnicas.forEach(cat => { 
            gridAlpha.innerHTML += `<label class="checkbox-tag"><input type="checkbox" class="cat-checkbox" value="${cat}" checked onchange="salvarEstado()">${cat}</label>`; 
        });
    }

    const gridSemantic = document.getElementById('gridSemantic');
    if (gridSemantic) {
        gridSemantic.innerHTML = '';
        categoriasUnicas.forEach((cat, i) => {
            const item = document.createElement('div');
            item.className = 'sortable-item';
            item.dataset.category = cat;
            item.innerHTML = `<span class="handle" style="cursor: grab; touch-action: none;">☰</span><span>${cat}</span><span style="margin-left:auto;font-size:11px;color:var(--text-muted);">#${i + 1}</span>`;
            gridSemantic.appendChild(item);
        });
        
        if (!gridSemantic.dataset.pointerAtivo) {
            let itemArrastado = null;

            gridSemantic.addEventListener('pointerdown', e => {
                const handle = e.target.closest('.handle');
                if (!handle) return;
                const item = handle.closest('.sortable-item');
                if (!item) return;

                itemArrastado = item;
                itemArrastado.classList.add('dragging');
                e.preventDefault();
            });

            document.addEventListener('pointermove', e => {
                if (!itemArrastado) return;
                e.preventDefault();
                const after = getDragAfterElement(gridSemantic, e.clientY);
                if (after) {
                    gridSemantic.insertBefore(itemArrastado, after);
                } else {
                    gridSemantic.appendChild(itemArrastado);
                }
            }, { passive: false });

            document.addEventListener('pointerup', e => {
                if (!itemArrastado) return;
                itemArrastado.classList.remove('dragging');
                itemArrastado = null;
                salvarEstado();
            });

            document.addEventListener('pointercancel', e => {
                if (!itemArrastado) return;
                itemArrastado.classList.remove('dragging');
                itemArrastado = null;
                salvarEstado();
            });

            gridSemantic.dataset.pointerAtivo = 'true';
        }
    }
}

function aplicarConfiguracoesAosGrids() {
    if (!categoriasUnicas || categoriasUnicas.length === 0) return;
    
    if (VirtualFS.ordemCamposStr) {
        const indices = VirtualFS.ordemCamposStr.split(',').map(n => parseInt(n.trim()));
        const gridSemantic = document.getElementById('gridSemantic');
        if (!gridSemantic) return;
        
        const items = Array.from(gridSemantic.children);
        if (indices.length > 0 && indices.length <= categoriasUnicas.length) {
            gridSemantic.innerHTML = '';
            const itemMap = new Map(); 
            items.forEach(item => itemMap.set(item.dataset.category, item));
            indices.forEach(i => { 
                const cat = categoriasUnicas[i]; 
                if (cat && itemMap.has(cat)) { 
                    gridSemantic.appendChild(itemMap.get(cat)); 
                    itemMap.delete(cat); 
                } 
            });
            itemMap.forEach((item) => gridSemantic.appendChild(item));
        }
    }
    
    if (VirtualFS.usarOrdemAlfa) {
        const catsAlfa = new Set(VirtualFS.usarOrdemAlfa.split(',').map(s => s.trim().toLowerCase()));
        document.querySelectorAll('.cat-checkbox').forEach(chk => { 
            chk.checked = !catsAlfa.has(chk.value.toLowerCase()); 
        });
    }
}

function getDragAfterElement(container, y) {
    const items = [...container.querySelectorAll('.sortable-item:not(.dragging)')];
    return items.reduce((closest, child) => { 
        const box = child.getBoundingClientRect(); 
        const offset = y - box.top - box.height / 2; 
        return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest; 
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function obterOrdemAlfabetica() { 
    return [...document.querySelectorAll('#gridAlpha .cat-checkbox:checked')].map(cb => cb.value.trim().toLowerCase()); 
}

function obterOrdemManual() { 
    const grid = document.getElementById('gridSemantic');
    if (!grid) return [];
    return [...grid.querySelectorAll('.sortable-item')].map(item => item.dataset.category); 
}

// ============================================
// 5. GERENCIAMENTO DE TEMPLATES
// ============================================

async function carregarTemplatesPadrao() {
    const templates = [
        { tipo: 'html', arquivo: 'dicionario.html', var: 'templateHtml', zona: 'templateHtmlZone', status: 'templateHtmlStatus' },
        { tipo: 'html-linear', arquivo: 'dicionario-linear.html', var: 'templateHtmlLinear', zona: 'templateHtmlLinearZone', status: 'templateHtmlLinearStatus' },
        { tipo: 'typst', arquivo: 'dicionario.typ', var: 'templateTypst', zona: 'templateTypstZone', status: 'templateTypstStatus' }
    ];
    
    for (const t of templates) {
        // 1. PRIMEIRO: Verifica se tem template customizado no cache (upload manual)
        const cached = localStorage.getItem(`csv2dmli_template_${t.tipo}`);
        if (cached) {
            VirtualFS[t.var] = cached;
            templatesCarregados[t.tipo === 'html-linear' ? 'html' : t.tipo] = true;
            
            // SÓ marca como loaded se foi upload manual (cache)
            const statusEl = document.getElementById(t.status);
            const zonaEl = document.getElementById(t.zona);
            if (statusEl) statusEl.textContent = '✅ Customizado';
            if (zonaEl) zonaEl.classList.add('loaded');
            
            log(`📋 Template ${t.tipo} restaurado do cache (customizado)`, 'success');
            continue;
        }
        
        // 2. SEGUNDO: Carrega da pasta templates/ silenciosamente (sem marcar como loaded)
        if (VirtualFS[t.var] === null || VirtualFS[t.var] === undefined) {
            try {
                const response = await fetch(`templates/${t.arquivo}`);
                if (response.ok) {
                    VirtualFS[t.var] = await response.text();
                    templatesCarregados[t.tipo === 'html-linear' ? 'html' : t.tipo] = true;
                    
                    // NÃO marca como loaded - é o padrão da pasta
                    // NÃO atualiza o texto do status
                    
                    log(`📋 Template ${t.tipo} carregado da pasta (padrão)`, 'success');
                }
            } catch(e) {
                log(`⚠️ Template ${t.tipo} não encontrado em templates/${t.arquivo}`, 'warning');
            }
        }
    }
    
    atualizarBadgeEstruturaTemplate();
}

function atualizarBadgeEstruturaTemplate() {
    const todosOk = templatesCarregados.html && templatesCarregados.typst;
    const badgeEstrutura = document.getElementById('badgeEstrutura');
    if (badgeEstrutura) {
        if (todosOk) {
            badgeEstrutura.textContent = '✅ Templates OK';
            badgeEstrutura.className = 'step-badge badge-ok';
        } else if (templatesCarregados.html || templatesCarregados.typst) {
            badgeEstrutura.textContent = '⚠️ Parcial';
            badgeEstrutura.className = 'step-badge badge-warning';
        } else {
            badgeEstrutura.textContent = 'Automático';
            badgeEstrutura.className = 'step-badge';
        }
    }
}

function usarTemplatePadrao(tipo, event) {
    // Impede que o clique propague para a drop zone
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    const configs = {
        'html': { var: 'templateHtml', arquivo: 'dicionario.html', status: 'templateHtmlStatus', zona: 'templateHtmlZone', storageKey: 'csv2dmli_template_html' },
        'html-linear': { var: 'templateHtmlLinear', arquivo: 'dicionario-linear.html', status: 'templateHtmlLinearStatus', zona: 'templateHtmlLinearZone', storageKey: 'csv2dmli_template_html-linear' },
        'typst': { var: 'templateTypst', arquivo: 'dicionario.typ', status: 'templateTypstStatus', zona: 'templateTypstZone', storageKey: 'csv2dmli_template_typst' }
    };
    
    const cfg = configs[tipo];
    if (!cfg) return;
    
    const confirmar = confirm(`Voltar ao template padrão para ${tipo.toUpperCase()}?\n\nO template personalizado será removido e o padrão será restaurado.`);
    if (!confirmar) return;
    
    // Mostra feedback visual
    const statusEl = document.getElementById(cfg.status);
    const zonaEl = document.getElementById(cfg.zona);
    
    if (statusEl) {
        statusEl.textContent = 'Carregando padrão...';
        statusEl.style.color = 'var(--primary)';
    }
    
    // Limpa o template atual
    VirtualFS[cfg.var] = null;
    const tipoKey = tipo === 'html-linear' ? 'html' : tipo;
    templatesCarregados[tipoKey] = false;
    
    // Remove do localStorage
    try { 
        localStorage.removeItem(cfg.storageKey); 
    } catch(e) {}
    
    // Tenta carregar o template padrão
    fetch(`templates/${cfg.arquivo}`)
        .then(r => r.ok ? r.text() : Promise.reject())
        .then(conteudo => {
            VirtualFS[cfg.var] = conteudo;
            templatesCarregados[tipoKey] = true;
            
            if (statusEl) { 
                statusEl.textContent = 'Padrão (pasta)'; 
                statusEl.style.color = '#10b981';
            }
            if (zonaEl) {
                zonaEl.classList.add('loaded');
                zonaEl.classList.remove('custom');
            }
            
            atualizarBadgeEstruturaTemplate();
            log(`📋 Template ${tipo.toUpperCase()} restaurado ao padrão`, 'success');
        })
        .catch(() => {
            if (statusEl) { 
                statusEl.textContent = '❌ Padrão não encontrado'; 
                statusEl.style.color = '#ef4444'; 
            }
            if (zonaEl) {
                zonaEl.classList.remove('loaded', 'custom');
            }
            atualizarBadgeEstruturaTemplate();
            log(`❌ Template padrão ${cfg.arquivo} não encontrado na pasta templates/`, 'error');
            log('💡 Verifique se a pasta templates/ existe com os arquivos padrão', 'info');
        });
}

// ============================================
// 6. UTILITÁRIOS DE TEXTO
// ============================================


function markdownParaHTML(md) {
    if (!md) return '';
    
    try {
        // Usa a biblioteca marked para converter Markdown → HTML
        if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
            return marked.parse(md);
        } else {
            throw new Error('marked não disponível');
        }
    } catch (err) {
        console.warn('⚠️ Usando fallback para conversão Markdown → HTML:', err.message);
        
        // Fallback básico
        let result = md;
        
        // Escape HTML primeiro
        result = result.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // Cabeçalhos (do maior para o menor)
        result = result.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
        result = result.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        result = result.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        result = result.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        
        // Negrito + Itálico (combinado primeiro)
        result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        
        // Negrito
        result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // Itálico
        result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
        
        // Tachado
        result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');
        
        // Links (antes de imagens para evitar conflito)
        result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;">');
        result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        
        // Código inline
        result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Linha horizontal
        result = result.replace(/^[-\*_]{3,}$/gm, '<hr>');
        
        // Parágrafos
        const blocos = result.split(/\n\n+/);
        result = blocos.map(bloco => {
            bloco = bloco.trim();
            if (!bloco) return '';
            // Se já é um elemento HTML em bloco, não envolve em <p>
            if (/^<(h[1-6]|hr|ul|ol|li|pre|blockquote|img|div|table)/.test(bloco)) {
                return bloco;
            }
            // Converte quebras de linha simples em <br>
            return '<p>' + bloco.replace(/\n/g, '<br>') + '</p>';
        }).join('\n');
        
        return result;
    }
}

function markdownParaTypst(md) {
    if (!md) return '';
    
    try {
        // Verifica se a biblioteca markdown2typst foi carregada
        if (typeof window.markdown2typst === 'function') {
            return window.markdown2typst(md);
        } else {
            throw new Error('markdown2typst não disponível');
        }
    } catch (err) {
        console.warn('⚠️ Usando fallback para conversão Markdown → Typst:', err.message);
        
        // Fallback básico
        let result = md;
        
        // Cabeçalhos (do maior para o menor)
        result = result.replace(/^#### (.+)$/gm, '==== $1');
        result = result.replace(/^### (.+)$/gm, '=== $1');
        result = result.replace(/^## (.+)$/gm, '== $1');
        result = result.replace(/^# (.+)$/gm, '= $1');
        
        // Negrito + Itálico (combinado primeiro)
        result = result.replace(/\*\*\*(.+?)\*\*\*/g, '#strong[#emph[$1]]');
        
        // Negrito
        result = result.replace(/\*\*(.+?)\*\*/g, '#strong[$1]');
        
        // Itálico
        result = result.replace(/\*(.+?)\*/g, '#emph[$1]');
        
        // Tachado
        result = result.replace(/~~(.+?)~~/g, '#strike[$1]');
        
        // Links (antes de imagens para evitar conflito)
        result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '#image("$2", alt: "$1")');
        result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '#link("$2")[$1]');
        
        // Código inline
        result = result.replace(/`([^`]+)`/g, '#mono[$1]');
        
        // Listas não ordenadas
        result = result.replace(/^[\*\-] (.+)$/gm, '- $1');
        
        // Listas numeradas
        result = result.replace(/^\d+\. (.+)$/gm, '+ $1');
        
        // Linha horizontal
        result = result.replace(/^[-\*_]{3,}$/gm, '#line(length: 100%)');
        
        // Espaçamento de parágrafos
        result = result.replace(/\n\n+/g, '\n\n#v(0.5em)\n\n');
        
        return result.trim();
    }
}

function previewIntroducao() {
    const markdown = document.getElementById('introMarkdown')?.value || '';
    
    if (!markdown.trim()) {
        log('⚠️ Nenhum conteúdo para pré-visualizar', 'warning');
        return;
    }
    
    const htmlPreview = markdownParaHTML(markdown);
    const typstPreview = markdownParaTypst(markdown);
    
    let conteudo = '';
    
    // Abas para alternar entre HTML e Typst
    conteudo += `
        <div style="display: flex; gap: 0; margin-bottom: 16px; border-bottom: 2px solid var(--border-color);">
            <button onclick="switchPreviewTab('html')" id="previewTabHtml" 
                style="padding: 8px 16px; border: none; background: var(--primary); color: white; border-radius: 6px 6px 0 0; cursor: pointer; font-weight: 600;">
                🌐 HTML
            </button>
            <button onclick="switchPreviewTab('typst')" id="previewTabTypst" 
                style="padding: 8px 16px; border: none; background: transparent; color: var(--text-muted); border-radius: 6px 6px 0 0; cursor: pointer; font-weight: 600;">
                📘 Typst
            </button>
        </div>
    `;
    
    // Conteúdo HTML
    conteudo += `
        <div id="previewContentHtml" style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; max-height: 400px; overflow-y: auto; display: block;">
            ${htmlPreview}
        </div>
    `;
    
    // Conteúdo Typst
    conteudo += `
        <div id="previewContentTypst" style="background: #1e293b; color: #e2e8f0; border-radius: 8px; padding: 16px; max-height: 400px; overflow-y: auto; font-family: 'Fira Code', monospace; font-size: 12px; white-space: pre-wrap; display: none;">
            ${typstPreview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </div>
    `;
    
    mostrarModal('👁️ Pré-visualização da Introdução', conteudo);
    log('👁️ Pré-visualização da introdução gerada', 'info');
}

// Função para alternar entre as abas de preview
function switchPreviewTab(tab) {
    const htmlContent = document.getElementById('previewContentHtml');
    const typstContent = document.getElementById('previewContentTypst');
    const htmlTab = document.getElementById('previewTabHtml');
    const typstTab = document.getElementById('previewTabTypst');
    
    if (tab === 'html') {
        htmlContent.style.display = 'block';
        typstContent.style.display = 'none';
        htmlTab.style.background = 'var(--primary)';
        htmlTab.style.color = 'white';
        typstTab.style.background = 'transparent';
        typstTab.style.color = 'var(--text-muted)';
    } else {
        htmlContent.style.display = 'none';
        typstContent.style.display = 'block';
        typstTab.style.background = 'var(--primary)';
        typstTab.style.color = 'white';
        htmlTab.style.background = 'transparent';
        htmlTab.style.color = 'var(--text-muted)';
    }
}


function limparListaPipe(valor) {
    if (!valor || String(valor).trim() === '' || String(valor).toLowerCase() === 'nan') return [];
    return String(valor).split('|').map(v => v.trim()).filter(v => v);
}



function escaparTypst(texto) {
    if (!texto) return '';
    let resultado = String(texto);
    const escapes = {
        '\\': '\\\\', '#': '\\#', '*': '\\*', '_': '\\_', '$': '\\$',
        '[': '\\[', ']': '\\]', '(': '\\(', ')': '\\)', '{': '\\{', '}': '\\}',
        '`': '\\`', '|': '\\|', '~': '\\~', '=': '\\=', '+': '\\+', '/': '\\/',
        '&': '\\&', '%': '\\%', '@': '\\@', '!': '\\!', '?': '\\?', ';': '\\;',
        ':': '\\:', '>': '\\>', '<': '\\<'
    };
    resultado = resultado.replace(/[\\#*_$[\](){}`|~=+\/&%@!?;:><]/g, (match) => escapes[match] || match);
    return resultado;
}

function converterMarkdownSimples(texto) {
    if (!texto) return '';
    return texto
        .replace(/^### (.*)/gm, '<h3>$1</h3>')
        .replace(/^## (.*)/gm, '<h2>$1</h2>')
        .replace(/^# (.*)/gm, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

function stripAccents(s) { 
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); 
}

function baixarArquivo(conteudo, nome, mime) {
    const blob = new Blob([conteudo], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    log(`👁️ Visualizando: ${nome} (${(blob.size/1024).toFixed(1)} KB)`, 'success');
}

// ============================================
// 7. NORMALIZAÇÃO DE DADOS
// ============================================





// ============================================
// 7. NORMALIZAÇÃO DE DADOS - CORRIGIDO
// ============================================

function normalizarDados(df) {
    const db = { entradas: {}, variacoes: {}, significados: {}, exemplos: {}, imagens: {} };
    let contEntradas = 1;
    const mapaEntradas = {};
    
    const regexSubCampo = /^SUB_CAMPO_SEMANTICO(_\d+)?$/i;
    const colunasSub = Object.keys(df[0] || {}).filter(col => regexSubCampo.test(col)).sort();

    const colunasPadrao = new Set([
        'ITEM_LEXICAL','CLASSE_GRAMATICAL','CAMPO_SEMANTICO','ITENS_RELACIONADOS',
        'ARQUIVO_SONORO','TRANSCRICAO_FONEMICA','TRANSCRICAO_FONETICA',
        'TRADUCAO_SIGNIFICADO','DESCRICAO','ARQUIVO_SONORO_EXEMPLO',
        'TRANSCRICAO_EXEMPLO','TRADUCAO_EXEMPLO','IMAGEM','LEGENDA_IMAGEM',
        'ARQUIVO_VIDEO','TEXTO', ...colunasSub
    ]);
    const colunasExtras = Object.keys(df[0] || {}).filter(c => !colunasPadrao.has(c) && !c.startsWith('#'));

    df.forEach((linha, index) => {
        const lexicaisRaw = limparListaPipe(linha['ITEM_LEXICAL']);
        if (lexicaisRaw.length === 0) return;

        const termoPrincipal = lexicaisRaw[0].trim().toLowerCase();
        const classe = String(linha['CLASSE_GRAMATICAL'] || '').trim().toLowerCase();
        const categoria = String(linha['CAMPO_SEMANTICO'] || '').trim().toLowerCase();
        const subCampos = colunasSub.map(col => String(linha[col] || '').trim()).filter(v => v && v.toLowerCase() !== 'nan');
        const subCamposChave = subCampos.map(s => s.toLowerCase()).join('|');
        const chaveAgrupamento = `${termoPrincipal}##${classe}##${categoria}##${subCamposChave}`;
        
        let idEntrada = mapaEntradas[chaveAgrupamento];
        if (!idEntrada) {
            idEntrada = `ENT_${String(contEntradas).padStart(5, '0')}`;
            mapaEntradas[chaveAgrupamento] = idEntrada;
            contEntradas++;
            db.entradas[idEntrada] = {
                ID: idEntrada, 
                _ORDEM_ORIGINAL: index, 
                _TERMO_PRINCIPAL: lexicaisRaw[0],
                CLASSE_GRAMATICAL: String(linha['CLASSE_GRAMATICAL'] || '').trim(),
                CAMPO_SEMANTICO: String(linha['CAMPO_SEMANTICO'] || '').trim(),
                SUB_CAMPOS_SEMANTICOS: subCampos,
                ITENS_RELACIONADOS: String(linha['ITENS_RELACIONADOS'] || '').trim(),
                TEXTOS_ESTRUTURADOS: [],
                VARIACOES_IDS: [], 
                ACEPCOES: []
            };
        }
        const entrada = db.entradas[idEntrada];
        
        // ========== VARIAÇÕES ==========
        const audios = limparListaPipe(linha['ARQUIVO_SONORO']);
        const fonemicas = limparListaPipe(linha['TRANSCRICAO_FONEMICA']);
        const foneticas = limparListaPipe(linha['TRANSCRICAO_FONETICA']);
        const maxVars = Math.max(lexicaisRaw.length, audios.length, fonemicas.length, foneticas.length);
        
        for (let i = 0; i < maxVars; i++) {
            const lex = lexicaisRaw[i] || '';
            if (lex && !entrada.VARIACOES_IDS.some(vid => db.variacoes[vid] && db.variacoes[vid].TRANSCRICAO_ORTOGRAFICA === lex)) {
                const idVar = `${idEntrada}_var_${entrada.VARIACOES_IDS.length + 1}`;
                db.variacoes[idVar] = { 
                    ID: idVar, 
                    TRANSCRICAO_ORTOGRAFICA: lex, 
                    ARQUIVO_SONORO: audios[i] || '', 
                    TRANSCRICAO_FONEMICA: fonemicas[i] || '', 
                    TRANSCRICAO_FONETICA: foneticas[i] || '' 
                };
                entrada.VARIACOES_IDS.push(idVar);
            }
        }
        
        // ========== TEXTOS ESTRUTURADOS (CORRIGIDO - NÃO VAI PARA COMPLEMENTOS) ==========
        const complementos = [];
        const titulosBusca = limparListaPipe(linha['TEXTO']);
        
        titulosBusca.forEach(tit => {

            console.log(tit)
            if (!tit) return;

            const fonteTextos = VirtualFS.textosExtra;
            console.log(fonteTextos);
            const textoMatch = fonteTextos && fonteTextos[tit];
            
            if (textoMatch && typeof textoMatch === 'object' && textoMatch.titulo_base) {
                const jaExiste = entrada.TEXTOS_ESTRUTURADOS.some(t => t.TITULO_BASE === textoMatch.titulo_base);
                
                if (!jaExiste) {
                    const textoFormatado = {
                        TITULO_BASE: textoMatch.titulo_base,
                        TEXTO_NAO_LITERAL: textoMatch.texto_nao_literal || '',
                        VARIACOES: []
                    };

                    if (textoMatch.textos_variacoes && Array.isArray(textoMatch.textos_variacoes)) {
                        textoMatch.textos_variacoes.forEach(v => {
                            const variacao = { ID_VARIACAO: v.id_variacao || '', FRASES: [] };
                            if (v.frases && Array.isArray(v.frases)) {
                                v.frases.forEach(f => {
                                    variacao.FRASES.push({
                                        ORIGINAL: f.texto_original || '',
                                        TRADUCAO: f.traducao || '',
                                        AUDIO_SRC: (f.audio && f.audio.arquivo) ? 
                                            f.audio.arquivo.replace(/\\\\/g, '/') : 
                                            ((f.audio && f.audio.dados) ? `data:audio/mp3;base64,${f.audio.dados}` : ''),
                                        ARQUIVO_ORIGEM: f.arquivo_origem || ''
                                    });
                                });
                            }
                            textoFormatado.VARIACOES.push(variacao);
                        });
                    }
                    entrada.TEXTOS_ESTRUTURADOS.push(textoFormatado);
                }
                // ✅ CORRIGIDO: Não adiciona aos complementos quando acha no JSON
                // Apenas return para não cair no fallback
                return;
            }

            // ⚠️ Fallback: só adiciona aos complementos se NÃO for um texto estruturado
            // e se for um texto simples (string) ou não encontrado
            if (fonteTextos && typeof fonteTextos[tit] === 'string') {
                complementos.push(`<b>${tit}:</b> ${fonteTextos[tit]}`);
            } else if (!fonteTextos || !fonteTextos[tit]) {
                // Só avisa se realmente não encontrou nada
                complementos.push(`<b>${tit}:</b> [conteúdo não encontrado]`);
            }
        });

        // Colunas extras (NÃO relacionadas a texto) vão para complementos
        colunasExtras.forEach(col => {
            const val = String(linha[col] || '').trim();
            if (val && val.toLowerCase() !== 'nan') complementos.push(`<b>${col}:</b> ${val}`);
        });
        
        // ========== ACEPÇÕES ==========
        const traducoes = limparListaPipe(linha['TRADUCAO_SIGNIFICADO']);
        const descricoes = limparListaPipe(linha['DESCRICAO']);
        const exAudios = limparListaPipe(linha['ARQUIVO_SONORO_EXEMPLO']);
        const exTrans = limparListaPipe(linha['TRANSCRICAO_EXEMPLO']);
        const exTrads = limparListaPipe(linha['TRADUCAO_EXEMPLO']);
        const imagens = limparListaPipe(linha['IMAGEM']);
        const legendas = limparListaPipe(linha['LEGENDA_IMAGEM']);
        const videos = limparListaPipe(linha['ARQUIVO_VIDEO']);
        
        const maxAceps = Math.max(
            traducoes.length, descricoes.length, 
            exAudios.length, exTrans.length, exTrads.length, 
            imagens.length, legendas.length, videos.length
        );
        
        // ✅ CORRIGIDO: complementos agora só têm colunas extras, não textos estruturados
        const temComplementos = complementos.length > 0;
        
        for (let i = 0; i < maxAceps; i++) {
            const trad = traducoes[i] || '';
            const desc = descricoes[i] || '';
            const eAud = exAudios[i] || '';
            const eTrans = exTrans[i] || '';
            const eTrad = exTrads[i] || '';
            const img = imagens[i] || '';
            const leg = legendas[i] || '';
            const vid = videos[i] || '';
            
            let idSigAtual = null;
            let idExNovo = null;
            let idImgNovo = null;
            
            if (trad || desc) {
                const chaveSig = `${trad.trim().toLowerCase()}||${desc.trim().toLowerCase()}`;
                idSigAtual = Object.keys(db.significados).find(k => {
                    const s = db.significados[k];
                    return `${(s.TRADUCAO || '').trim().toLowerCase()}||${(s.DESCRICAO || '').trim().toLowerCase()}` === chaveSig;
                });
                if (!idSigAtual) {
                    idSigAtual = `SIG_${String(Object.keys(db.significados).length + 1).padStart(5, '0')}`;
                    db.significados[idSigAtual] = { ID: idSigAtual, TRADUCAO: trad, DESCRICAO: desc };
                }
            }
            
            if (eTrans || eTrad) {
                idExNovo = `${idEntrada}_ex_${Object.keys(db.exemplos).length + 1}`;
                db.exemplos[idExNovo] = { 
                    ID: idExNovo, 
                    ARQUIVO_SONORO_EXEMPLO: eAud, 
                    TRANSCRICAO_EXEMPLO: eTrans, 
                    TRADUCAO_EXEMPLO: eTrad 
                };
            }
            
            if (img) {
                idImgNovo = `${idEntrada}_img_${Object.keys(db.imagens).length + 1}`;
                db.imagens[idImgNovo] = { 
                    ID: idImgNovo, 
                    IMAGEM: img, 
                    LEGENDA_IMAGEM: leg 
                };
            }
            
            if (idSigAtual || idExNovo || idImgNovo || vid || temComplementos) {
                let acepcaoAlvo = null;
                
                if (idSigAtual) {
                    acepcaoAlvo = entrada.ACEPCOES.find(ac => ac.SIGNIFICADO_ID === idSigAtual);
                }
                
                if (!acepcaoAlvo) {
                    if (entrada.ACEPCOES.length > 0 && !idSigAtual) {
                        acepcaoAlvo = entrada.ACEPCOES[entrada.ACEPCOES.length - 1];
                    } else {
                        acepcaoAlvo = {
                            SIGNIFICADO_ID: idSigAtual,
                            EXEMPLOS_IDS: [],
                            IMAGENS_IDS: [],
                            ARQUIVOS_VIDEO: [],
                            EXTRAS: []
                        };
                        entrada.ACEPCOES.push(acepcaoAlvo);
                    }
                }
                
                if (idExNovo && !acepcaoAlvo.EXEMPLOS_IDS.includes(idExNovo)) acepcaoAlvo.EXEMPLOS_IDS.push(idExNovo);
                if (idImgNovo && !acepcaoAlvo.IMAGENS_IDS.includes(idImgNovo)) acepcaoAlvo.IMAGENS_IDS.push(idImgNovo);
                if (vid && !acepcaoAlvo.ARQUIVOS_VIDEO.includes(vid)) acepcaoAlvo.ARQUIVOS_VIDEO.push(vid);
                
                // ✅ Só adiciona complementos (colunas extras) se não for a primeira acepção
                // ou se não houver significados
                if (!acepcaoAlvo.EXTRAS) acepcaoAlvo.EXTRAS = [];
                if (temComplementos) {
                    for (const comp of complementos) {
                        if (!acepcaoAlvo.EXTRAS.includes(comp)) acepcaoAlvo.EXTRAS.push(comp);
                    }
                }
            }
        }
        
        // ========== ITENS RELACIONADOS ==========
        const novoRelacionado = String(linha['ITENS_RELACIONADOS'] || '').trim();
        if (novoRelacionado && !entrada.ITENS_RELACIONADOS.includes(novoRelacionado)) {
            entrada.ITENS_RELACIONADOS = entrada.ITENS_RELACIONADOS 
                ? `${entrada.ITENS_RELACIONADOS} | ${novoRelacionado}` 
                : novoRelacionado;
        }
    });
    
    return db;
}


function normalizarDadosParaTypst(df, textos_db = {}) {
    // Mesma estrutura que normalizarDados
    const db = { entradas: {}, variacoes: {}, significados: {}, exemplos: {}, imagens: {} };
    let contEntradas = 1;
    const mapaEntradas = {};
    
    const regexSubCampo = /^SUB_CAMPO_SEMANTICO(_\d+)?$/i;
    const colunasSub = Object.keys(df[0] || {}).filter(col => regexSubCampo.test(col)).sort();

    const colunasPadrao = new Set([
        'ITEM_LEXICAL','CLASSE_GRAMATICAL','CAMPO_SEMANTICO','ITENS_RELACIONADOS',
        'ARQUIVO_SONORO','TRANSCRICAO_FONEMICA','TRANSCRICAO_FONETICA',
        'TRADUCAO_SIGNIFICADO','DESCRICAO','ARQUIVO_SONORO_EXEMPLO',
        'TRANSCRICAO_EXEMPLO','TRADUCAO_EXEMPLO','IMAGEM','LEGENDA_IMAGEM',
        'ARQUIVO_VIDEO','TEXTO', ...colunasSub
    ]);
    const colunasExtras = Object.keys(df[0] || {}).filter(c => !colunasPadrao.has(c));

    // ✅ Prepara mapa de textos combinando textos_db + VirtualFS.textosExtra
    function getTextosMap() {
        const mapa = {};
        
        // Primeiro: textos_db (parâmetro da função)
        if (Array.isArray(textos_db)) {
            textos_db.forEach(t => {
                if (t.titulo_base) mapa[t.titulo_base] = t;
            });
        } else if (textos_db && typeof textos_db === 'object') {
            Object.assign(mapa, textos_db);
        }
        
        // Depois: VirtualFS.textosExtra (carregado do JSON)
        const virtualTextos = VirtualFS.textosExtra;
        if (virtualTextos && typeof virtualTextos === 'object') {
            // Verifica se é o JSON bruto ou já é o mapa
            if (virtualTextos.textos && Array.isArray(virtualTextos.textos)) {
                // É o JSON bruto { configuracoes, textos: [...] }
                virtualTextos.textos.forEach(t => {
                    if (t.titulo_base && !mapa[t.titulo_base]) {
                        mapa[t.titulo_base] = t;
                    }
                });
            } else {
                // Já é o mapa indexado
                for (const [chave, valor] of Object.entries(virtualTextos)) {
                    if (chave !== '_referencia' && valor && typeof valor === 'object' && valor.titulo_base && !mapa[chave]) {
                        mapa[chave] = valor;
                    }
                }
            }
        }
        
        return mapa;
    }
    
    const textosMap = getTextosMap();

    df.forEach((linha, index) => {
        const lexicaisRaw = limparListaPipe(linha['ITEM_LEXICAL']);
        if (lexicaisRaw.length === 0) return;

        const termoPrincipal = lexicaisRaw[0].trim().toLowerCase();
        const classe = String(linha['CLASSE_GRAMATICAL'] || '').trim().toLowerCase();
        const categoria = String(linha['CAMPO_SEMANTICO'] || '').trim().toLowerCase();
        const subCampos = colunasSub.map(col => String(linha[col] || '').trim()).filter(v => v && v.toLowerCase() !== 'nan');
        const subCamposChave = subCampos.map(s => s.toLowerCase()).join('|');
        const chaveAgrupamento = `${termoPrincipal}##${classe}##${categoria}##${subCamposChave}`;
        
        let idEntrada = mapaEntradas[chaveAgrupamento];
        if (!idEntrada) {
            idEntrada = `ENT_${String(contEntradas).padStart(5, '0')}`;
            mapaEntradas[chaveAgrupamento] = idEntrada;
            contEntradas++;
            db.entradas[idEntrada] = {
                ID: idEntrada, 
                _ORDEM_ORIGINAL: index, 
                _TERMO_PRINCIPAL: lexicaisRaw[0],
                CLASSE_GRAMATICAL: String(linha['CLASSE_GRAMATICAL'] || '').trim(),
                CAMPO_SEMANTICO: String(linha['CAMPO_SEMANTICO'] || '').trim(),
                SUB_CAMPOS_SEMANTICOS: subCampos,
                ITENS_RELACIONADOS: String(linha['ITENS_RELACIONADOS'] || '').trim(),
                TEXTOS_ESTRUTURADOS: [], 
                VARIACOES_IDS: [], 
                ACEPCOES: []
            };
        }
        const entrada = db.entradas[idEntrada];
        
        // ========== VARIAÇÕES ==========
        const audios = limparListaPipe(linha['ARQUIVO_SONORO']);
        const fonemicas = limparListaPipe(linha['TRANSCRICAO_FONEMICA']);
        const foneticas = limparListaPipe(linha['TRANSCRICAO_FONETICA']);
        const maxVars = Math.max(lexicaisRaw.length, audios.length, fonemicas.length, foneticas.length);
        
        for (let i = 0; i < maxVars; i++) {
            const lex = lexicaisRaw[i] || '';
            if (lex && !entrada.VARIACOES_IDS.some(vid => db.variacoes[vid] && db.variacoes[vid].TRANSCRICAO_ORTOGRAFICA === lex)) {
                const idVar = `${idEntrada}_var_${entrada.VARIACOES_IDS.length + 1}`;
                db.variacoes[idVar] = { 
                    ID: idVar, 
                    TRANSCRICAO_ORTOGRAFICA: lex, 
                    ARQUIVO_SONORO: audios[i] || '', 
                    TRANSCRICAO_FONEMICA: fonemicas[i] || '', 
                    TRANSCRICAO_FONETICA: foneticas[i] || '' 
                };
                entrada.VARIACOES_IDS.push(idVar);
            }
        }
        
        // ========== TEXTOS ESTRUTURADOS (CORRIGIDO) ==========
        const complementos = [];
        const titulosBusca = limparListaPipe(linha['TEXTO']);
        
        titulosBusca.forEach(tit => {
            if (!tit) return;

            // ✅ Busca no mapa combinado
            const textoMatch = textosMap[tit];
            
            if (textoMatch && typeof textoMatch === 'object' && textoMatch.titulo_base) {
                // ✅ É um texto estruturado - NÃO vai para complementos
                const jaExiste = entrada.TEXTOS_ESTRUTURADOS.some(t => t.TITULO_BASE === textoMatch.titulo_base);
                
                if (!jaExiste) {
                    const textoFormatado = {
                        TITULO_BASE: textoMatch.titulo_base,
                        TEXTO_NAO_LITERAL: textoMatch.texto_nao_literal || '',
                        VARIACOES: []
                    };

                    if (textoMatch.textos_variacoes && Array.isArray(textoMatch.textos_variacoes)) {
                        textoMatch.textos_variacoes.forEach(v => {
                            const variacao = { ID_VARIACAO: v.id_variacao || '', FRASES: [] };
                            if (v.frases && Array.isArray(v.frases)) {
                                v.frases.forEach(f => {
                                    variacao.FRASES.push({
                                        ORIGINAL: f.texto_original || '',
                                        TRADUCAO: f.traducao || '',
                                        AUDIO_ARQUIVO: (f.audio && f.audio.arquivo) ? f.audio.arquivo.replace(/\\\\/g, '/') : '',
                                        AUDIO_BASE64: (f.audio && f.audio.dados) ? `data:audio/mp3;base64,${f.audio.dados}` : '',
                                        ARQUIVO_ORIGEM: f.arquivo_origem || ''
                                    });
                                });
                            }
                            textoFormatado.VARIACOES.push(variacao);
                        });
                    }
                    entrada.TEXTOS_ESTRUTURADOS.push(textoFormatado);
                }
                return; // ✅ Achou estruturado, NÃO adiciona aos complementos
            }

            // ⚠️ Fallback: só adiciona aos complementos se for texto simples
            if (textoMatch && typeof textoMatch === 'string') {
                complementos.push(`<b>${tit}:</b> ${textoMatch}`);
            } else if (!textoMatch) {
                // Só avisa se realmente não encontrou em nenhuma fonte
                complementos.push(`<b>${tit}:</b> [conteúdo não encontrado]`);
            }
            // Se for objeto sem titulo_base, ignora (não adiciona a lugar nenhum)
        });

        // Colunas extras vão para complementos
        colunasExtras.forEach(col => {
            const val = String(linha[col] || '').trim();
            if (val && val.toLowerCase() !== 'nan') complementos.push(`<b>${col}:</b> ${val}`);
        });
        
        // ========== ACEPÇÕES ==========
        const traducoes = limparListaPipe(linha['TRADUCAO_SIGNIFICADO']);
        const descricoes = limparListaPipe(linha['DESCRICAO']);
        const exAudios = limparListaPipe(linha['ARQUIVO_SONORO_EXEMPLO']);
        const exTrans = limparListaPipe(linha['TRANSCRICAO_EXEMPLO']);
        const exTrads = limparListaPipe(linha['TRADUCAO_EXEMPLO']);
        const imagens = limparListaPipe(linha['IMAGEM']);
        const legendas = limparListaPipe(linha['LEGENDA_IMAGEM']);
        const videos = limparListaPipe(linha['ARQUIVO_VIDEO']);
        
        const maxAceps = Math.max(
            traducoes.length, descricoes.length, 
            exAudios.length, exTrans.length, exTrads.length, 
            imagens.length, legendas.length, videos.length
        );
        
        const temComplementos = complementos.length > 0;
        
        for (let i = 0; i < maxAceps; i++) {
            const trad = traducoes[i] || '';
            const desc = descricoes[i] || '';
            const eAud = exAudios[i] || '';
            const eTrans = exTrans[i] || '';
            const eTrad = exTrads[i] || '';
            const img = imagens[i] || '';
            const leg = legendas[i] || '';
            const vid = videos[i] || '';
            
            let idSigAtual = null;
            let idExNovo = null;
            let idImgNovo = null;
            
            if (trad || desc) {
                const chaveSig = `${trad.trim().toLowerCase()}||${desc.trim().toLowerCase()}`;
                idSigAtual = Object.keys(db.significados).find(k => {
                    const s = db.significados[k];
                    return `${(s.TRADUCAO || '').trim().toLowerCase()}||${(s.DESCRICAO || '').trim().toLowerCase()}` === chaveSig;
                });
                if (!idSigAtual) {
                    idSigAtual = `SIG_${String(Object.keys(db.significados).length + 1).padStart(5, '0')}`;
                    db.significados[idSigAtual] = { ID: idSigAtual, TRADUCAO: trad, DESCRICAO: desc };
                }
            }
            
            if (eTrans || eTrad) {
                idExNovo = `${idEntrada}_ex_${Object.keys(db.exemplos).length + 1}`;
                db.exemplos[idExNovo] = { 
                    ID: idExNovo, 
                    ARQUIVO_SONORO_EXEMPLO: eAud, 
                    TRANSCRICAO_EXEMPLO: eTrans, 
                    TRADUCAO_EXEMPLO: eTrad 
                };
            }
            
            if (img) {
                idImgNovo = `${idEntrada}_img_${Object.keys(db.imagens).length + 1}`;
                db.imagens[idImgNovo] = { 
                    ID: idImgNovo, 
                    IMAGEM: img, 
                    LEGENDA_IMAGEM: leg 
                };
            }
            
            if (idSigAtual || idExNovo || idImgNovo || vid || temComplementos) {
                let acepcaoAlvo = null;
                
                if (idSigAtual) {
                    acepcaoAlvo = entrada.ACEPCOES.find(ac => ac.SIGNIFICADO_ID === idSigAtual);
                }
                
                if (!acepcaoAlvo) {
                    if (entrada.ACEPCOES.length > 0 && !idSigAtual) {
                        acepcaoAlvo = entrada.ACEPCOES[entrada.ACEPCOES.length - 1];
                    } else {
                        acepcaoAlvo = {
                            SIGNIFICADO_ID: idSigAtual,
                            EXEMPLOS_IDS: [],
                            IMAGENS_IDS: [],
                            ARQUIVOS_VIDEO: [],
                            EXTRAS: []
                        };
                        entrada.ACEPCOES.push(acepcaoAlvo);
                    }
                }
                
                if (idExNovo && !acepcaoAlvo.EXEMPLOS_IDS.includes(idExNovo)) acepcaoAlvo.EXEMPLOS_IDS.push(idExNovo);
                if (idImgNovo && !acepcaoAlvo.IMAGENS_IDS.includes(idImgNovo)) acepcaoAlvo.IMAGENS_IDS.push(idImgNovo);
                if (vid && !acepcaoAlvo.ARQUIVOS_VIDEO.includes(vid)) acepcaoAlvo.ARQUIVOS_VIDEO.push(vid);
                
                if (!acepcaoAlvo.EXTRAS) acepcaoAlvo.EXTRAS = [];
                if (temComplementos) {
                    for (const comp of complementos) {
                        if (!acepcaoAlvo.EXTRAS.includes(comp)) acepcaoAlvo.EXTRAS.push(comp);
                    }
                }
            }
        }
        
        const novoRelacionado = String(linha['ITENS_RELACIONADOS'] || '').trim();
        if (novoRelacionado && !entrada.ITENS_RELACIONADOS.includes(novoRelacionado)) {
            entrada.ITENS_RELACIONADOS = entrada.ITENS_RELACIONADOS 
                ? `${entrada.ITENS_RELACIONADOS} | ${novoRelacionado}` 
                : novoRelacionado;
        }
    });
    
    return db;
}

function construirArvoreOrdenada(db, ordemCategorias, categoriasManterOriginal) {
    const arvore = {};
    const ordemMap = {};
    if (ordemCategorias) ordemCategorias.forEach((cat, i) => ordemMap[cat.toLowerCase()] = i);
    const manterSet = new Set((categoriasManterOriginal || []).map(c => c.toLowerCase()));
    
    for (const [idEntrada, entrada] of Object.entries(db.entradas)) {
        const categoria = entrada.CAMPO_SEMANTICO || 'Sem Categoria';
        const subCampos = entrada.SUB_CAMPOS_SEMANTICOS || [];
        
        const termoPrincipal = entrada.VARIACOES_IDS.length > 0 
            ? db.variacoes[entrada.VARIACOES_IDS[0]]?.TRANSCRICAO_ORTOGRAFICA || idEntrada 
            : entrada._TERMO_PRINCIPAL || idEntrada;
        
        const entradaCopia = { 
            ...entrada, 
            _TERMO_PRINCIPAL: termoPrincipal
        };
        
        let no = arvore;
        
        if (!no[categoria]) {
            no[categoria] = { _entradas: [] };
        }
        no = no[categoria];
        
        for (const subCampo of subCampos) {
            if (!no[subCampo]) {
                no[subCampo] = { _entradas: [] };
            }
            no = no[subCampo];
        }
        
        no._entradas.push(entradaCopia);
    }
    
    const categoriasRaizes = Object.keys(arvore).sort((a, b) => {
        const ia = ordemMap[a.toLowerCase()] ?? 9999;
        const ib = ordemMap[b.toLowerCase()] ?? 9999;
        if (ia !== ib) return ia - ib;
        return stripAccents(a.toLowerCase()).localeCompare(stripAccents(b.toLowerCase()));
    });
    
    return { arvore, categoriasRaizes, manterSet };
}

function ordenarEntradas(entradas, manterOriginal) {
    const copia = [...entradas];
    if (manterOriginal) {
        copia.sort((a, b) => (a._ORDEM_ORIGINAL || 0) - (b._ORDEM_ORIGINAL || 0));
    } else {
        copia.sort((a, b) => 
            stripAccents((a._TERMO_PRINCIPAL || '').toLowerCase())
            .localeCompare(stripAccents((b._TERMO_PRINCIPAL || '').toLowerCase()))
        );
    }
    return copia;
}

// ============================================
// 8. EXPORTAÇÃO HTML
// ============================================

function extrairDadosEntrada(entrada, db) {
    // 1. Coleta todas as variações disponíveis para esta entrada
    const variacoes = (entrada.VARIACOES_IDS || [])
        .map(id => db.variacoes[id])
        .filter(v => v);
    
    // 2. Extrai valores únicos
    const termosUnicos = [...new Set(variacoes.map(v => v.TRANSCRICAO_ORTOGRAFICA).filter(Boolean))];
    
    // Adiciona as barras / / em cada fonêmica ANTES de juntar
    const fonemicasUnicas = [...new Set(variacoes.map(v => v.TRANSCRICAO_FONEMICA).filter(Boolean))]
        .map(f => `/${f}/`); 
        
    // Adiciona os colchetes [ ] em cada fonética ANTES de juntar
    const foneticasUnicas = [...new Set(variacoes.map(v => v.TRANSCRICAO_FONETICA).filter(Boolean))]
        .map(f => `[${f}]`);
        
    const audiosUnicos = [...new Set(variacoes.map(v => v.ARQUIVO_SONORO).filter(Boolean))];

    const termo = termosUnicos.length > 0 ? termosUnicos.join(' ~ ') : (entrada._TERMO_PRINCIPAL || '???');
    
    // 3. Extrai Textos Estruturados (já montados no normalizarDados)
    // ✅ CORRIGIDO: Garante que TEXTOS seja sempre um array
    const textos = entrada.TEXTOS_ESTRUTURADOS && Array.isArray(entrada.TEXTOS_ESTRUTURADOS) 
        ? entrada.TEXTOS_ESTRUTURADOS 
        : [];
    
    // 4. Lógica das ACEPCOES e Significados
    const significados = [];
    
    if (entrada.ACEPCOES && entrada.ACEPCOES.length > 0) {
        entrada.ACEPCOES.forEach((ac, idx) => {
            const significado = {
                NUMERO: entrada.ACEPCOES.length > 1 ? String(idx + 1) : '',
                TRADUCAO: '',
                DESCRICAO: '',
                EXEMPLOS: [],  
                IMAGENS: [],   
                VIDEOS: [],    
                EXTRAS: []     
            };
            
            if (ac.SIGNIFICADO_ID && db.significados[ac.SIGNIFICADO_ID]) {
                const sig = db.significados[ac.SIGNIFICADO_ID];
                significado.TRADUCAO = sig.TRADUCAO || '';
                significado.DESCRICAO = sig.DESCRICAO || '';
            }
            
            if (ac.EXEMPLOS_IDS) {
                ac.EXEMPLOS_IDS.forEach(exId => {
                    const ex = db.exemplos[exId];
                    if (ex) {
                        significado.EXEMPLOS.push({
                            TRANS: ex.TRANSCRICAO_EXEMPLO || '',
                            TRAD: ex.TRADUCAO_EXEMPLO || ''
                        });
                    }
                });
            }
            
            if (ac.IMAGENS_IDS) {
                ac.IMAGENS_IDS.forEach(imgId => {
                    const img = db.imagens[imgId];
                    if (img && img.IMAGEM) {
                        const nomeArquivo = img.IMAGEM.split('/').pop().split('\\').pop();
                        significado.IMAGENS.push({
                            ARQUIVO: nomeArquivo,
                            LEGENDA: img.LEGENDA_IMAGEM || ''
                        });
                    }
                });
            }
            
            if (ac.ARQUIVOS_VIDEO) {
                ac.ARQUIVOS_VIDEO.forEach(vid => {
                    if (vid) significado.VIDEOS.push({ ARQUIVO: vid });
                });
            }
            
            if (ac.EXTRAS) {
                ac.EXTRAS.forEach(ext => {
                    if (ext) significado.EXTRAS.push({ TEXTO: ext });
                });
            }
            
            significados.push(significado);
        });
    }
    
    // ✅ LOG PARA DEBUG - remove depois que funcionar
    if (textos.length > 0) {
        console.log(`📚 ${termo} tem ${textos.length} texto(s) associado(s):`, textos.map(t => t.TITULO_BASE));
    }
    
    return {
        TERMO: termo,
        TERMO_PARENT: entrada._TERMO_PRINCIPAL || '???', 
        CLASSE: entrada.CLASSE_GRAMATICAL || '',
        FONEMICA: fonemicasUnicas.join(' ~ '),
        FONETICA: foneticasUnicas.join(' ~ '),
        AUDIO: audiosUnicos.join(' ~ '),
        SIGNIFICADOS: significados,
        TEXTOS: textos, // <--- GARANTIDO QUE É UM ARRAY
        ITENS_RELACIONADOS: entrada.ITENS_RELACIONADOS || '',
        INDEX: significados.length > 0 ? significados[0].TRADUCAO : ''
    };
}

function gerarEntradaHTML(entrada, db) {
    const template = templateEntradaAtivo === 'linear' ? templateEntradaLinearHtml : templateEntradaCardHtml;
    if (template) {
        console.log("✅ usando entrada template HTML");
        const dados = extrairDadosEntrada(entrada, db);
        
        // ✅ DEBUG: Verificar se TEXTOS existe
        if (dados.TEXTOS && dados.TEXTOS.length > 0) {
            console.log(`  📚 "${dados.TERMO}" tem ${dados.TEXTOS.length} texto(s):`, 
                dados.TEXTOS.map(t => ({ 
                    TITULO: t.TITULO_BASE, 
                    VAR: t.VARIACOES?.length,
                    FRASES: t.VARIACOES?.[0]?.FRASES?.length
                }))
            );
        }
        
        // Escape HTML
        dados.TERMO = escaparHTML(dados.TERMO);
        dados.TERMO_PARENT = escaparHTML(dados.TERMO_PARENT);
        dados.CLASSE = escaparHTML(dados.CLASSE);
        dados.FONEMICA = escaparHTML(dados.FONEMICA);
        dados.FONETICA = escaparHTML(dados.FONETICA);
        dados.ITENS_RELACIONADOS = escaparHTML(dados.ITENS_RELACIONADOS);
        dados.INDEX = escaparHTML(dados.INDEX);
        
        // Escapa dados aninhados nos significados
        dados.SIGNIFICADOS = dados.SIGNIFICADOS.map(s => ({
            ...s,
            TRADUCAO: escaparHTML(s.TRADUCAO),
            DESCRICAO: escaparHTML(s.DESCRICAO),
            EXEMPLOS: s.EXEMPLOS.map(e => ({
                TRANS: escaparHTML(e.TRANS),
                TRAD: escaparHTML(e.TRAD)
            })),
            IMAGENS: s.IMAGENS.map(i => ({
                ARQUIVO: escaparHTML(i.ARQUIVO),
                LEGENDA: escaparHTML(i.LEGENDA)
            })),
            VIDEOS: s.VIDEOS.map(v => ({
                ARQUIVO: escaparHTML(v.ARQUIVO)
            })),
            EXTRAS: s.EXTRAS.map(e => ({
                TEXTO: escaparHTML(e.TEXTO)
            }))
        }));

        // Escapa a estrutura de textos
        dados.TEXTOS = (dados.TEXTOS || []).map(texto => ({
            ...texto,
            TITULO_BASE: escaparHTML(texto.TITULO_BASE),
            TEXTO_NAO_LITERAL: escaparHTML(texto.TEXTO_NAO_LITERAL).replace(/\n/g, '<br>'),
            VARIACOES: texto.VARIACOES.map(v => ({
                ...v,
                ID_VARIACAO: escaparHTML(v.ID_VARIACAO),
                FRASES: v.FRASES.map(f => ({
                    ...f,
                    ORIGINAL: escaparHTML(f.ORIGINAL),
                    TRADUCAO: escaparHTML(f.TRADUCAO),
                    AUDIO_SRC: f.AUDIO_SRC?.startsWith('data:') ? f.AUDIO_SRC : escaparHTML(f.AUDIO_SRC),
                    ARQUIVO_ORIGEM: escaparHTML(f.ARQUIVO_ORIGEM)
                }))
            }))
        }));
        
        // ✅ Processa o template
        const resultado = processarTemplateEntrada(template, dados);
        
        // ✅ DEBUG: Verificar se o resultado contém os textos
        if (dados.TEXTOS && dados.TEXTOS.length > 0) {
            const temTextoNoResultado = resultado.includes('texto-estruturado') || 
                                         resultado.includes(dados.TEXTOS[0].TITULO_BASE);
            console.log(`  📝 Template processado. Texto presente no HTML? ${temTextoNoResultado ? '✅ SIM' : '❌ NÃO'}`);
            if (!temTextoNoResultado) {
                console.log('  ⚠️ O template pode não ter o bloco {{#TEXTOS}}!');
                console.log('  Trecho do resultado:', resultado.substring(0, 300));
            }
        }
        
        return resultado;
    }
    console.log("⚠️ usando entrada HTML padrão (fallback)");
    return gerarEntradaHTMLPadrao(entrada, db);
}

function gerarEntradaHTMLPadrao(entrada, db) {
    const dados = extrairDadosEntrada(entrada, db);
    let html = `<div class="entry-card"><h2>${dados.TERMO}</h2>`;
    if (dados.CLASSE) html += `<span class="classe">${dados.CLASSE}</span>`;
    
    // ✅ CORRIGIDO: SIGNIFICADOS já contém as imagens
    dados.SIGNIFICADOS.forEach(s => {
        html += `<p>${s.NUMERO ? s.NUMERO + '. ' : ''}<strong>${s.TRADUCAO}</strong> ${s.DESCRICAO}</p>`;
        // Imagens dentro do significado
        s.IMAGENS.forEach(img => {
            html += `<img src="${img.ARQUIVO}" alt="${img.LEGENDA}" style="max-width:200px;">`;
        });
    });
    
    // ✅ Adiciona textos estruturados no padrão
    if (dados.TEXTOS && dados.TEXTOS.length > 0) {
        dados.TEXTOS.forEach(t => {
            html += `<div style="margin-top: 10px; padding: 10px; background: #f9f9f9; border-left: 3px solid #ccc;">`;
            html += `<strong>${t.TITULO_BASE}</strong><br>`;
            if (t.TEXTO_NAO_LITERAL) html += `<em>${t.TEXTO_NAO_LITERAL}</em>`;
            
            // ✅ Variações e frases
            t.VARIACOES.forEach(v => {
                html += `<div style="margin-left: 15px; margin-top: 5px;">`;
                html += `<u>${v.ID_VARIACAO}</u><br>`;
                v.FRASES.forEach(f => {
                    html += `<p style="margin: 2px 0;">"${f.ORIGINAL}"<br>→ ${f.TRADUCAO}`;
                    if (f.AUDIO_SRC) html += ` <audio controls src="${f.AUDIO_SRC}" style="height:20px;"></audio>`;
                    html += `</p>`;
                });
                html += `</div>`;
            });
            
            html += `</div>`;
        });
    }
    
    html += `</div>`;
    return html;
}

function gerarEntradaTypst(entrada, db) {
    if (templateEntradaTypst) {
        const dados = extrairDadosEntrada(entrada, db);
        dados.TERMO = escaparTypst(dados.TERMO);
        dados.TERMO_PARENT = escaparTypst(dados.TERMO_PARENT);
        dados.CLASSE = escaparTypst(dados.CLASSE);
        dados.FONEMICA = escaparTypst(dados.FONEMICA);
        dados.FONETICA = escaparTypst(dados.FONETICA);
        dados.INDEX = escaparTypst(dados.INDEX);
        
        // Escapa dados aninhados
        dados.SIGNIFICADOS = dados.SIGNIFICADOS.map(s => ({
            ...s, 
            TRADUCAO: escaparTypst(s.TRADUCAO), 
            DESCRICAO: escaparTypst(s.DESCRICAO),
            EXEMPLOS: s.EXEMPLOS.map(e => ({ TRANS: escaparTypst(e.TRANS), TRAD: escaparTypst(e.TRAD) }))
        }));

        // Escapa a estrutura de textos para o Typst
        dados.TEXTOS = (dados.TEXTOS || []).map(texto => ({
            ...texto,
            TITULO_BASE: escaparTypst(texto.TITULO_BASE),
            TEXTO_NAO_LITERAL: escaparTypst(texto.TEXTO_NAO_LITERAL),
            VARIACOES: texto.VARIACOES.map(v => ({
                ...v,
                ID_VARIACAO: escaparTypst(v.ID_VARIACAO),
                FRASES: v.FRASES.map(f => ({
                    ...f,
                    ORIGINAL: escaparTypst(f.ORIGINAL),
                    TRADUCAO: escaparTypst(f.TRADUCAO),
                    AUDIO_ARQUIVO: escaparTypst(f.AUDIO_ARQUIVO),
                    ARQUIVO_ORIGEM: escaparTypst(f.ARQUIVO_ORIGEM)
                }))
            }))
        }));

        dados.ITENS_RELACIONADOS = escaparTypst(dados.ITENS_RELACIONADOS);
        console.log("✅ usando entrada template Typst");
        return processarTemplateEntrada(templateEntradaTypst, dados);
    }
    console.log("⚠️ usando entrada Typst padrão (fallback)");
    return gerarEntradaTypstPadrao(entrada, db);
}

function gerarEntradaTypstPadrao(entrada, db) {
    const dados = extrairDadosEntrada(entrada, db);
    let typ = `\n#v(0.6em)\n*${escaparTypst(dados.TERMO)}*`;
    if (dados.CLASSE) typ += ` _${escaparTypst(dados.CLASSE)}_`;
    dados.SIGNIFICADOS.forEach(s => {
        typ += ` ${escaparTypst(s.TRADUCAO)}`;
    });
    
    // ✅ Textos no padrão Typst
    if (dados.TEXTOS && dados.TEXTOS.length > 0) {
        dados.TEXTOS.forEach(t => {
            typ += `\n\n*${escaparTypst(t.TITULO_BASE)}*\n`;
            if (t.TEXTO_NAO_LITERAL) typ += `_${escaparTypst(t.TEXTO_NAO_LITERAL)}_\n`;
            t.VARIACOES.forEach(v => {
                typ += `\n${escaparTypst(v.ID_VARIACAO)}:\n`;
                v.FRASES.forEach(f => {
                    typ += `- "${escaparTypst(f.ORIGINAL)}"\n`;
                    typ += `  → ${escaparTypst(f.TRADUCAO)}\n`;
                });
            });
        });
    }
    
    return typ;
}

function escaparHTML(texto) {
    if (!texto) return '';
    const mapa = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(texto).replace(/[&<>"']/g, char => mapa[char] || char);
}

function gerarEntradaHTMLPadrao(entrada, db) {
    const dados = extrairDadosEntrada(entrada, db);
    let html = `<div class="entry-card"><h2>${dados.TERMO}</h2>`;
    if (dados.CLASSE) html += `<span class="classe">${dados.CLASSE}</span>`;
    dados.SIGNIFICADOS.forEach(s => {
        html += `<p>${s.NUMERO ? s.NUMERO + '. ' : ''}<strong>${s.TRADUCAO}</strong> ${s.DESCRICAO}</p>`;
    });
    dados.IMAGENS.forEach(img => {
        html += `<img src="${img.ARQUIVO}" alt="${img.LEGENDA}" style="max-width:200px;">`;
    });
    
    // Adiciona fallback para visualização de textos longos no padrão genérico
    if (dados.TEXTOS && dados.TEXTOS.length > 0) {
        dados.TEXTOS.forEach(t => {
            html += `<div style="margin-top: 10px; padding: 10px; background: #f9f9f9; border-left: 3px solid #ccc;">`;
            html += `<strong>Texto: ${t.TITULO_BASE}</strong><br>`;
            if (t.TEXTO_NAO_LITERAL) html += `<em>${t.TEXTO_NAO_LITERAL}</em>`;
            html += `</div>`;
        });
    }
    
    html += `</div>`;
    return html;
}

function gerarEntradaTypstPadrao(entrada, db) {
    const dados = extrairDadosEntrada(entrada, db);
    let typ = `\n#v(0.6em)\n*${escaparTypst(dados.TERMO)}*`;
    // Adiciona metadado para compor o cabeçalho (primeira/última entrada)
    let typ = `\n#v(0.6em)\n#metadata("${escaparTypst(dados.TERMO)}") <dict-word>\n*${escaparTypst(dados.TERMO)}*`;
    if (dados.CLASSE) typ += ` _${escaparTypst(dados.CLASSE)}_`;
    dados.SIGNIFICADOS.forEach(s => {
        typ += ` ${escaparTypst(s.TRADUCAO)}`;
    });
    
    // Adiciona fallback para visualização de textos longos no padrão genérico do Typst
    if (dados.TEXTOS && dados.TEXTOS.length > 0) {
        dados.TEXTOS.forEach(t => {
            typ += `\n\n*Texto:* ${escaparTypst(t.TITULO_BASE)}\n_${escaparTypst(t.TEXTO_NAO_LITERAL)}_`;
        });
    }
    
    return typ;
}
async function gerarScriptsDados(embutir) {
    const referenciadas = extrairMidiasDoCSV();
    const midias = {};
    const tipos = { audio: 'audio/', imagem: 'foto/', video: 'video/' };
    
    for (const [tipo, prefixo] of Object.entries(tipos)) {
        const arquivosSet = referenciadas[tipo];
        for (const nome of arquivosSet) {
            if (embutir) { 
                const b64 = await VirtualFS.getBase64(tipo, nome); 
                if (b64) { 
                    midias[nome] = b64; 
                    continue; 
                } 
            }
            midias[nome] = prefixo + nome;
        }
    }
    
    const LOTES = 50;
    const lotes = [];
    for (let i = 0; i < dadosGlobais.length; i += LOTES) {
        lotes.push(dadosGlobais.slice(i, i + LOTES));
    }
    
    let scripts = '<script>\n';
    scripts += 'window.DicionarioMidias = ' + JSON.stringify(midias) + ';\n';
    scripts += 'window.dadosDicionarioLexical = [];\n';
    scripts += 'window.templateEntradaAtivo = "' + templateEntradaAtivo + '";\n';
    scripts += '<\/script>\n';
    
    for (const lote of lotes) { 
        const itens = lote.map(linha => { 
            const obj = {}; 
            for (const col of colunasCsv) {
                obj[col] = linha[col] !== undefined ? linha[col] : ''; 
            }
            return obj; 
        }); 
        scripts += '<script>adicionaDados(' + JSON.stringify(itens) + ');<\/script>\n'; 
    }
    
    return scripts;
}

async function exportarHTML() {
    if (dadosGlobais.length === 0) { log('⚠️ Carregue CSV primeiro!', 'warning'); return; }
    
    const templateNome = templateEntradaAtivo === 'linear' ? 'dicionario-linear.html' : 'dicionario.html';
    const templatePrincipal = templateEntradaAtivo === 'linear' ? VirtualFS.templateHtmlLinear : VirtualFS.templateHtml;
    
    if (!templatePrincipal) {
        log(`❌ Template ${templateNome} não encontrado`, 'error');
        return;
    }
    
    mostrarLoader('🌐 Gerando HTML', 'Preparando dados...');
    await sleep(100);
    
    try {
        atualizarLoader('Gerando scripts de dados...', 20, 'Etapa 2/5');
        await sleep(50);
        
        const metaHtml = document.getElementById('metaHtml')?.value || 'Dicionário';
        const metaPdf = document.getElementById('metaPdf')?.value || 'Dicionário';
        const metaAutor = document.getElementById('metaAutor')?.value || '';
        const metaAno = document.getElementById('metaAno')?.value || '';
        const introHtml = markdownParaHTML(document.getElementById('introMarkdown')?.value || '');
        const introPdf = document.getElementById('introPdf')?.value || '';
        const embutir = document.getElementById('swMidia')?.checked || false;
        
        atualizarLoader('Gerando scripts de dados...', 30, 'Etapa 2/5');
        const scriptsDados = await gerarScriptsDados(embutir);
        
        atualizarLoader('Processando entradas...', 50, 'Etapa 3/5');
        await sleep(50);
        
        const db = normalizarDados(dadosGlobais);
        const manter = document.getElementById('swAlpha')?.checked ? [] : obterOrdemAlfabetica();
        const ordem = document.getElementById('swSemantic')?.checked ? obterOrdemManual() : null;
        const { arvore, categoriasRaizes } = construirArvoreOrdenada(db, ordem, manter);
        
        let corpoHtml = '';
        function processarEntradasHTML(noDict) {
            let html = '';
            const entradas = noDict._entradas || [];
            if (entradas.length > 0) {
                const ordenadas = ordenarEntradas(entradas, false);
                for (const ent of ordenadas) {
                    html += gerarEntradaHTML(ent, db);
                }
            }
            const filhos = Object.keys(noDict).filter(k => k !== '_entradas');
            for (const filho of filhos) {
                html += processarEntradasHTML(noDict[filho]);
            }
            return html;
        }
        
        for (const cat of categoriasRaizes) {
            corpoHtml += `<section class="categoria">\n<h2 class="categoria-titulo">${cat}</h2>\n`;
            corpoHtml += processarEntradasHTML(arvore[cat]);
            corpoHtml += `</section>\n`;
        }
        
        atualizarLoader('Montando template...', 70, 'Etapa 4/5');
        await sleep(50);
        
        let html = templatePrincipal;
        html = html.replace(/\{\{\s*metadados\.html\s*\}\}/gi, metaHtml)
                   .replace(/\{\{\s*metadados\.pdf\s*\}\}/gi, metaPdf)
                   .replace(/\{\{\s*metadados\.autor\s*\}\}/gi, metaAutor)
                   .replace(/\{\{\s*metadados\.ano\s*\}\}/gi, metaAno)
                   .replace(/\{\{\s*metadados\.versao\s*\}\}/gi, '1.0')
                   .replace(/\{\{\s*textos\.intro_html\s*(\|\s*safe)?\s*\}\}/gi, introHtml)
                   .replace(/\{\{\s*textos\.intro_pdf\s*\}\}/gi, introPdf)
                   .replace(/\{\{\s*corpo_dicionario\s*(\|\s*safe)?\s*\}\}/gi, corpoHtml)
                   .replace(/\{\{\s*scripts_dados_js\s*(\|\s*safe)?\s*\}\}/gi, scriptsDados)
                   .replace(/\{\{.*?\}\}/g, '');
        
        atualizarLoader('Injetando CSS...', 85, 'Etapa 5/5');
        await sleep(50);
        
        let cssTemplate = '';
        const cssFile = templateEntradaAtivo === 'linear' ? 'entrada-linear.css' : 'entrada-card.css';
        try {
            const res = await fetch(`static/css/${cssFile}`);
            if (res.ok) cssTemplate = `<style>\n${await res.text()}\n</style>`;
        } catch(e) {}
        html = html.replace('</head>', `${cssTemplate}\n</head>`);
        
        atualizarLoader('Finalizando download...', 95);
        await sleep(100);
        
        baixarArquivo(html, 'dicionario_interativo.html', 'text/html;charset=utf-8');
        
        atualizarLoader('✅ Concluído!', 100, 'HTML exportado com sucesso');
        await sleep(600);
        fecharLoader();
        
        log('✅ HTML exportado!', 'success');
    } catch (err) {
        fecharLoader();
        log(`❌ Erro ao exportar HTML: ${err.message}`, 'error');
    }
}


// ============================================
// 10. EXPORTAÇÃO TYPST
// ============================================

function gerarCorpoTypst(db, arvore, categoriasRaizes, manterSet) {
    const partes = [];
    
    function processarNo(nomeNo, noDict, nivel, raizCategoria) {
    // Nível 1 sempre atualiza a raiz e fica em maiúsculas
    if (nivel === 1) {
        raizCategoria = nomeNo;
        let titulo = escaparTypst(nomeNo.toUpperCase());
        // Adiciona o '=' de nível 1 e o espaço vertical logo abaixo
        partes.push(`\n= ${titulo}\n#v(0.5em)\n`);
    } 
    // Para os demais níveis (ignora se for 'Geral')
    else if (nomeNo !== 'Geral') {
        // Cria a string de '=' dinamicamente baseada no nível atual
        let marcadores = '='.repeat(nivel);
        let titulo = escaparTypst(nomeNo);
        // Adiciona os '=' dinâmicos e o espaço vertical logo abaixo
        partes.push(`\n${marcadores} ${titulo}\n#v(0.5em)\n`);
    }
        
        const entradas = noDict._entradas || [];
        if (entradas.length > 0) {
            const manter = manterSet.has(raizCategoria.toLowerCase());
            const ordenadas = ordenarEntradas(entradas, manter);
            
            for (const ent of ordenadas) {
                // Sempre usa gerarEntradaTypst (ela decide se usa template ou padrão)
                partes.push(gerarEntradaTypst(ent, db));
            }
        }
        
        const filhos = Object.keys(noDict)
            .filter(k => k !== '_entradas')
            .sort((a, b) => stripAccents(a.toLowerCase()).localeCompare(stripAccents(b.toLowerCase())));
        
        for (const filho of filhos) processarNo(filho, noDict[filho], nivel + 1, raizCategoria);
    }
    
    for (const cat of categoriasRaizes) processarNo(cat, arvore[cat], 1, cat);
    
    const resultado = partes.join('');
    log(`📝 Corpo Typst gerado: ${resultado.length} caracteres`, 'info');
    return resultado;
}

function gerarCodigoTypstCompleto() {
    const titulo = document.getElementById('metaPdf')?.value || 'Dicionário';
    const autor = document.getElementById('metaAutor')?.value || '';
    const ano = document.getElementById('metaAno')?.value || '';
    const intro = document.getElementById('introMarkdown')?.value || '';

    
    const db = normalizarDadosParaTypst(dadosGlobais);
    const manter = document.getElementById('swAlpha')?.checked ? [] : obterOrdemAlfabetica();
    const ordem = document.getElementById('swSemantic')?.checked ? obterOrdemManual() : null;
    const { arvore, categoriasRaizes, manterSet } = construirArvoreOrdenada(db, ordem, manter);
    const corpo = gerarCorpoTypst(db, arvore, categoriasRaizes, manterSet);
    
    const template = VirtualFS.templateTypst || '';
    
    let codigo = template;
    codigo = codigo.replace(/\{\{\s*metadados\.html\s*\}\}/gi, document.getElementById('metaHtml')?.value || titulo)
                   .replace(/\{\{\s*metadados\.pdf\s*\}\}/gi, titulo)
                   .replace(/\{\{\s*metadados\.autor\s*\}\}/gi, autor)
                   .replace(/\{\{\s*metadados\.ano\s*\}\}/gi, ano)
                   .replace(/\{\{\s*metadados\.versao\s*\}\}/gi, '1.0')
                   .replace(/\{\{\s*textos\.intro_pdf\s*\}\}/gi, intro)
                   .replace(/\{\{\s*corpo_dicionario\s*(\|\s*safe)?\s*\}\}/gi, corpo)
                   .replace(/\{\{.*?\}\}/g, '');
    
    return codigo;
}

function exportarApenasTypst() {
    if (dadosGlobais.length === 0) { log('⚠️ Carregue CSV primeiro!', 'warning'); return; }
    if (!templatesCarregados['typst'] || !VirtualFS.templateTypst) {
        log('❌ Template dicionario.typ não encontrado na pasta templates/', 'error');
        log('💡 Coloque o arquivo em templates/dicionario.typ ou carregue manualmente', 'info');
        return;
    }
    
    log('📘 Gerando arquivo Typst...', 'cmd');
    try {
        const codigoTypst = gerarCodigoTypstCompleto();
        const titulo = document.getElementById('metaPdf')?.value || 'dicionario';
        const nomeBase = titulo.toLowerCase().replace(/[^a-z0-9]/g, '_');
        baixarArquivo(codigoTypst, `${nomeBase}.typ`, 'text/plain;charset=utf-8');
        log('✅ Arquivo .typ salvo!', 'success');
    } catch (err) { log(`❌ Erro: ${err.message}`, 'error'); }
}

// ============================================
// 11. EXPORTAÇÃO TYPST + PDF (WASM)
// ============================================

let typstWasmReady = false;
let typstWasmModule = null;

async function initTypstWASM() {
    try {
        const basePath = '/static/typst/'; 
        const module = await import(`${basePath}js/typst_wrapper.js`);
        typstWasmModule = module.$typst;
        if (typstWasmModule && typstWasmModule.setCompilerInitOptions) {
            typstWasmModule.setCompilerInitOptions({ getModule: () => `${basePath}wasm/typst_compiler.wasm` });
        }
        if (typstWasmModule && typstWasmModule.setRendererInitOptions) {
            typstWasmModule.setRendererInitOptions({ getModule: () => `${basePath}wasm/typst_renderer.wasm` });
        }
        typstWasmReady = true;
        log('✅ Compilador Typst WASM pronto!', 'success');
        return true;
    } catch (err) { 
        log(`⚠️ Typst WASM não disponível: ${err.message}`, 'warning'); 
        return false; 
    }
}


async function carregarFontesTypst() {
    const fontes = [
        { nome: "Charis-Regular.ttf", path: "/static/typst/fonts/Charis-Regular.ttf" },
        { nome: "Charis-Bold.ttf", path: "/static/typst/fonts/Charis-Bold.ttf" },
        { nome: "Charis-Italic.ttf", path: "/static/typst/fonts/Charis-Italic.ttf" },
        { nome: "Charis-BoldItalic.ttf", path: "/static/typst/fonts/Charis-BoldItalic.ttf" }
    ];
    
    let carregadas = 0;
    
    for (const fonte of fontes) {
        try {
            const response = await fetch(fonte.path);
            if (response.ok) {
                const buffer = await response.arrayBuffer();
                const uint8 = new Uint8Array(buffer);
                
                // Registra a fonte com o mesmo nome do arquivo
                const caminhoVirtual = "/" + fonte.nome;
                
                if (typeof typstWasmModule.mapShadow === 'function') {
                    await typstWasmModule.mapShadow(caminhoVirtual, uint8);
                    carregadas++;
                } else if (typeof typstWasmModule.addAsset === 'function') {
                    await typstWasmModule.addAsset(caminhoVirtual, uint8);
                    carregadas++;
                }
            } else {
                log(`⚠️ Fonte não encontrada: ${fonte.path}`, 'warning');
            }
        } catch (err) {
            log(`❌ Erro ao carregar ${fonte.nome}: ${err.message}`, 'error');
        }
    }
    
    if (carregadas >= 4) {
        log(`✅ ${carregadas} fontes Charis carregadas`, 'success');
    } else if (carregadas > 0) {
        log(`⚠️ Apenas ${carregadas}/4 fontes Charis carregadas`, 'warning');
    } else {
        log('💡 Nenhuma fonte Charis encontrada. O Typst usará Linux Libertine.', 'info');
    }
    
    return carregadas;
}

async function exportarTypstCompleto() {
    if (dadosGlobais.length === 0) { log('⚠️ Carregue CSV primeiro!', 'warning'); return; }
    if (!templatesCarregados['typst'] || !VirtualFS.templateTypst) {
        log('❌ Template dicionario.typ não encontrado', 'error');
        return;
    }
    if (!typstWasmReady) { 
        log('🔄 Inicializando compilador Typst WASM...', 'info');
        if (!await initTypstWASM()) { log('❌ Compilador Typst indisponível', 'error'); return; }
    }
    
    mostrarLoader('📑 Gerando PDF via Typst', 'Inicializando compilador...');
    await sleep(50);
    
    // Declarar variáveis fora dos trys para escopo global da função
    let pdfData;
    const titulo = document.getElementById('metaPdf')?.value || 'dicionario';
    const nomeBase = titulo.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    try {
        // Etapa 1: Carregar fontes
        try {
            atualizarLoader('Carregando fontes...', 10, 'Etapa 1/6');
            await carregarFontesTypst();
            log('✅ Fontes carregadas', 'success');
        } catch (err) {
            log(`⚠️ Erro ao carregar fontes: ${err.message}`, 'warning');
        }
        
// Etapa 2: Carregar pacotes (índice, cmarker e plugin)
try {
    atualizarLoader('Carregando pacotes...', 20, 'Etapa 2/6');
    await sleep(50);
    
    // 1. Carrega o plugin.wasm PRIMEIRO (dependência do cmarker)
    try {
        const resPlugin = await fetch('./static/typst/plugin.wasm');
        if (resPlugin.ok) {
            const pluginBuffer = await resPlugin.arrayBuffer();
            const pluginUint8 = new Uint8Array(pluginBuffer); // Mantém como Uint8Array!
            
            // Tenta injetar como binário (addAsset ou mapShadow)
            let carregouWasm = false;
            
            if (typeof typstWasmModule.mapShadow === 'function') {
                await typstWasmModule.mapShadow("/plugin.wasm", pluginUint8);
                carregouWasm = true;
                log('✅ Plugin WASM carregado via mapShadow', 'success');
            } else if (typeof typstWasmModule.addAsset === 'function') {
                await typstWasmModule.addAsset("/plugin.wasm", pluginUint8);
                carregouWasm = true;
                log('✅ Plugin WASM carregado via addAsset', 'success');
            }
            
            if (!carregouWasm) {
                // Último recurso (improvável para binários, mas mantido por segurança)
                await typstWasmModule.addSource("/plugin.wasm", pluginUint8);
                log('✅ Plugin WASM carregado via addSource (fallback)', 'success');
            }
        } else {
            log(`⚠️ plugin.wasm não encontrado (status: ${resPlugin.status})`, 'warning');
        }
    } catch (e) {
        log('⚠️ Erro ao carregar plugin.wasm: ' + e.message, 'warning');
    }
    
    // 2. Carrega o cmarker
    try {
        const resCmarker = await fetch('./static/typst/cmarker.typ');
        if (resCmarker.ok) {
            const codigoCmarker = await resCmarker.text();
            
            // Corrige o caminho do plugin para usar a raiz virtual
            const codigoCorrigido = codigoCmarker.replace(
                /plugin\("\.\/plugin\.wasm"\)/g,
                'plugin("/plugin.wasm")'
            );
            
            await typstWasmModule.addSource("/cmarker.typ", codigoCorrigido);
            log('✅ Pacote cmarker carregado', 'success');
        } else {
            log('⚠️ cmarker.typ não encontrado', 'warning');
        }
    } catch (e) {
        log('⚠️ Erro ao carregar cmarker: ' + e.message, 'warning');
    }
    
    // 3. Carrega o in-dexter
    try {
        const resIndex = await fetch('./static/typst/in-dexter.typ');
        if (resIndex.ok) {
            const codigoInDex = await resIndex.text();
            await typstWasmModule.addSource("/in-dexter.typ", codigoInDex);
            log('✅ Pacote de índice carregado', 'success');
        } else {
            log('⚠️ in-dexter.typ não encontrado', 'warning');
        }
    } catch (e) {
        log('⚠️ Erro ao carregar índice: ' + e.message, 'warning');
    }
    
} catch (err) {
    log(`⚠️ Aviso na Etapa 2: ${err.message}`, 'warning');
}
        
        // Etapa 3: Gerar código Typst
        try {
            atualizarLoader('Gerando código Typst...', 35, 'Etapa 3/6');
            await sleep(50);
            
            let codigoTypst = gerarCodigoTypstCompleto();
            
            // Sanitizar código para evitar erros de compilação
            codigoTypst = codigoTypst
                .replace(/\*_\s*_\*/g, '')           // Remove *_ _* (negrito/itálico vazio)
                // Limpa caminhos absolutos, deixando apenas o nome do arquivo para o Typst chamar
                .replace(/#image\("([^"]+)"/g, (match, path) => {
                    const apenasNome = path.split('/').pop().split('\\').pop();
                    return `#image("${apenasNome}"`; // O Typst chamará apenas "foto.jpg"
                })
                .replace(/#image\("",[^)]*\)/g, '')  // Remove imagens vazias
                .replace(/^\s*\.\s*\.\s*$/gm, '')    // Remove linhas com apenas ". ."
                .replace(/__+/g, '_')                // Remove underscores duplos
                .replace(/\n\s*\n\s*\n/g, '\n\n');   // Remove múltiplas linhas vazias
            
            log(`📝 Código Typst gerado: ${codigoTypst.length} caracteres`, 'info');
            
            // O arquivo principal TEM que ter a barra inicial para estar no "workspace"
            await typstWasmModule.addSource("/main.typ", codigoTypst);
            log('✅ Código fonte adicionado ao compilador', 'success');
        } catch (err) {
            throw new Error(`Erro ao gerar/adicionar código Typst: ${err.message}`);
        }
        
        // Etapa 4: Carregar imagens
        try {
            atualizarLoader('Carregando imagens...', 50, 'Etapa 4/6');
            await sleep(50);
            
            const imagens = VirtualFS.imagem;
            let imagensCarregadas = 0;
            
            if (imagens && imagens.size > 0) {
                log(`🖼️ Carregando ${imagens.size} imagens...`, 'info');
                
                for (const [caminhoOriginal, file] of imagens.entries()) {
                    try {
                        const nomeArquivo = caminhoOriginal.split('/').pop().split('\\').pop();
                        
                        // Adicionamos a barra para a imagem ficar na mesma raiz do /main.typ
                        const caminhoVirtual = `/${nomeArquivo}`;
                        
                        const buffer = await file.arrayBuffer();
                        const uint8 = new Uint8Array(buffer);
                        
                        if (typeof typstWasmModule.mapShadow === 'function') {
                            await typstWasmModule.mapShadow(caminhoVirtual, uint8);
                            imagensCarregadas++;
                        } else if (typeof typstWasmModule.addAsset === 'function') {
                            await typstWasmModule.addAsset(caminhoVirtual, uint8);
                            imagensCarregadas++;
                        } else if (typeof typstWasmModule.addSource === 'function') {
                            await typstWasmModule.addSource(caminhoVirtual, uint8);
                            imagensCarregadas++;
                        }
                    } catch (imgErr) {
                        log(`⚠️ Erro ao carregar imagem ${caminhoOriginal}: ${imgErr.message}`, 'warning');
                    }
                }
                log(`✅ ${imagensCarregadas}/${imagens.size} imagens carregadas no FS virtual`, 'success');
            } else {
                log('ℹ️ Nenhuma imagem para carregar', 'info');
            }
        } catch (err) {
            throw new Error(`Erro ao carregar imagens: ${err.message}`);
        }
        
        // Etapa 5: Compilar PDF
        try {
            atualizarLoader('Compilando PDF...', 70, 'Etapa 5/6 — Isso pode levar alguns segundos');
            await sleep(50);
            
            log('🔨 Inicializando compilação do PDF...', 'info');
            
            if (typeof typstWasmModule.pdf !== 'function') {
                throw new Error('Método pdf() não disponível no módulo Typst');
            }
            
            try {
                // Pedimos para compilar o arquivo com a barra inicial
                pdfData = await typstWasmModule.pdf({ 
                    mainFilePath: "/main.typ"
                });
            } catch (compileErr) {
                log(`⚠️ Erro na compilação: ${compileErr.message || compileErr}`, 'warning');
                if (compileErr && typeof compileErr === 'object') {
                    console.error('Detalhes da compilação:', compileErr);
                }
                throw new Error(`Compilação falhou: ${compileErr.message || compileErr}`);
            }
            
            if (!pdfData) {
                throw new Error('Compilação retornou dados vazios');
            }
            
            log(`✅ PDF compilado: ${pdfData.byteLength || pdfData.length} bytes`, 'success');
        } catch (err) {
            throw new Error(`Erro na compilação do PDF: ${err.message || err}`);
        }
        
        // Etapa 6: Download do PDF
        try {
            atualizarLoader('Finalizando download...', 90, 'Etapa 6/6');
            await sleep(50);
            
            const blob = new Blob([pdfData], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            
            atualizarLoader('✅ Concluído!', 100, 'PDF gerado com sucesso');
            await sleep(600);
            fecharLoader();
            log('✅ PDF gerado com sucesso!', 'success');
        } catch (err) {
            throw new Error(`Erro ao fazer download: ${err.message}`);
        }
        
    } catch (err) {
        fecharLoader();
        log(`❌ Erro ao gerar PDF: ${err.message}`, 'error');
        console.error('Detalhes do erro fatal:', err);
    }
}



// ============================================
// 12. EXPORTAÇÕES ADICIONAIS
// ============================================

function exportarCSV() {
    if (dadosGlobais.length === 0) { 
        log('⚠️ Nenhum dado para exportar. Carregue um CSV primeiro!', 'warning'); 
        return; 
    }
    
    log('📊 Gerando CSV editado...', 'cmd');
    
    try {
        const cabecalhos = colunasCsv;
        
        const linhas = dadosGlobais.map(item => {
            return cabecalhos.map(col => {
                const valor = item[col] !== undefined ? item[col] : '';
                if (String(valor).includes(',') || String(valor).includes('"') || String(valor).includes('\n')) {
                    return '"' + String(valor).replace(/"/g, '""') + '"';
                }
                return valor;
            }).join(',');
        });
        
        const csv = [cabecalhos.join(','), ...linhas].join('\n');
        
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
        
        const titulo = document.getElementById('metaPdf')?.value || 'dicionario';
        const nomeBase = titulo.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const timestamp = new Date().toISOString().slice(0, 10);
        const nomeArquivo = `${nomeBase}_editado_${timestamp}.csv`;
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        log(`✅ CSV exportado: ${nomeArquivo} (${(blob.size/1024).toFixed(1)} KB)`, 'success');
    } catch (err) {
        log(`❌ Erro ao exportar CSV: ${err.message}`, 'error');
    }
}

function exportarJSON() { 
    if (dadosGlobais.length === 0) { log('⚠️ Carregue CSV primeiro!', 'warning'); return; }
    
    log('🗄️ Gerando banco de dados normalizado...', 'cmd');
    
    try {
        // Normaliza os dados usando a mesma função das exportações
        const db = normalizarDados(dadosGlobais);
        
        // Cria um objeto com estatísticas e os dados normalizados
        const bancoNormalizado = {
            metadados: {
                titulo: document.getElementById('metaPdf')?.value || 'Dicionário',
                autor: document.getElementById('metaAutor')?.value || '',
                ano: document.getElementById('metaAno')?.value || '',
                total_entradas: Object.keys(db.entradas).length,
                total_variacoes: Object.keys(db.variacoes).length,
                total_significados: Object.keys(db.significados).length,
                total_exemplos: Object.keys(db.exemplos).length,
                total_imagens: Object.keys(db.imagens).length,
                data_exportacao: new Date().toISOString()
            },
            entradas: db.entradas,
            variacoes: db.variacoes,
            significados: db.significados,
            exemplos: db.exemplos,
            imagens: db.imagens
        };
        
        const titulo = document.getElementById('metaPdf')?.value || 'dicionario';
        const nomeBase = titulo.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const timestamp = new Date().toISOString().slice(0, 10);
        const nomeArquivo = `${nomeBase}_normalizado_${timestamp}.json`;
        
        baixarArquivo(
            JSON.stringify(bancoNormalizado, null, 2), 
            nomeArquivo, 
            'application/json'
        );
        
        log(`✅ Banco normalizado exportado: ${nomeArquivo}`, 'success');
        log(`📊 ${bancoNormalizado.metadados.total_entradas} entradas normalizadas`, 'info');
    } catch (err) {
        log(`❌ Erro ao exportar JSON normalizado: ${err.message}`, 'error');
        // Fallback: exporta o CSV bruto como antes
        log('⚠️ Exportando dados brutos como fallback...', 'warning');
        baixarArquivo(
            JSON.stringify({ dados: dadosGlobais, colunas: colunasCsv }, null, 2), 
            'banco_dados_bruto.json', 
            'application/json'
        );
    }
}

// ============================================
// 13. VALIDAÇÃO DE MÍDIAS E ESTRUTURA
// ============================================

function extrairMidiasDoCSV() {
    const midiasReferenciadas = { audio: new Set(), imagem: new Set(), video: new Set() };
    dadosGlobais.forEach(linha => {
        ['ARQUIVO_SONORO', 'ARQUIVO_SONORO_EXEMPLO'].forEach(campo => { 
            const valor = String(linha[campo] || '').trim(); 
            if (valor && valor.toLowerCase() !== 'nan') limparListaPipe(valor).forEach(arq => midiasReferenciadas.audio.add(arq)); 
        });
        ['IMAGEM'].forEach(campo => { 
            const valor = String(linha[campo] || '').trim(); 
            if (valor && valor.toLowerCase() !== 'nan') limparListaPipe(valor).forEach(arq => midiasReferenciadas.imagem.add(arq)); 
        });
        ['ARQUIVO_VIDEO'].forEach(campo => { 
            const valor = String(linha[campo] || '').trim(); 
            if (valor && valor.toLowerCase() !== 'nan') limparListaPipe(valor).forEach(arq => midiasReferenciadas.video.add(arq)); 
        });
    });
    return midiasReferenciadas;
}

function verificarBarras(linha, campos) {
    // Verifica se todos os campos têm o mesmo número de elementos separados por |
    const contagens = campos.map(campo => {
        const valor = String(linha[campo] || '').trim();
        if (!valor || valor.toLowerCase() === 'nan') return 0;
        return valor.split('|').filter(v => v.trim() !== '').length;
    });
    
    // Remove zeros (campos vazios não participam da verificação)
    const contagensNaoZero = contagens.filter(c => c > 0);
    
    // Se todos são zero ou só tem um valor, está ok
    if (contagensNaoZero.length <= 1) return [true, ''];
    
    // Verifica se todos têm a mesma contagem
    const primeiraContagem = contagensNaoZero[0];
    const todasIguais = contagensNaoZero.every(c => c === primeiraContagem);
    
    if (!todasIguais) {
        const detalhes = campos.map((campo, i) => 
            `${campo}: ${contagens[i]} itens`
        ).join(', ');
        return [false, detalhes];
    }
    
    return [true, ''];
}

function cruzarMidias() {
    // Redireciona para validarTudo() que contém o relatório completo
    validarTudo();
}

function validarEstrutura() {
    // Redireciona para validarTudo() que contém o relatório completo
    validarTudo();
}

function validarTudo() {
    if (dadosGlobais.length === 0) { 
        log('⚠️ Carregue CSV primeiro!', 'warning'); 
        return; 
    }
    
    log('🩺 Executando diagnóstico completo...', 'cmd');
    
    // ==========================================
    // CONSTANTES E CONFIGURAÇÕES
    // ==========================================
    const CAMPOS_OBRIGATORIOS = ["ITEM_LEXICAL", "TRADUCAO_SIGNIFICADO", "CAMPO_SEMANTICO"];
    
    // Objeto para armazenar erros por linha
    const erros = {};
    
    // Contadores
    let entradasSemAudio = 0;
    let entradasSemImagem = 0;
    let entradasSemVideo = 0;
    
    // Conjuntos de mídias referenciadas (usando Map para evitar duplicatas)
    const arquivosAudioTabela = new Map(); // nome -> Set de linhas que referenciam
    const arquivosVideoTabela = new Map();
    const arquivosImagemTabela = new Map();
    
    // Mídias disponíveis (do VirtualFS)
    const audioDisponivel = new Set(VirtualFS.getTodosNomes('audio'));
    const imagemDisponivel = new Set(VirtualFS.getTodosNomes('imagem'));
    const videoDisponivel = new Set(VirtualFS.getTodosNomes('video'));
    
    // ==========================================
    // PRIMEIRA PASSADA: Coleta todas as referências
    // ==========================================
    dadosGlobais.forEach((dic, index) => {
        const numeroLinha = index + 2;
        
        // Coleta áudios
        if (dic["ARQUIVO_SONORO"]) {
            limparListaPipe(dic["ARQUIVO_SONORO"]).forEach(arq => {
                if (!arquivosAudioTabela.has(arq)) arquivosAudioTabela.set(arq, new Set());
                arquivosAudioTabela.get(arq).add(numeroLinha);
            });
        }
        if (dic["ARQUIVO_SONORO_EXEMPLO"]) {
            limparListaPipe(dic["ARQUIVO_SONORO_EXEMPLO"]).forEach(arq => {
                if (!arquivosAudioTabela.has(arq)) arquivosAudioTabela.set(arq, new Set());
                arquivosAudioTabela.get(arq).add(numeroLinha);
            });
        }
        
        // Coleta vídeos
        if (dic["ARQUIVO_VIDEO"]) {
            limparListaPipe(dic["ARQUIVO_VIDEO"]).forEach(arq => {
                if (!arquivosVideoTabela.has(arq)) arquivosVideoTabela.set(arq, new Set());
                arquivosVideoTabela.get(arq).add(numeroLinha);
            });
        }
        
        // Coleta imagens
        if (dic["IMAGEM"]) {
            limparListaPipe(dic["IMAGEM"]).forEach(arq => {
                if (!arquivosImagemTabela.has(arq)) arquivosImagemTabela.set(arq, new Set());
                arquivosImagemTabela.get(arq).add(numeroLinha);
            });
        }
    });
    
    // ==========================================
    // SEGUNDA PASSADA: Valida cada linha
    // ==========================================
    dadosGlobais.forEach((dic, index) => {
        const numeroLinha = index + 2;
        const errosLinha = [];
        
        // 1. Verifica campos obrigatórios
        const camposNaoPreenchidos = [];
        CAMPOS_OBRIGATORIOS.forEach(campo => {
            if (!dic[campo] || String(dic[campo]).trim() === '') {
                camposNaoPreenchidos.push(campo);
            }
        });
        if (camposNaoPreenchidos.length > 0) {
            errosLinha.push(`Campos não preenchidos: ${camposNaoPreenchidos.join(', ')}`);
        }
        
        // 2. Verifica uso de barras - CONJUNTO 1 (Item Lexical)
        const resultadoConjunto1 = verificarBarras(dic, [
            'ITEM_LEXICAL', 
            'ARQUIVO_SONORO', 
            'TRANSCRICAO_FONEMICA', 
            'TRANSCRICAO_FONETICA'
        ]);
        if (!resultadoConjunto1[0]) {
            errosLinha.push(`Erro no uso de barras nas células referentes ao item lexical: ${resultadoConjunto1[1]}`);
        }
        
        // 3. Verifica uso de barras - CONJUNTO 2 (Exemplos)
        const resultadoConjunto2 = verificarBarras(dic, [
            'ARQUIVO_SONORO_EXEMPLO', 
            'TRANSCRICAO_EXEMPLO', 
            'TRADUCAO_EXEMPLO'
        ]);
        if (!resultadoConjunto2[0]) {
            errosLinha.push(`Erro no uso de barras nos campos referentes a exemplos: ${resultadoConjunto2[1]}`);
        }
        
        // 4. Verifica uso de barras - CONJUNTO 3 (Imagens)
        const resultadoConjunto3 = verificarBarras(dic, [
            'IMAGEM', 
            'LEGENDA_IMAGEM'
        ]);
        if (!resultadoConjunto3[0]) {
            errosLinha.push(`Erro no uso de barras nos campos referentes a imagens: ${resultadoConjunto3[1]}`);
        }
        
        // Se encontrou erros de validação, adiciona ao objeto
        if (errosLinha.length > 0) {
            erros[numeroLinha] = errosLinha;
        }
        
        // Conta entradas sem mídia
        if ((!dic["ARQUIVO_SONORO"] || String(dic["ARQUIVO_SONORO"]).trim() === '') && 
            (!dic["ARQUIVO_SONORO_EXEMPLO"] || String(dic["ARQUIVO_SONORO_EXEMPLO"]).trim() === '')) {
            entradasSemAudio++;
        }
        if (!dic["IMAGEM"] || String(dic["IMAGEM"]).trim() === '') {
            entradasSemImagem++;
        }
        if (!dic["ARQUIVO_VIDEO"] || String(dic["ARQUIVO_VIDEO"]).trim() === '') {
            entradasSemVideo++;
        }
    });
    
    // ==========================================
    // CRUZAMENTO DE MÍDIAS (sem duplicar com validação)
    // ==========================================
    const midiasFaltando = { audio: [], imagem: [], video: [] };
    const midiasNaoUsadas = { audio: [], imagem: [], video: [] };
    let totalFaltando = 0;
    let totalNaoUsadas = 0;
    
    // Verifica mídias faltando (referenciadas mas não carregadas)
    for (const [nomeArquivo, linhas] of arquivosAudioTabela) {
        if (!audioDisponivel.has(nomeArquivo)) {
            midiasFaltando.audio.push(nomeArquivo);
            totalFaltando++;
        }
    }
    for (const [nomeArquivo, linhas] of arquivosImagemTabela) {
        if (!imagemDisponivel.has(nomeArquivo)) {
            midiasFaltando.imagem.push(nomeArquivo);
            totalFaltando++;
        }
    }
    for (const [nomeArquivo, linhas] of arquivosVideoTabela) {
        if (!videoDisponivel.has(nomeArquivo)) {
            midiasFaltando.video.push(nomeArquivo);
            totalFaltando++;
        }
    }
    
    // Verifica mídias não usadas (carregadas mas não referenciadas)
    for (const arq of audioDisponivel) {
        if (!arquivosAudioTabela.has(arq)) {
            midiasNaoUsadas.audio.push(arq);
            totalNaoUsadas++;
        }
    }
    for (const arq of imagemDisponivel) {
        if (!arquivosImagemTabela.has(arq)) {
            midiasNaoUsadas.imagem.push(arq);
            totalNaoUsadas++;
        }
    }
    for (const arq of videoDisponivel) {
        if (!arquivosVideoTabela.has(arq)) {
            midiasNaoUsadas.video.push(arq);
            totalNaoUsadas++;
        }
    }
    
    // ==========================================
    // MONTA RELATÓRIO ÚNICO
    // ==========================================
    const temPendencias = Object.keys(erros).length > 0;
    
    let html = '';
    
    // Seção 1: Estatísticas
    html += `<div style="font-size: 16px; font-weight: 700; margin-bottom: 12px; color: var(--primary);">📊 ESTATÍSTICAS GERAIS</div>`;
    html += `<div class="report-section"><strong>📊 Total de entradas:</strong> ${dadosGlobais.length}</div>`;
    html += `<div class="report-section"><strong>🎵 Áudios referenciados:</strong> ${arquivosAudioTabela.size} | <strong>🖼️ Imagens referenciadas:</strong> ${arquivosImagemTabela.size} | <strong>🎬 Vídeos referenciados:</strong> ${arquivosVideoTabela.size}</div>`;
    html += `<hr style="border-color: var(--border-color); margin: 12px 0;">`;
    html += `<div class="report-section"><strong>📝 Entradas sem áudio:</strong> ${entradasSemAudio} | <strong>🖼️ Entradas sem imagens:</strong> ${entradasSemImagem} | <strong>🎬 Entradas sem vídeos:</strong> ${entradasSemVideo}</div>`;
    
    // Seção 2: Mídias faltando
    html += `<hr style="border-color: var(--primary); margin: 16px 0;">`;
    html += `<div style="font-size: 16px; font-weight: 700; margin-bottom: 12px; color: var(--primary);">🔍 CRUZAMENTO DE MÍDIAS</div>`;
    
    if (totalFaltando === 0) {
        html += `<div class="report-section success"><strong>✅ Todas as mídias referenciadas foram encontradas!</strong></div>`;
    } else {
        html += `<div class="report-section error"><strong>⚠️ ${totalFaltando} mídia(s) referenciada(s) não encontrada(s):</strong></div>`;
        
        if (midiasFaltando.audio.length > 0) {
            html += `<div class="report-section error"><strong>🎵 ÁUDIO (${midiasFaltando.audio.length}):</strong> ${midiasFaltando.audio.join(', ')}</div>`;
        }
        if (midiasFaltando.imagem.length > 0) {
            html += `<div class="report-section error"><strong>🖼️ IMAGEM (${midiasFaltando.imagem.length}):</strong> ${midiasFaltando.imagem.join(', ')}</div>`;
        }
        if (midiasFaltando.video.length > 0) {
            html += `<div class="report-section error"><strong>🎬 VÍDEO (${midiasFaltando.video.length}):</strong> ${midiasFaltando.video.join(', ')}</div>`;
        }
    }
    
    // Seção 3: Mídias não usadas
    if (totalNaoUsadas > 0) {
        html += `<hr style="border-color: var(--border-color); margin: 12px 0;">`;
        html += `<div class="report-section warning"><strong>💡 ${totalNaoUsadas} mídia(s) carregada(s) mas não referenciada(s):</strong></div>`;
        
        if (midiasNaoUsadas.audio.length > 0) {
            html += `<div class="report-section warning"><strong>🎵 ÁUDIO (${midiasNaoUsadas.audio.length}):</strong> ${midiasNaoUsadas.audio.slice(0, 10).join(', ')}${midiasNaoUsadas.audio.length > 10 ? '...' : ''}</div>`;
        }
        if (midiasNaoUsadas.imagem.length > 0) {
            html += `<div class="report-section warning"><strong>🖼️ IMAGEM (${midiasNaoUsadas.imagem.length}):</strong> ${midiasNaoUsadas.imagem.slice(0, 10).join(', ')}${midiasNaoUsadas.imagem.length > 10 ? '...' : ''}</div>`;
        }
        if (midiasNaoUsadas.video.length > 0) {
            html += `<div class="report-section warning"><strong>🎬 VÍDEO (${midiasNaoUsadas.video.length}):</strong> ${midiasNaoUsadas.video.slice(0, 10).join(', ')}${midiasNaoUsadas.video.length > 10 ? '...' : ''}</div>`;
        }
    }
    
    // Seção 4: Erros de validação
    html += `<hr style="border-color: var(--primary); margin: 16px 0;">`;
    html += `<div style="font-size: 16px; font-weight: 700; margin-bottom: 12px; color: var(--primary);">✔️ VALIDAÇÃO DE CAMPOS</div>`;
    
    if (!temPendencias) {
        html += `<div class="report-section success"><strong>✅ Nenhum erro de estrutura encontrado!</strong></div>`;
        html += `<div class="report-section success">Todos os campos obrigatórios estão preenchidos e as barras estão consistentes.</div>`;
    } else {
        html += `<div class="report-section error"><strong>⚠️ ${Object.keys(erros).length} linha(s) com erro(s) de validação:</strong></div>`;
        
        for (const [linha, listaErros] of Object.entries(erros)) {
            html += `<div class="report-section error" style="margin: 8px 0 8px 10px; border-left: 3px solid #ef4444; padding-left: 12px;">`;
            html += `<strong>📄 LINHA ${linha}:</strong><br>`;
            listaErros.forEach(erro => {
                html += `<span style="color: #dc2626;">→</span> ${erro}<br>`;
            });
            html += `</div>`;
        }
    }
    
    // Resumo final
    html += `<hr style="border-color: var(--primary); margin: 16px 0;">`;
    if (!temPendencias && totalFaltando === 0) {
        html += `<div style="text-align: center; padding: 16px; background: #d1fae5; border-radius: 8px; color: #065f46; font-weight: 700; font-size: 16px;">✅ TUDO OK! Nenhuma pendência encontrada.</div>`;
    } else {
        const totalProblemas = Object.keys(erros).length + totalFaltando;
        html += `<div style="text-align: center; padding: 16px; background: #fef3c7; border-radius: 8px; color: #92400e; font-weight: 700; font-size: 16px;">⚠️ Total de problemas: ${totalProblemas} (${Object.keys(erros).length} erros de validação + ${totalFaltando} mídias faltando)</div>`;
    }
    
    // Mostra o relatório completo em um único modal
    mostrarModal('🩺 Diagnóstico Completo', html);
    
    // Logs no terminal
    const totalErrosValidacao = Object.keys(erros).length;
    if (!temPendencias && totalFaltando === 0) {
        log('✅ Diagnóstico completo: TUDO OK!', 'success');
    } else {
        if (temPendencias) {
            log(`⚠️ Validação: ${totalErrosValidacao} linha(s) com erro de estrutura`, 'warning');
        }
        if (totalFaltando > 0) {
            log(`⚠️ Mídias: ${totalFaltando} arquivo(s) referenciado(s) não encontrado(s)`, 'warning');
        }
        if (totalNaoUsadas > 0) {
            log(`💡 Mídias: ${totalNaoUsadas} arquivo(s) carregado(s) não referenciado(s)`, 'info');
        }
        log('🩺 Diagnóstico completo finalizado - Verifique o relatório', 'info');
    }
}



// ============================================
// 14. MODAL DE RELATÓRIOS
// ============================================

function mostrarModal(titulo, conteudo) {
    const overlay = document.getElementById('modalOverlay');
    const titleEl = document.getElementById('modalTitle');
    const contentEl = document.getElementById('modalContent');
    
    if (overlay && titleEl && contentEl) {
        titleEl.textContent = titulo;
        contentEl.innerHTML = conteudo;
        overlay.classList.add('active');
    }
}

function fecharModal() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.remove('active');
}

function copiarConteudoModal() {
    const contentEl = document.getElementById('modalContent');
    if (contentEl) {
        navigator.clipboard.writeText(contentEl.innerText).then(() => {
            log('📋 Conteúdo copiado!', 'success');
        });
    }
}

// Fechar modal ao clicar fora
document.getElementById('modalOverlay')?.addEventListener('click', function(e) {
    if (e.target === this) fecharModal();
});

// ============================================
// 15. GERENCIAMENTO DE ESTADO
// ============================================

function salvarEstado() {
    try {
        const estado = {
            metaHtml: document.getElementById('metaHtml')?.value || '',
            metaPdf: document.getElementById('metaPdf')?.value || '',
            metaAutor: document.getElementById('metaAutor')?.value || '',
            metaAno: document.getElementById('metaAno')?.value || '',
            introMarkdown: document.getElementById('introMarkdown')?.value || '',
            swAlpha: document.getElementById('swAlpha')?.checked || false,
            swSemantic: document.getElementById('swSemantic')?.checked || false,
            swMidia: document.getElementById('swMidia')?.checked || false,
            templateEntradaAtivo: templateEntradaAtivo
        };
        localStorage.setItem('csv2dmli_estado', JSON.stringify(estado));
    } catch(e) {}
}

function carregarEstado() {
    const salvo = localStorage.getItem('csv2dmli_estado');
    if (salvo) {
        try {
            const estado = JSON.parse(salvo);
            
            const campos = ['metaHtml','metaPdf','metaAutor','metaAno','introMarkdown'];
            campos.forEach(id => { 
                const el = document.getElementById(id);
                if (estado[id] !== undefined && el) el.value = estado[id]; 
            });
            
            const switches = ['swAlpha','swSemantic','swMidia'];
            switches.forEach(id => { 
                const el = document.getElementById(id);
                if (estado[id] !== undefined && el) el.checked = estado[id]; 
            });
            
            if (estado.templateEntradaAtivo) {
                templateEntradaAtivo = estado.templateEntradaAtivo;
                const select = document.getElementById('templateEntradaSelect');
                if (select) select.value = estado.templateEntradaAtivo;
            }
            
            log('📂 Estado restaurado', 'info');
        } catch(e) { log('Erro ao carregar estado', 'error'); }
    }
    
    // Carrega CSV do cache
    const cachedCsv = localStorage.getItem('csv2dmli_dados');
    if (cachedCsv) {
        try {
            const data = JSON.parse(cachedCsv);
            if (Date.now() - data.timestamp < 86400000) {
                dadosGlobais = data.dados;
                colunasCsv = data.colunas;
                
                const elLinhas = document.getElementById('csvLinhas');
                const elColunas = document.getElementById('csvColunas');
                const elStatus = document.getElementById('statusCsv');
                const elZone = document.getElementById('csvDropZone');
                const elBadge = document.getElementById('badgeCsv');
                
                if (elLinhas) elLinhas.textContent = `${dadosGlobais.length} linhas`;
                if (elColunas) elColunas.textContent = `${colunasCsv.length} colunas`;
                if (elStatus) elStatus.textContent = `${dadosGlobais.length} linhas`;
                if (elZone) elZone.classList.add('loaded');
                if (elBadge) {
                    elBadge.textContent = '✅ Carregado';
                    elBadge.className = 'step-badge badge-ok';
                }
                
                extrairCategorias();
                popularEstrutura();
                log('📀 CSV restaurado do cache', 'info');
            }
        } catch(e) {}
    }
    
    // Carrega templates do cache
    for (const tipo of ['html', 'html-linear', 'typst']) {
        const cached = localStorage.getItem(`csv2dmli_template_${tipo}`);
        if (cached) {
            if (tipo === 'html') VirtualFS.templateHtml = cached;
            else if (tipo === 'html-linear') VirtualFS.templateHtmlLinear = cached;
            else if (tipo === 'typst') VirtualFS.templateTypst = cached;
            
            const tipoKey = tipo === 'html-linear' ? 'html' : tipo;
            templatesCarregados[tipoKey] = true;
            
            const tipoCapitalized = tipo.charAt(0).toUpperCase() + tipo.slice(1);
            const statusEl = document.getElementById(`template${tipoCapitalized}Status`);
            if (statusEl) statusEl.textContent = 'Restaurado do cache';
        }
    }
    
    // Carrega alfabeto
    const cachedAlfabeto = localStorage.getItem('csv2dmli_alfabeto');
    if (cachedAlfabeto) { 
        VirtualFS.alfabeto = cachedAlfabeto; 
        const preview = document.getElementById('alfabetoPreview');
        if (preview) {
            preview.textContent = `Ordem: ${cachedAlfabeto.substring(0, 80)}...`; 
            preview.style.display = 'block'; 
        }
    }
    
    VirtualFS.carregarCache();
}

// ============================================
// 16. INICIALIZAÇÃO
// ============================================

window.addEventListener('DOMContentLoaded', async () => {
    log('🚀 CSV2DMLI v0.1 inicializado', 'cmd');
    log('💡 Carregue CSV, mídias e templates', 'info');
    log('🔒 Processamento 100% local', 'info');
    
    carregarEstado();
    await carregarTemplatesPadrao();
    await carregarTemplatesEntrada();
    
    const estiloSalvo = localStorage.getItem('csv2dmli_templateEntradaAtivo');
    if (estiloSalvo) {
        templateEntradaAtivo = estiloSalvo;
        const select = document.getElementById('templateEntradaSelect');
        if (select) select.value = estiloSalvo;
    }
    
    setTimeout(() => initTypstWASM(), 1000);
    

    
    setupPastaProjeto();
    atualizarBadgeEstruturaTemplate();
    
    log('✅ Sistema pronto para uso', 'success');
});

// ============================================
// 17. MODAL DE EDIÇÃO (EDITOR)
// ============================================

let editorIndiceSelecionado = -1;
let editorStateVars = [];
let editorStateExs = [];
let editorStateImgs = [];
let editorErrosMidia = {};
let editorErrosCampos = [];
let filtroErrosAtivo = false;

const CAMPOS_OBRIGATORIOS = ["ITEM_LEXICAL", "TRADUCAO_SIGNIFICADO", "CAMPO_SEMANTICO"];

function abrirModalEditor() {
    if (dadosGlobais.length === 0) { log('⚠️ Carregue CSV primeiro!', 'warning'); return; }
    
    document.getElementById('modalEditorOverlay').style.display = 'flex';
    document.getElementById('editorCounter').textContent = `${dadosGlobais.length} itens`;
    
    editorIndiceSelecionado = -1;
    editorErrosMidia = {};
    editorErrosCampos = [];
    
    document.getElementById('editorFormContent').style.display = 'none';
    document.getElementById('editorEmptyState').style.display = 'flex';
    document.getElementById('editorSearch').value = '';
    
    renderizarListaEditor();
    log('📝 Editor de entradas aberto', 'info');
}

function fecharModalEditor() {
    document.getElementById('modalEditorOverlay').style.display = 'none';
    log('📝 Editor fechado', 'info');
}

function renderizarListaEditor(listaFiltrada = null) {
    const container = document.getElementById('editorListaItens');
    const lista = listaFiltrada || dadosGlobais;
    container.innerHTML = '';
    
    if (lista.length === 0) {
        container.innerHTML = '<div style="padding: 20px; color: var(--text-muted);">Nenhum resultado.</div>';
        return;
    }
    
    lista.forEach((item) => {
        const originalIndex = dadosGlobais.indexOf(item);
        const el = document.createElement('div');
        el.className = 'list-item';
        el.id = `editor-item-${originalIndex}`;
        
        if (editorIndiceSelecionado === originalIndex) el.classList.add('active');
        if (editorErrosMidia[originalIndex]) el.classList.add('error-media');
        if (editorErrosCampos.includes(originalIndex)) el.classList.add('error-fields');
        
        const palavra = (item.ITEM_LEXICAL || 'Sem termo').split('|')[0].trim();
        const categoria = item.CAMPO_SEMANTICO || 'Sem Categoria';
        
        el.innerHTML = `
            <div style="font-weight: 600; font-size: 13px;">${palavra}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${categoria} • ${item.CLASSE_GRAMATICAL || '-'}</div>
        `;
        
        el.onclick = () => selecionarItemEditor(originalIndex);
        container.appendChild(el);
    });
}

function filtrarListaEditor() {
    const termo = document.getElementById('editorSearch').value.toLowerCase();
    const filtrada = dadosGlobais.filter(item =>
        (item.ITEM_LEXICAL && item.ITEM_LEXICAL.toLowerCase().includes(termo)) ||
        (item.TRADUCAO_SIGNIFICADO && item.TRADUCAO_SIGNIFICADO.toLowerCase().includes(termo))
    );
    renderizarListaEditor(filtrada);
}

function verificarCamposNoEditor() {
    editorErrosCampos = [];
    
    dadosGlobais.forEach((item, idx) => {
        let invalido = false;
        
        // 1. Verifica campos obrigatórios
        const CAMPOS_OBRIGATORIOS = ["ITEM_LEXICAL", "TRADUCAO_SIGNIFICADO", "CAMPO_SEMANTICO"];
        CAMPOS_OBRIGATORIOS.forEach(campo => {
            if (!item[campo] || String(item[campo]).trim() === '') invalido = true;
        });
        
        // 2. Verifica barras do conjunto 1 (Item Lexical)
        const resultado1 = verificarBarras(item, [
            'ITEM_LEXICAL', 
            'ARQUIVO_SONORO', 
            'TRANSCRICAO_FONEMICA', 
            'TRANSCRICAO_FONETICA'
        ]);
        if (!resultado1[0]) invalido = true;
        
        // 3. Verifica barras do conjunto 2 (Exemplos) - sem ARQUIVO_VIDEO
        const resultado2 = verificarBarras(item, [
            'ARQUIVO_SONORO_EXEMPLO', 
            'TRANSCRICAO_EXEMPLO', 
            'TRADUCAO_EXEMPLO'
        ]);
        if (!resultado2[0]) invalido = true;
        
        // 4. Verifica barras do conjunto 3 (Imagens)
        const resultado3 = verificarBarras(item, [
            'IMAGEM', 
            'LEGENDA_IMAGEM'
        ]);
        if (!resultado3[0]) invalido = true;
        
        if (invalido) editorErrosCampos.push(idx);
    });
    
    renderizarListaEditor();
    destacarErrosNoEditor();
    atualizarContadorErros();
    
    if (editorErrosCampos.length > 0) {
        log(`⚠️ ${editorErrosCampos.length} itens com problemas de validação`, 'warning');
    } else {
        log('✅ Todos os itens passaram na validação!', 'success');
    }
}

function verificarMidiasNoEditor() {
    const referenciadas = extrairMidiasDoCSV();
    editorErrosMidia = {};
    
    dadosGlobais.forEach((item, idx) => {
        const faltantes = [];
        
        (item.ARQUIVO_SONORO || '').split('|').forEach(arq => {
            const nome = arq.trim();
            if (nome && !VirtualFS.audio.has(nome)) faltantes.push('ARQUIVO_SONORO');
        });
        
        (item.ARQUIVO_SONORO_EXEMPLO || '').split('|').forEach(arq => {
            const nome = arq.trim();
            if (nome && !VirtualFS.audio.has(nome)) faltantes.push('ARQUIVO_SONORO_EXEMPLO');
        });
        
        (item.IMAGEM || '').split('|').forEach(img => {
            const nome = img.trim();
            if (nome && !VirtualFS.imagem.has(nome)) faltantes.push('IMAGEM');
        });
        
        (item.ARQUIVO_VIDEO || '').split('|').forEach(vid => {
            const nome = vid.trim();
            if (nome && !VirtualFS.video.has(nome)) faltantes.push('ARQUIVO_VIDEO');
        });
        
        if (faltantes.length > 0) editorErrosMidia[idx] = faltantes;
    });
    
    renderizarListaEditor();
    destacarErrosNoEditor();
    
    const totalErros = Object.keys(editorErrosMidia).length;
    if (totalErros > 0) {
        log(`⚠️ ${totalErros} itens com mídias faltando`, 'warning');
    } else {
        log('✅ Todas as mídias encontradas!', 'success');
    }
}

function destacarErrosNoEditor() {
    document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
    if (editorIndiceSelecionado < 0) return;
    
    if (editorErrosCampos.includes(editorIndiceSelecionado)) {
        CAMPOS_OBRIGATORIOS.forEach(campo => {
            const item = dadosGlobais[editorIndiceSelecionado];
            if (!item[campo] || String(item[campo]).trim() === '') {
                const el = document.getElementById(`einp_${campo}`);
                if (el) el.classList.add('input-error');
            }
        });
    }
    
    const midiasFaltantes = editorErrosMidia[editorIndiceSelecionado];
    if (midiasFaltantes) {
        midiasFaltantes.forEach(campo => {
            if (campo === 'ARQUIVO_VIDEO') {
                const el = document.getElementById('einp_ARQUIVO_VIDEO');
                if (el) el.classList.add('input-error');
            }
        });
    }
}

function selecionarItemEditor(index) {
    editorIndiceSelecionado = index;
    const item = dadosGlobais[index];
    
    document.querySelectorAll('#editorListaItens .list-item').forEach(el => el.classList.remove('active'));
    const elAtivo = document.getElementById(`editor-item-${index}`);
    if (elAtivo) elAtivo.classList.add('active');
    
    document.getElementById('editorEmptyState').style.display = 'none';
    document.getElementById('editorFormContent').style.display = 'block';
    
    ['CLASSE_GRAMATICAL', 'CAMPO_SEMANTICO', 'SUB_CAMPO_SEMANTICO', 'TRADUCAO_SIGNIFICADO', 'ITENS_RELACIONADOS', 'DESCRICAO', 'ARQUIVO_VIDEO'].forEach(c => {
        const el = document.getElementById(`einp_${c}`);
        if (el) el.value = item[c] || '';
    });
    
    const getArr = (val) => (val || '').split('|').map(v => v.trim());
    const vi = getArr(item.ITEM_LEXICAL);
    const va = getArr(item.ARQUIVO_SONORO);
    const vf = getArr(item.TRANSCRICAO_FONEMICA);
    const vt = getArr(item.TRANSCRICAO_FONETICA);
    const lenV = Math.max(vi.length, va.length, vf.length, vt.length, 1);
    
    editorStateVars = [];
    for (let i = 0; i < lenV; i++) {
        editorStateVars.push({ item: vi[i] || '', audio: va[i] || '', fone: vf[i] || '', fonet: vt[i] || '' });
    }
    document.getElementById('einp_ITEM_LEXICAL').value = editorStateVars[0].item;
    
    const ea = getArr(item.ARQUIVO_SONORO_EXEMPLO);
    const es = getArr(item.TRANSCRICAO_EXEMPLO);
    const ed = getArr(item.TRADUCAO_EXEMPLO);
    const lenE = Math.max(ea.length, es.length, ed.length);
    
    editorStateExs = [];
    for (let i = 0; i < lenE; i++) {
        if (ea[i] || es[i] || ed[i]) editorStateExs.push({ audio: ea[i] || '', trans: es[i] || '', trad: ed[i] || '' });
    }
    
    const im = getArr(item.IMAGEM);
    const il = getArr(item.LEGENDA_IMAGEM);
    const lenI = Math.max(im.length, il.length);
    
    editorStateImgs = [];
    for (let i = 0; i < lenI; i++) {
        if (im[i] || il[i]) editorStateImgs.push({ img: im[i] || '', leg: il[i] || '' });
    }
    
    renderizarBlocosEditor();
    destacarErrosNoEditor();
}

function toggleFiltroErros() {
    filtroErrosAtivo = !filtroErrosAtivo;
    const btn = document.getElementById('btnFiltrarErros');
    
    if (filtroErrosAtivo) {
        btn.textContent = '✅ Mostrar todos';
        btn.style.background = '#d1fae5';
        btn.style.borderColor = '#10b981';
        btn.style.color = '#065f46';
        filtrarPorErros();
    } else {
        btn.textContent = `⚠️ Filtrar erros (${Object.keys(editorErrosMidia).length + editorErrosCampos.length})`;
        btn.style.background = '#fef3c7';
        btn.style.borderColor = '#f59e0b';
        btn.style.color = '#92400e';
        renderizarListaEditor(dadosGlobais);
    }
    
    log(filtroErrosAtivo ? '🔍 Mostrando apenas itens com erro' : '📋 Mostrando todos os itens', 'info');
}

function filtrarPorErros() {
    const indicesComErro = new Set([
        ...Object.keys(editorErrosMidia).map(Number),
        ...editorErrosCampos
    ]);
    
    const filtrada = dadosGlobais.filter((_, idx) => indicesComErro.has(idx));
    renderizarListaEditor(filtrada);
    
    if (filtrada.length === 0) {
        log('✅ Nenhum erro encontrado!', 'success');
    } else {
        log(`🔍 ${filtrada.length} item(ns) com erro`, 'warning');
    }
}

function atualizarContadorErros() {
    const totalErros = Object.keys(editorErrosMidia).length + editorErrosCampos.length;
    const btn = document.getElementById('btnFiltrarErros');
    
    if (btn) {
        if (!filtroErrosAtivo) {
            btn.textContent = `⚠️ Filtrar erros (${totalErros})`;
            if (totalErros > 0) {
                btn.style.background = '#fef3c7';
                btn.style.borderColor = '#f59e0b';
                btn.style.color = '#92400e';
            } else {
                btn.style.background = '#d1fae5';
                btn.style.borderColor = '#10b981';
                btn.style.color = '#065f46';
            }
        }
    }
}

// ============================================
// 18. RENDERIZAÇÃO DOS BLOCOS DO EDITOR
// ============================================

let previewCache = {};

function obterUrlMidia(tipo, nomeArquivo) {
    if (!nomeArquivo || nomeArquivo.trim() === '') return null;
    
    const cacheKey = `${tipo}_${nomeArquivo}`;
    if (previewCache[cacheKey]) return previewCache[cacheKey];
    
    const arquivo = VirtualFS.getArquivo(tipo, nomeArquivo);
    if (arquivo) {
        const url = URL.createObjectURL(arquivo);
        previewCache[cacheKey] = url;
        return url;
    }
    return null;
}

function visualizarMidiaNoEditor(tipo, nomeArquivo) {
    if (!nomeArquivo || nomeArquivo.trim() === '') {
        log('⚠️ Nenhum arquivo especificado', 'warning');
        return;
    }
    
    const url = obterUrlMidia(tipo, nomeArquivo);
    if (!url) {
        log(`❌ Arquivo não encontrado: ${nomeArquivo}`, 'error');
        return;
    }
    
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    overlay.onclick = () => document.body.removeChild(overlay);
    
    let conteudo = '';
    
    if (tipo === 'audio') {
        conteudo = `
            <div style="background:#1e293b;padding:40px;border-radius:16px;text-align:center;cursor:default;" onclick="event.stopPropagation()">
                <p style="color:white;font-size:16px;margin-bottom:20px;font-family:'Inter',sans-serif;">🔊 ${nomeArquivo}</p>
                <audio controls autoplay style="min-width:350px;">
                    <source src="${url}" type="audio/mpeg">
                </audio>
                <br>
                <button onclick="this.closest('div').parentElement.remove()" style="margin-top:16px;padding:8px 20px;background:#ef4444;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Fechar</button>
            </div>`;
    } else if (tipo === 'imagem') {
        conteudo = `
            <div style="max-width:90vw;max-height:90vh;text-align:center;cursor:default;" onclick="event.stopPropagation()">
                <p style="color:white;font-size:14px;margin-bottom:12px;font-family:'Inter',sans-serif;">🖼️ ${nomeArquivo}</p>
                <img src="${url}" style="max-width:90vw;max-height:75vh;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
                <br>
                <button onclick="this.closest('div').parentElement.remove()" style="margin-top:12px;padding:8px 20px;background:#ef4444;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Fechar</button>
            </div>`;
    } else if (tipo === 'video') {
        conteudo = `
            <div style="max-width:90vw;max-height:90vh;text-align:center;cursor:default;" onclick="event.stopPropagation()">
                <p style="color:white;font-size:14px;margin-bottom:12px;font-family:'Inter',sans-serif;">🎬 ${nomeArquivo}</p>
                <video controls autoplay style="max-width:90vw;max-height:75vh;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
                    <source src="${url}">
                </video>
                <br>
                <button onclick="this.closest('div').parentElement.remove()" style="margin-top:12px;padding:8px 20px;background:#ef4444;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Fechar</button>
            </div>`;
    }
    
    overlay.innerHTML = conteudo;
    document.body.appendChild(overlay);
}

function uploadMidiaEditor(tipo, callback) {
    const input = document.createElement('input');
    input.type = 'file';
    
    const extensoes = {
        audio: '.mp3,.wav,.ogg,.m4a,.flac,.wma',
        imagem: '.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg',
        video: '.mp4,.webm,.avi,.mov,.mkv'
    };
    
    if (extensoes[tipo]) input.accept = extensoes[tipo];
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        VirtualFS.adicionarArquivos(tipo, [file]);
        
        const nomeArquivo = file.name;
        const cacheKey = `${tipo}_${nomeArquivo}`;
        if (previewCache[cacheKey]) {
            URL.revokeObjectURL(previewCache[cacheKey]);
            delete previewCache[cacheKey];
        }
        
        if (callback) callback(nomeArquivo);
        log(`📁 ${tipo}: ${nomeArquivo} carregado`, 'success');
    };
    
    input.click();
}

function substituirMidiaEditor(tipo, nomeAntigo, callback) {
    if (nomeAntigo && nomeAntigo.trim() !== '') {
        log(`🔄 Substituindo: ${nomeAntigo}`, 'info');
    }
    uploadMidiaEditor(tipo, callback);
}

function renderizarBlocosEditor() {
    // Variações Lexicais
    const cVars = document.getElementById('econtainer-vars');
    if (!cVars) return;
    cVars.innerHTML = '';
    
    editorStateVars.forEach((obj, i) => {
        const temAudio = obj.audio && obj.audio.trim() !== '';
        const audioEncontrado = temAudio ? VirtualFS.audio.has(obj.audio.trim()) : false;
        
        cVars.innerHTML += `
        <div class="dynamic-block">
            <div class="block-header">Variação ${i + 1}
                ${i > 0 ? `<button class="btn btn-sm btn-danger" onclick="removerBlocoEditor('vars', ${i})">✕</button>` : '<span style="font-size:11px;color:#64748b;">Principal</span>'}
            </div>
            <div class="grid-row">
                <div class="form-group"><label>Termo</label><input type="text" value="${obj.item.replace(/"/g, '&quot;')}" oninput="editorStateVars[${i}].item = this.value; if(${i}===0) document.getElementById('einp_ITEM_LEXICAL').value = this.value;"></div>
                <div class="form-group">
                    <label>Áudio</label>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <input type="text" class="evar-audio-input" value="${obj.audio || ''}" oninput="editorStateVars[${i}].audio = this.value;" style="flex:1;">
                        ${temAudio ? `
                            <button class="btn btn-sm btn-play" onclick="visualizarMidiaNoEditor('audio', '${obj.audio.trim().replace(/'/g, "\\'")}')" title="Ouvir">▶</button>
                            <button class="btn btn-sm btn-action" onclick="substituirMidiaEditor('audio', '${obj.audio.trim().replace(/'/g, "\\'")}', (novoNome) => { editorStateVars[${i}].audio = novoNome; renderizarBlocosEditor(); })" title="Substituir">🔄</button>
                        ` : `
                            <button class="btn btn-sm btn-action" onclick="uploadMidiaEditor('audio', (novoNome) => { editorStateVars[${i}].audio = novoNome; renderizarBlocosEditor(); })" title="Adicionar áudio">📁</button>
                        `}
                    </div>
                    ${temAudio && !audioEncontrado ? '<span style="font-size:10px;color:#ef4444;">⚠️ Arquivo não carregado</span>' : ''}
                    ${temAudio && audioEncontrado ? '<span style="font-size:10px;color:#10b981;">✅ Arquivo OK</span>' : ''}
                </div>
            </div>
            <div class="grid-row">
                <div class="form-group"><label>Fonêmica</label><input type="text" value="${obj.fone || ''}" oninput="editorStateVars[${i}].fone = this.value;"></div>
                <div class="form-group"><label>Fonética</label><input type="text" value="${obj.fonet || ''}" oninput="editorStateVars[${i}].fonet = this.value;"></div>
            </div>
        </div>`;
    });
    
    // Exemplos
    const cExs = document.getElementById('econtainer-exs');
    if (cExs) {
        cExs.innerHTML = '';
        editorStateExs.forEach((obj, i) => {
            const temAudio = obj.audio && obj.audio.trim() !== '';
            const audioEncontrado = temAudio ? VirtualFS.audio.has(obj.audio.trim()) : false;
            
            cExs.innerHTML += `
            <div class="dynamic-block">
                <div class="block-header">Exemplo ${i + 1} <button class="btn btn-sm btn-danger" onclick="removerBlocoEditor('exs', ${i})">✕</button></div>
                <div class="form-group">
                    <label>Áudio</label>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <input type="text" class="eex-audio-input" value="${obj.audio || ''}" oninput="editorStateExs[${i}].audio = this.value;" style="flex:1;">
                        ${temAudio ? `
                            <button class="btn btn-sm btn-play" onclick="visualizarMidiaNoEditor('audio', '${obj.audio.trim().replace(/'/g, "\\'")}')" title="Ouvir">▶</button>
                            <button class="btn btn-sm btn-action" onclick="substituirMidiaEditor('audio', '${obj.audio.trim().replace(/'/g, "\\'")}', (novoNome) => { editorStateExs[${i}].audio = novoNome; renderizarBlocosEditor(); })" title="Substituir">🔄</button>
                        ` : `
                            <button class="btn btn-sm btn-action" onclick="uploadMidiaEditor('audio', (novoNome) => { editorStateExs[${i}].audio = novoNome; renderizarBlocosEditor(); })" title="Adicionar áudio">📁</button>
                        `}
                    </div>
                    ${temAudio && !audioEncontrado ? '<span style="font-size:10px;color:#ef4444;">⚠️ Arquivo não carregado</span>' : ''}
                    ${temAudio && audioEncontrado ? '<span style="font-size:10px;color:#10b981;">✅ Arquivo OK</span>' : ''}
                </div>
                <div class="form-group"><label>Transcrição</label><textarea oninput="editorStateExs[${i}].trans = this.value;">${obj.trans || ''}</textarea></div>
                <div class="form-group"><label>Tradução</label><textarea oninput="editorStateExs[${i}].trad = this.value;">${obj.trad || ''}</textarea></div>
            </div>`;
        });
    }
    
    // Imagens
    const cImgs = document.getElementById('econtainer-imgs');
    if (cImgs) {
        cImgs.innerHTML = '';
        editorStateImgs.forEach((obj, i) => {
            const temImg = obj.img && obj.img.trim() !== '';
            const imgEncontrada = temImg ? VirtualFS.imagem.has(obj.img.trim()) : false;
            const urlPreview = temImg && imgEncontrada ? obterUrlMidia('imagem', obj.img.trim()) : null;
            
            cImgs.innerHTML += `
            <div class="dynamic-block">
                <div class="block-header">Imagem ${i + 1} <button class="btn btn-sm btn-danger" onclick="removerBlocoEditor('imgs', ${i})">✕</button></div>
                ${urlPreview ? `
                    <div style="text-align:center;margin-bottom:12px;">
                        <img src="${urlPreview}" style="max-width:100%;max-height:200px;border-radius:8px;cursor:pointer;" onclick="visualizarMidiaNoEditor('imagem', '${obj.img.trim().replace(/'/g, "\\'")}')" title="Clique para ampliar">
                    </div>
                ` : ''}
                <div class="grid-row">
                    <div class="form-group">
                        <label>Arquivo</label>
                        <div style="display:flex;gap:6px;align-items:center;">
                            <input type="text" class="eimg-file-input" value="${obj.img || ''}" oninput="editorStateImgs[${i}].img = this.value;" style="flex:1;">
                            ${temImg ? `
                                <button class="btn btn-sm btn-play" onclick="visualizarMidiaNoEditor('imagem', '${obj.img.trim().replace(/'/g, "\\'")}')" title="Visualizar">👁️</button>
                                <button class="btn btn-sm btn-action" onclick="substituirMidiaEditor('imagem', '${obj.img.trim().replace(/'/g, "\\'")}', (novoNome) => { editorStateImgs[${i}].img = novoNome; renderizarBlocosEditor(); })" title="Substituir">🔄</button>
                            ` : `
                                <button class="btn btn-sm btn-action" onclick="uploadMidiaEditor('imagem', (novoNome) => { editorStateImgs[${i}].img = novoNome; renderizarBlocosEditor(); })" title="Adicionar imagem">📁</button>
                            `}
                        </div>
                        ${temImg && !imgEncontrada ? '<span style="font-size:10px;color:#ef4444;">⚠️ Arquivo não carregado</span>' : ''}
                        ${temImg && imgEncontrada ? '<span style="font-size:10px;color:#10b981;">✅ Arquivo OK</span>' : ''}
                    </div>
                    <div class="form-group"><label>Legenda</label><input type="text" value="${obj.leg || ''}" oninput="editorStateImgs[${i}].leg = this.value;"></div>
                </div>
            </div>`;
        });
    }
}

function adicionarBlocoEditor(tipo) {
    if (tipo === 'vars') editorStateVars.push({ item: '', audio: '', fone: '', fonet: '' });
    if (tipo === 'exs') editorStateExs.push({ audio: '', trans: '', trad: '' });
    if (tipo === 'imgs') editorStateImgs.push({ img: '', leg: '' });
    renderizarBlocosEditor();
}

function removerBlocoEditor(tipo, i) {
    if (tipo === 'vars' && i > 0) editorStateVars.splice(i, 1);
    if (tipo === 'exs') editorStateExs.splice(i, 1);
    if (tipo === 'imgs') editorStateImgs.splice(i, 1);
    renderizarBlocosEditor();
}

function switchTabEditor(evt, tabId) {
    document.querySelectorAll('#editorFormContent .tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#editorFormContent .tab-btn').forEach(t => t.classList.remove('active'));
    const tab = document.getElementById(tabId);
    if (tab) tab.classList.add('active');
    if (evt && evt.currentTarget) evt.currentTarget.classList.add('active');
    
    if (tabId === 'etab-video') {
        renderizarTabVideo();
    }
}

function renderizarTabVideo() {
    if (editorIndiceSelecionado < 0) return;
    const item = dadosGlobais[editorIndiceSelecionado];
    if (!item) return;
    
    const inputVideo = document.getElementById('einp_ARQUIVO_VIDEO');
    if (inputVideo) inputVideo.value = item.ARQUIVO_VIDEO || '';
    
    const videos = (item.ARQUIVO_VIDEO || '').split('|').map(v => v.trim()).filter(v => v);
    
    let container = document.getElementById('evideo-previews');
    if (!container) {
        container = document.createElement('div');
        container.id = 'evideo-previews';
        container.style.cssText = 'margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;';
        const parent = inputVideo?.parentElement?.parentElement;
        if (parent) parent.appendChild(container);
    }
    
    if (!container) return;
    container.innerHTML = '';
    
    videos.forEach(nomeVideo => {
        const encontrado = VirtualFS.video.has(nomeVideo);
        container.innerHTML += `
            <div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;text-align:center;background:#f8fafc;">
                <p style="font-size:11px;margin-bottom:6px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${nomeVideo}">🎬 ${nomeVideo}</p>
                ${encontrado ? `
                    <button class="btn btn-sm btn-play" onclick="visualizarMidiaNoEditor('video', '${nomeVideo.replace(/'/g, "\\'")}')">▶ Abrir</button>
                ` : `
                    <span style="font-size:10px;color:#ef4444;">⚠️ Não carregado</span>
                `}
            </div>`;
    });
    
    container.innerHTML += `
        <div style="border:2px dashed #e2e8f0;border-radius:8px;padding:8px;text-align:center;cursor:pointer;min-width:100px;display:flex;align-items:center;justify-content:center;" onclick="uploadMidiaEditor('video', (novoNome) => { const inp = document.getElementById('einp_ARQUIVO_VIDEO'); if(inp) inp.value = inp.value ? inp.value + '|' + novoNome : novoNome; renderizarTabVideo(); })">
            <span style="font-size:24px;color:#3b82f6;">+</span>
        </div>`;
}

function salvarAlteracoesEditor() {
    if (editorIndiceSelecionado < 0) return;
    
    let ok = true;
    CAMPOS_OBRIGATORIOS.forEach(c => {
        const el = document.getElementById(`einp_${c}`);
        if (el && el.value.trim() === '') { el.classList.add('input-error'); ok = false; }
        else if (el) el.classList.remove('input-error');
    });
    
    if (!ok) { log('❌ Preencha os campos obrigatórios destacados', 'error'); return; }
    
    const pack = arr => arr.map(a => a.trim()).filter(a => a).join('|');
    
    const dadosAtualizados = {
        CLASSE_GRAMATICAL: document.getElementById('einp_CLASSE_GRAMATICAL')?.value || '',
        CAMPO_SEMANTICO: document.getElementById('einp_CAMPO_SEMANTICO')?.value || '',
        SUB_CAMPO_SEMANTICO: document.getElementById('einp_SUB_CAMPO_SEMANTICO')?.value || '',
        TRADUCAO_SIGNIFICADO: document.getElementById('einp_TRADUCAO_SIGNIFICADO')?.value || '',
        ITENS_RELACIONADOS: document.getElementById('einp_ITENS_RELACIONADOS')?.value || '',
        DESCRICAO: document.getElementById('einp_DESCRICAO')?.value || '',
        ARQUIVO_VIDEO: document.getElementById('einp_ARQUIVO_VIDEO')?.value || '',
        ITEM_LEXICAL: pack(editorStateVars.map(v => v.item)),
        ARQUIVO_SONORO: pack(editorStateVars.map(v => v.audio)),
        TRANSCRICAO_FONEMICA: pack(editorStateVars.map(v => v.fone)),
        TRANSCRICAO_FONETICA: pack(editorStateVars.map(v => v.fonet)),
        ARQUIVO_SONORO_EXEMPLO: pack(editorStateExs.map(e => e.audio)),
        TRANSCRICAO_EXEMPLO: pack(editorStateExs.map(e => e.trans)),
        TRADUCAO_EXEMPLO: pack(editorStateExs.map(e => e.trad)),
        IMAGEM: pack(editorStateImgs.map(i => i.img)),
        LEGENDA_IMAGEM: pack(editorStateImgs.map(i => i.leg)),
    };
    
    Object.assign(dadosGlobais[editorIndiceSelecionado], dadosAtualizados);
    
    delete editorErrosMidia[editorIndiceSelecionado];
    const idxCampo = editorErrosCampos.indexOf(editorIndiceSelecionado);
    if (idxCampo > -1) editorErrosCampos.splice(idxCampo, 1);
    
    renderizarListaEditor();
    salvarEstado();
    
    try {
        localStorage.setItem('csv2dmli_dados', JSON.stringify({ 
            dados: dadosGlobais, 
            colunas: colunasCsv, 
            timestamp: Date.now() 
        }));
    } catch(e) {}
    
    document.getElementById('csvLinhas') && (document.getElementById('csvLinhas').textContent = `${dadosGlobais.length} linhas`);
    document.getElementById('statusCsv') && (document.getElementById('statusCsv').textContent = `${dadosGlobais.length} linhas`);
    
    log('💾 Alterações salvas! Use "Baixar CSV" para exportar.', 'success');

    // Se o filtro de erros estiver ativo, reaplica o filtro após salvar
    if (filtroErrosAtivo) {
        filtroErrosAtivo = false; // força reset
        toggleFiltroErros(); // reaplica
    }

}


// ============================================
// 20. LOADER DE PROCESSAMENTO
// ============================================

function mostrarLoader(titulo, mensagem) {
    fecharLoader();
    
    const overlay = document.createElement('div');
    overlay.className = 'loader-overlay';
    overlay.id = 'loaderOverlay';
    
    overlay.innerHTML = `
        <div class="loader-box">
            <div class="loader-spinner"></div>
            <div class="loader-title">${titulo}</div>
            <div class="loader-message" id="loaderMessage">${mensagem}</div>
            <div class="loader-progress-bar">
                <div class="loader-progress-fill" id="loaderProgressFill"></div>
            </div>
            <div class="loader-step" id="loaderStep"></div>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

function atualizarLoader(mensagem, progresso, step) {
    const msgEl = document.getElementById('loaderMessage');
    const progEl = document.getElementById('loaderProgressFill');
    const stepEl = document.getElementById('loaderStep');
    
    if (msgEl) msgEl.textContent = mensagem;
    if (progEl) progEl.style.width = `${Math.min(progresso, 100)}%`;
    if (stepEl) stepEl.textContent = step || '';
}

function fecharLoader() {
    const overlay = document.getElementById('loaderOverlay');
    if (overlay) overlay.remove();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// 21. DOWNLOAD DE TEMPLATES ATUAIS
// ============================================

function baixarTemplateAtual(tipo) {
    const map = {
        'html': { conteudo: VirtualFS.templateHtml, nome: 'dicionario.html' },
        'html-linear': { conteudo: VirtualFS.templateHtmlLinear, nome: 'dicionario-linear.html' },
        'typst': { conteudo: VirtualFS.templateTypst, nome: 'dicionario.typ' }
    };
    
    const item = map[tipo];
    if (!item || !item.conteudo) {
        log(`❌ Template ${item?.nome || tipo} não está carregado. Carregue-o primeiro.`, 'error');
        return;
    }
    
    baixarArquivo(item.conteudo, item.nome, 'text/plain;charset=utf-8');
    log(`📥 Template ${item.nome} baixado`, 'success');
}

function baixarTemplateEntradaAtual(tipo) {
    const map = {
        'html-card': { conteudo: templateEntradaCardHtml, nome: 'entrada-card.html' },
        'html-linear': { conteudo: templateEntradaLinearHtml, nome: 'entrada-linear.html' },
        'typst': { conteudo: templateEntradaTypst, nome: 'entrada.typ' }
    };
    
    const item = map[tipo];
    if (!item || !item.conteudo) {
        log(`❌ Template ${item?.nome || tipo} não está carregado.`, 'error');
        return;
    }
    
    baixarArquivo(item.conteudo, item.nome, 'text/plain;charset=utf-8');
    log(`📥 Template de entrada ${item.nome} baixado`, 'success');
}

function baixarCSSAtual(tipo) {
    const cssFile = tipo === 'entrada-linear' ? 'entrada-linear.css' : 'entrada-card.css';
    
    fetch(`static/css/${cssFile}`)
        .then(r => r.ok ? r.text() : Promise.reject())
        .then(css => {
            baixarArquivo(css, cssFile, 'text/css;charset=utf-8');
            log(`📥 CSS ${cssFile} baixado`, 'success');
        })
        .catch(() => {
            log(`❌ CSS ${cssFile} não encontrado`, 'error');
        });
}

// ============================================
// 22. EXPORTAÇÃO E IMPORTAÇÃO DE CONFIGURAÇÃO
// ============================================




function exportarConfiguracao() {
    const metaHtml = document.getElementById('metaHtml')?.value || '';
    const metaPdf = document.getElementById('metaPdf')?.value || '';
    const metaAutor = document.getElementById('metaAutor')?.value || '';
    const metaAno = document.getElementById('metaAno')?.value || '';
    const introHtml = document.getElementById('introHtml')?.value || '';
    const introPdf = document.getElementById('introPdf')?.value || '';
    const referencia = VirtualFS.textosExtra['_referencia'] || '';
    
    let txt = '';
    txt += `Titulo-html=${metaHtml}\n`;
    txt += `Titulo-pdf=${metaPdf}\n`;
    txt += `Autor(es)=${metaAutor}\n`;
    txt += `Data do Dicionário=${metaAno}\n`;
    txt += `Versão=1.0\n`;
    txt += `Midias_inclusas=${document.getElementById('swMidia')?.checked ? '1' : '0'}\n`;
    txt += `Alterar ordem dos campos=${document.getElementById('swSemantic')?.checked ? '1' : '0'}\n`;
    txt += `Manter a ordem alfabética=${document.getElementById('swAlpha')?.checked ? '2' : '0'}\n`;
    txt += `Ordem dos campos=${obterOrdemManual().join(',')}\n`;
    txt += `Usar ordem alfabética=${obterOrdemAlfabetica().join(',')}\n`;
    txt += `Estilo entrada HTML=${templateEntradaAtivo}\n`;
    
    if (introHtml) {
        txt += `\n# Introdução HTML (Markdown):\n`;
        txt += introHtml.split('\n').map(l => `# ${l}`).join('\n') + '\n';
    }
    if (introPdf) {
        txt += `\n# Introdução PDF:\n`;
        txt += introPdf.split('\n').map(l => `# ${l}`).join('\n') + '\n';
    }
    if (referencia) {
        txt += `\n# Referência Bibliográfica:\n`;
        txt += referencia.split('\n').map(l => `# ${l}`).join('\n') + '\n';
    }
    
    const timestamp = new Date().toISOString().slice(0, 10);
    baixarArquivo(txt, `configuracao_${timestamp}.txt`, 'text/plain;charset=utf-8');
    log('📤 Configuração completa exportada (inclui introduções e referência)', 'success');
}

function processarConfigCompleta(conteudo) {
    const linhas = conteudo.split('\n');
    let introHtml = '';
    let introPdf = '';
    let referencia = '';
    let secaoAtual = '';
    
    linhas.forEach(linha => {
        const linhaTrim = linha.trim();
        
        if (!linhaTrim.startsWith('#') && linhaTrim.includes('=')) {
            const idx = linhaTrim.indexOf('=');
            const chave = linhaTrim.substring(0, idx).trim();
            const valor = linhaTrim.substring(idx + 1).trim();
            
            const mapa = {
                'Titulo-html': 'metaHtml',
                'Titulo-pdf': 'metaPdf',
                'Autor(es)': 'metaAutor',
                'Data do Dicionário': 'metaAno'
            };
            
            if (mapa[chave]) {
                const el = document.getElementById(mapa[chave]);
                if (el) el.value = valor;
            }
            
            if (chave === 'Midias_inclusas') {
                const el = document.getElementById('swMidia');
                if (el) el.checked = (valor === '1' || valor === '2');
            }
            if (chave === 'Alterar ordem dos campos') {
                const el = document.getElementById('swSemantic');
                if (el) el.checked = (valor === '1' || valor === '2');
            }
            if (chave === 'Manter a ordem alfabética') {
                const el = document.getElementById('swAlpha');
                if (el) el.checked = (valor === '2');
            }
            if (chave === 'Ordem dos campos') VirtualFS.ordemCamposStr = valor;
            if (chave === 'Usar ordem alfabética') VirtualFS.usarOrdemAlfa = valor;
            if (chave === 'Estilo entrada HTML') {
                templateEntradaAtivo = valor;
                const select = document.getElementById('templateEntradaSelect');
                if (select) select.value = valor;
                localStorage.setItem('csv2dmli_templateEntradaAtivo', valor);
            }
        }
        
        if (linhaTrim.startsWith('# Introdução HTML')) { secaoAtual = 'introHtml'; return; }
        if (linhaTrim.startsWith('# Introdução PDF')) { secaoAtual = 'introPdf'; return; }
        if (linhaTrim.startsWith('# Referência Bibliográfica')) { secaoAtual = 'referencia'; return; }
        if (linhaTrim.startsWith('# ') && secaoAtual) {
            const conteudoLinha = linhaTrim.substring(2);
            if (secaoAtual === 'introHtml') introHtml += (introHtml ? '\n' : '') + conteudoLinha;
            if (secaoAtual === 'introPdf') introPdf += (introPdf ? '\n' : '') + conteudoLinha;
            if (secaoAtual === 'referencia') referencia = (referencia ? referencia + '\n' : '') + conteudoLinha;
        }
    });
    
    const elIntroHtml = document.getElementById('introHtml');
    const elIntroPdf = document.getElementById('introPdf');
    if (introHtml && elIntroHtml) elIntroHtml.value = introHtml;
    if (introPdf && elIntroPdf) elIntroPdf.value = introPdf;
    if (referencia) {
        VirtualFS.textosExtra['_referencia'] = referencia;
        VirtualFS.salvarCache();
    }
    
    if (categoriasUnicas.length > 0) aplicarConfiguracoesAosGrids();
    salvarEstado();
    log('📂 Configuração completa carregada', 'success');
}

// ============================================
// 23. SELEÇÃO DE PASTA DO PROJETO
// ============================================

function setupPastaProjeto() {
    const zone = document.getElementById('pastaProjetoDropZone');
    const input = document.getElementById('filePastaProjeto');
    
    if (!zone || !input) return;
    
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => { 
        e.preventDefault(); 
        zone.classList.remove('dragover'); 
        processarPastaProjeto([...e.dataTransfer.files]); 
    });
    input.addEventListener('change', e => { 
        processarPastaProjeto([...e.target.files]); 
    });
}

function lerArquivoTexto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file, 'UTF-8');
    });
}

async function processarPastaProjeto(files) {
    if (!files || files.length === 0) return;
    
    mostrarLoader('📁 Processando pasta do projeto', 'Analisando arquivos...');
    await sleep(80);
    
    const audioFiles = [];
    const imagemFiles = [];
    const videoFiles = [];
    const arquivosConfig = {};
    
    const extensoesAudio = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'wma']);
    const extensoesImagem = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']);
    const extensoesVideo = new Set(['mp4', 'webm', 'avi', 'mov', 'mkv']);
    
    const arquivosConfigNomes = {
        'configuracao.txt': 'config',
        'textos.json': 'textos',
        'intro.md': 'introMarkdown',
        'referencia.txt': 'referencia'
    };
    
    let processados = 0;
    const total = files.length;
    
    for (const file of files) {
        const nomeCompleto = file.webkitRelativePath || file.name;
        const nome = nomeCompleto.split('/').pop().split('\\').pop();
        const ext = nome.split('.').pop().toLowerCase();
        
        // Verifica se é CSV (processa automaticamente)
        if (ext === 'csv' && nome.toLowerCase().includes('dicionario')) {
            processarCSV(file);
        }
        
        const nomeBase = nome.toLowerCase();
        // Arquivos na raiz da pasta
        const partesCaminho = nomeCompleto.split('/');
        const estaNaRaiz = partesCaminho.length <= 2;
        
        if (arquivosConfigNomes[nomeBase] && estaNaRaiz) {
            try {
                const conteudo = await lerArquivoTexto(file);
                arquivosConfig[arquivosConfigNomes[nomeBase]] = conteudo;
            } catch(e) {
                console.warn(`Erro ao ler ${nome}:`, e);
            }
        }
        else if (extensoesAudio.has(ext)) {
            audioFiles.push(file);
        } else if (extensoesImagem.has(ext)) {
            imagemFiles.push(file);
        } else if (extensoesVideo.has(ext)) {
            videoFiles.push(file);
        }
        
        processados++;
        if (processados % 100 === 0 || processados === total) {
            atualizarLoader(
                `Analisando arquivos... (${processados}/${total})`, 
                Math.round((processados / total) * 30)
            );
            await sleep(30);
        }
    }
    
    // Processa configurações encontradas
    let configsEncontradas = [];
    
    if (arquivosConfig.config) {
        atualizarLoader('Aplicando configuracao.txt...', 40);
        await sleep(50);
        processarConfigCompleta(arquivosConfig.config);
        configsEncontradas.push('configuracao.txt');
    }
    
    if (arquivosConfig.textos) {
    atualizarLoader('Carregando textos.json...', 50);
    await sleep(50);
    try {
        const json = JSON.parse(arquivosConfig.textos);
        
        // ✅ EXTRAI O ARRAY DE TEXTOS E CONVERTE PARA MAPA
        const textosMap = {};
        
        // O JSON pode ter estrutura: { textos: [...] } ou ser array direto
        const textosArray = json.textos || (Array.isArray(json) ? json : []);
        
        if (Array.isArray(textosArray)) {
                    textosArray.forEach(texto => {
                        if (texto.titulo_base) {
                            textosMap[texto.titulo_base] = texto;
                        }
                    });
                }
                
                // ✅ Salva o MAPA (não o JSON bruto)
                VirtualFS.textosExtra = textosMap;
                VirtualFS.salvarCache();
                
                // Atualiza interface
                const zone = document.getElementById('textosDropZone');
                if (zone) zone.classList.add('loaded');
                
                const qtdTextos = Object.keys(textosMap).length;
                configsEncontradas.push(`textos.json (${qtdTextos} textos)`);
                
                // Log detalhado para debug
                console.log('✅ TEXTOS CARREGADOS DA PASTA:');
                console.log('  Total:', qtdTextos);
                console.log('  Chaves:', Object.keys(textosMap).slice(0, 5));
                console.log('  VirtualFS.textosExtra é mapa?', typeof VirtualFS.textosExtra === 'object' && !Array.isArray(VirtualFS.textosExtra));
                
                log(`📝 textos.json carregado (${qtdTextos} títulos base)`, 'success');
            } catch(e) {
                log('⚠️ textos.json inválido', 'warning');
                console.error('Erro ao processar textos.json:', e);
            }
        }
    
    if (arquivosConfig.introMarkdown) {
        atualizarLoader('Preenchendo introdução...', 55);
        const el = document.getElementById('introMarkdown');
        if (el) el.value = arquivosConfig.introMarkdown;
        configsEncontradas.push('intro.md');
        await sleep(30);
    }
    
    if (arquivosConfig.referencia) {
        atualizarLoader('Preenchendo referência...', 65);
        VirtualFS.textosExtra['_referencia'] = arquivosConfig.referencia;
        VirtualFS.salvarCache();
        configsEncontradas.push('referencia.txt');
        await sleep(30);
    }
    
    // Carrega mídias
    atualizarLoader('Carregando arquivos de mídia...', 70);
    await sleep(50);
    
    let totalAdicionados = 0;
    if (audioFiles.length > 0) {
        atualizarLoader(`Carregando ${audioFiles.length} áudios...`, 75);
        await sleep(30);
        totalAdicionados += VirtualFS.adicionarArquivos('audio', audioFiles);
    }
    if (imagemFiles.length > 0) {
        atualizarLoader(`Carregando ${imagemFiles.length} imagens...`, 82);
        await sleep(30);
        totalAdicionados += VirtualFS.adicionarArquivos('imagem', imagemFiles);
    }
    if (videoFiles.length > 0) {
        atualizarLoader(`Carregando ${videoFiles.length} vídeos...`, 90);
        await sleep(30);
        totalAdicionados += VirtualFS.adicionarArquivos('video', videoFiles);
    }
    
    VirtualFS.salvarCache();
    salvarEstado();
    const zonaProjeto = document.getElementById('pastaProjetoDropZone');
    if (zonaProjeto) zonaProjeto.classList.add('loaded');
    
    let msgFinal = `✅ ${totalAdicionados} mídias carregadas`;
    if (configsEncontradas.length > 0) {
        msgFinal += ` | Configs: ${configsEncontradas.join(', ')}`;
    }
    atualizarLoader(msgFinal, 100, 
        `Áudios: ${audioFiles.length} | Imagens: ${imagemFiles.length} | Vídeos: ${videoFiles.length}`
    );
    
    await sleep(2000);
    fecharLoader();
    
    log(`📁 Pasta processada: ${totalAdicionados} mídias de ${total} arquivos`, 'success');
    if (configsEncontradas.length > 0) {
        log(`📝 Arquivos de configuração carregados: ${configsEncontradas.join(', ')}`, 'success');
    }
}

// ============================================
// 24. ATUALIZAÇÃO DE STATUS
// ============================================

function atualizarStatusTemplates() {
    const todosOk = VirtualFS.templateHtml && VirtualFS.templateTypst;
    const nenhumOk = !VirtualFS.templateHtml && !VirtualFS.templateTypst;
    
    const statusEl = document.getElementById('badgeEstrutura');
    
    if (statusEl) {
        if (todosOk) {
            statusEl.textContent = '✅ Templates OK';
            statusEl.className = 'step-badge badge-ok';
        } else if (nenhumOk) {
            statusEl.textContent = 'Automático';
            statusEl.className = 'step-badge';
        } else {
            statusEl.textContent = '⚠️ Parcial';
            statusEl.className = 'step-badge badge-warning';
        }
    }
    
    if (todosOk) {
        log('📋 Todos os templates carregados com sucesso', 'success');
    } else if (nenhumOk) {
        log('💡 Usando templates padrão internos', 'info');
    } else {
        log('📋 Templates parcialmente carregados', 'warning');
    }
}


// ============================================
// 26. RESET DE TEMPLATES DE ENTRADA
// ============================================

function resetarTemplateEntrada(tipo, event) {
    // Impede propagação do clique
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    // Mapeamento de configurações por tipo
    const TEMPLATES_ENTRADA = {
        'html-card': { 
            varName: 'templateEntradaCardHtml', 
            fileName: 'entrada-card.html',
            storageKey: 'csv2dmli_templateEntradaCardHtml',
            statusId: 'templateEntradaCardHtmlStatus',
            zoneId: 'templateEntradaHtmlZone'
        },
        'html-linear': { 
            varName: 'templateEntradaLinearHtml', 
            fileName: 'entrada-linear.html',
            storageKey: 'csv2dmli_templateEntradaLinearHtml',
            statusId: 'templateEntradaLinearHtmlStatus',
            zoneId: 'templateEntradaLinearHtmlZone'
        },
        'typst': { 
            varName: 'templateEntradaTypst', 
            fileName: 'entrada.typ',
            storageKey: 'csv2dmli_templateEntradaTypst',
            statusId: 'templateEntradaTypstStatus',
            zoneId: 'templateEntradaTypstZone'
        }
    };
    
    const config = TEMPLATES_ENTRADA[tipo];
    if (!config) {
        log(`❌ Tipo de template inválido: ${tipo}`, 'error');
        return;
    }
    
    // Confirmação do usuário
    if (!confirm(`Voltar ao template padrão de entrada?\n\nArquivo: ${config.fileName}\n\nO template personalizado será removido e o padrão será restaurado.`)) {
        return;
    }
    
    // Elementos da UI
    const statusEl = document.getElementById(config.statusId);
    const zoneEl = document.getElementById(config.zoneId);
    
    // Feedback visual de carregamento
    if (statusEl) {
        statusEl.textContent = 'Carregando padrão...';
        statusEl.style.color = 'var(--primary)';
        statusEl.classList.add('loading');
    }
    
    // Limpa template atual da memória
    window[config.varName] = null;
    templateEntradaCardHtml = (tipo === 'html-card') ? null : templateEntradaCardHtml;
    templateEntradaLinearHtml = (tipo === 'html-linear') ? null : templateEntradaLinearHtml;
    templateEntradaTypst = (tipo === 'typst') ? null : templateEntradaTypst;
    
    // Remove do localStorage
    try { 
        localStorage.removeItem(config.storageKey); 
    } catch(e) {
        console.warn('Erro ao limpar localStorage:', e);
    }
    
    // Carrega template padrão
    fetch(`templates/${config.fileName}`)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.text();
        })
        .then(conteudo => {
            // Atribui às variáveis
            window[config.varName] = conteudo;
            
            switch(tipo) {
                case 'html-card': templateEntradaCardHtml = conteudo; break;
                case 'html-linear': templateEntradaLinearHtml = conteudo; break;
                case 'typst': templateEntradaTypst = conteudo; break;
            }
            
            // Atualiza UI
            if (statusEl) {
                statusEl.textContent = 'Padrão (pasta)';
                statusEl.style.color = '#10b981';
                statusEl.classList.remove('loading');
            }
            if (zoneEl) {
                zoneEl.classList.add('loaded');
                zoneEl.classList.remove('custom');
            }
            
            log(`📋 Template de entrada ${tipo} restaurado ao padrão`, 'success');
        })
        .catch(erro => {
            // Atualiza UI com erro
            if (statusEl) {
                statusEl.textContent = '❌ Padrão não encontrado';
                statusEl.style.color = '#ef4444';
                statusEl.classList.remove('loading');
            }
            if (zoneEl) {
                zoneEl.classList.remove('loaded', 'custom');
            }
            
            log(`❌ Template padrão ${config.fileName} não encontrado`, 'error');
            log('💡 Verifique se a pasta templates/ existe com os arquivos padrão', 'info');
        });
}

// ============================================
// 27. LIMPEZA GERAL DE MEMÓRIA - CORRIGIDA
// ============================================

async function limparMemoria() {
    // Confirmação com botões (mais amigável)
    if (!confirm(
        '🗑️ LIMPAR TUDO?\n\n' +
        'Esta ação irá:\n' +
        '• Remover todos os dados carregados\n' +
        '• Limpar o CSV e mídias\n' +
        '• Resetar templates para o padrão\n' +
        '• Limpar configurações e metadados\n' +
        '• Limpar o terminal\n' +
        '• Remover cache do navegador\n\n' +
        '⚠️ Esta ação NÃO PODE SER DESFEITA!\n\n' +
        'Clique em OK para confirmar ou Cancelar para abortar.'
    )) {
        log('❌ Limpeza cancelada pelo usuário', 'info');
        return;
    }
    
    log('🗑️ Iniciando limpeza completa...', 'warning');
    
    // ==========================================
    // 1. LIMPA DADOS GLOBAIS (CSV)
    // ==========================================
    dadosGlobais = [];
    colunasCsv = [];
    categoriasUnicas = [];
    
    // ==========================================
    // 2. LIMPA VIRTUALFS (MÍDIAS E TEMPLATES)
    // ==========================================
    VirtualFS.audio.clear();
    VirtualFS.imagem.clear();
    VirtualFS.video.clear();
    VirtualFS.alfabeto = '';
    VirtualFS.templateHtml = null;
    VirtualFS.templateHtmlLinear = null;
    VirtualFS.templateTypst = null;
    VirtualFS.textosExtra = {};
    VirtualFS.ordemCamposStr = null;
    VirtualFS.usarOrdemAlfa = null;
    
    // ==========================================
    // 3. LIMPA TEMPLATES DE ENTRADA
    // ==========================================
    templateEntradaCardHtml = null;
    templateEntradaLinearHtml = null;
    templateEntradaTypst = null;
    templateEntradaAtivo = 'card';
    
    // Limpa window também
    window.templateEntradaCardHtml = null;
    window.templateEntradaLinearHtml = null;
    window.templateEntradaTypst = null;
    
    // ==========================================
    // 4. LIMPA PREVIEWS DE MÍDIA
    // ==========================================
    if (typeof previewCache !== 'undefined') {
        Object.values(previewCache).forEach(url => {
            try { URL.revokeObjectURL(url); } catch(e) {}
        });
        previewCache = {};
    }
    
    // ==========================================
    // 5. LIMPA ESTADO DO EDITOR
    // ==========================================
    editorIndiceSelecionado = -1;
    editorStateVars = [];
    editorStateExs = [];
    editorStateImgs = [];
    editorErrosMidia = {};
    editorErrosCampos = [];
    filtroErrosAtivo = false;
    
    // ==========================================
    // 6. LIMPA TODOS OS INPUTS DE ARQUIVO
    // ==========================================
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(input => {
        input.value = '';
    });
    
    // ==========================================
    // 7. LIMPA COMPLETAMENTE O LOCALSTORAGE
    // ==========================================
    const chavesParaRemover = [];
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('csv2dmli')) {
            chavesParaRemover.push(key);
        }
    }
    
    chavesParaRemover.forEach(key => {
        try { 
            localStorage.removeItem(key);
            console.log(`🗑️ Removido do localStorage: ${key}`);
        } catch(e) {
            console.warn(`Erro ao remover ${key}:`, e);
        }
    });
    
    log(`📦 ${chavesParaRemover.length} itens removidos do localStorage`, 'info');
    
    // ==========================================
    // 8. RESETA CAMPOS DO FORMULÁRIO
    // ==========================================
    const camposFormulario = {
        'metaHtml': 'Meu Dicionário Interativo',
        'metaPdf': 'Meu Dicionário',
        'metaAutor': '',
        'metaAno': '',
        'introMarkdown': ''
    };
    
    Object.entries(camposFormulario).forEach(([id, valorPadrao]) => {
        const el = document.getElementById(id);
        if (el) el.value = valorPadrao;
    });
    
    // ==========================================
    // 9. RESETA SWITCHES PARA PADRÃO
    // ==========================================
    const switchesPadrao = {
        'swAlpha': true,
        'swSemantic': true,
        'swMidia': true
    };
    
    Object.entries(switchesPadrao).forEach(([id, checked]) => {
        const el = document.getElementById(id);
        if (el) {
            el.checked = checked;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    
    // ==========================================
    // 10. RESETA VISIBILIDADE DOS GRIDS
    // ==========================================
    const gridAlpha = document.getElementById('gridAlpha');
    const gridSemantic = document.getElementById('gridSemantic');
    const instrucaoAlpha = document.getElementById('instrucaoAlpha');
    
    if (gridAlpha) {
        gridAlpha.innerHTML = '<span class="placeholder-text">Carregue o CSV primeiro</span>';
        gridAlpha.style.display = 'none';
    }
    if (instrucaoAlpha) instrucaoAlpha.style.display = 'none';
    if (gridSemantic) {
        gridSemantic.innerHTML = '<span class="placeholder-text">Carregue o CSV primeiro</span>';
        gridSemantic.style.display = 'block';
    }
    
    // ==========================================
    // 11. RESETA SELECTS
    // ==========================================
    const selectTemplate = document.getElementById('templateEntradaSelect');
    if (selectTemplate) {
        selectTemplate.value = 'card';
    }
    
    // ==========================================
    // 12. ATUALIZA TODA A UI
    // ==========================================
    atualizarTodaUI();
    
    // ==========================================
    // 13. LIMPA TERMINAL
    // ==========================================
    limparTerminal();
    
    // ==========================================
    // 14. LIMPA STATUS DO MODAL DE CUSTOMIZAÇÃO
    // ==========================================
    
    // Lista de TODAS as drop zones que podem estar com classe 'loaded'
    const todasDropZones = [
        // Drop zones principais
        'csvDropZone',
        'pastaProjetoDropZone',
        // Drop zones do modal - Templates
        'templateHtmlZone',
        'templateHtmlLinearZone',
        'templateTypstZone',
        // Drop zones do modal - Entradas
        'templateEntradaHtmlZone',
        'templateEntradaLinearHtmlZone',
        'templateEntradaTypstZone',
        // Drop zones do modal - Configurações
        'configFullDropZone',
        'textosDropZone',
        'introHtmlDropZone',
        'introPdfDropZone',
        'referenciaDropZone',
        'alfabetoDropZone'
    ];
    
    todasDropZones.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('loaded');
        }
    });
    
    // Painéis de mídia (Passo 2)
    ['panelAudio', 'panelImagem', 'panelVideo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('loaded');
        }
    });
    
    // Status dos templates no modal - Reseta texto para "Padrão interno"
    const statusTemplateIds = [
        'templateHtmlStatus',
        'templateHtmlLinearStatus',
        'templateTypstStatus',
        'templateEntradaCardHtmlStatus',
        'templateEntradaLinearHtmlStatus',
        'templateEntradaTypstStatus'
    ];
    
    statusTemplateIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = 'Padrão interno';
            el.style.color = '';
        }
    });
    
    // Limpa preview do alfabeto
    const alfabetoPreview = document.getElementById('alfabetoPreview');
    if (alfabetoPreview) {
        alfabetoPreview.textContent = '';
        alfabetoPreview.style.display = 'none';
    }
    
    // ==========================================
    // 15. RECARREGA TEMPLATES PADRÃO
    // ==========================================
    await carregarTemplatesPadrao();
    await carregarTemplatesEntrada();
    
    // ==========================================
    // 16. FECHA MODAIS ABERTOS
    // ==========================================
    const modalEditor = document.getElementById('modalEditorOverlay');
    if (modalEditor) modalEditor.style.display = 'none';
    
    const modalCustom = document.getElementById('modalCustomizacao');
    if (modalCustom && modalCustom.open) modalCustom.close();
    
    fecharModal();
    fecharLoader();
    
    // ==========================================
    // 17. SALVA ESTADO LIMPO NO LOCALSTORAGE
    // ==========================================
    try {
        localStorage.setItem('csv2dmli_estado', JSON.stringify({
            metaHtml: 'Meu Dicionário Interativo',
            metaPdf: 'Meu Dicionário',
            metaAutor: '',
            metaAno: '',
            introMarkdown: '',
            swAlpha: true,
            swSemantic: true,
            swMidia: true,
            templateEntradaAtivo: 'card'
        }));
    } catch(e) {}
    
    // ==========================================
    // 18. LOG FINAL
    // ==========================================
    log('✅ Memória completamente limpa!', 'success');
    log('💡 Pronto para iniciar um novo projeto', 'info');
    log('📊 Carregue um CSV para começar', 'info');
}

// ==========================================
// FUNÇÃO AUXILIAR: atualizarTodaUI
// ==========================================
function atualizarTodaUI() {
    // Contadores de CSV
    const elLinhas = document.getElementById('csvLinhas');
    const elColunas = document.getElementById('csvColunas');
    const elCategorias = document.getElementById('csvCategorias');
    if (elLinhas) elLinhas.textContent = '0 linhas';
    if (elColunas) elColunas.textContent = '0 colunas';
    if (elCategorias) elCategorias.textContent = '0 categorias';
    
    // Status cards no topo
    const statusValores = {
        'statusCsv': 'Pendente',
        'statusAudio': '0',
        'statusImagem': '0',
        'statusVideo': '0'
    };
    Object.entries(statusValores).forEach(([id, valor]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = valor;
    });
    
    // Contadores de mídia nos painéis
    ['countAudio', 'countImagem', 'countVideo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '0';
    });
    
    // Cards de status (remove classes ok/error)
    ['statusCsvCard', 'statusAudioCard', 'statusImagemCard', 'statusVideoCard'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('ok', 'error');
        }
    });
    
    // Badges dos passos
    const badgesInfo = {
        'badgeCsv': { text: 'Pendente', className: 'step-badge' },
        'badgeMidias': { text: 'Pendente', className: 'step-badge' },
        'badgeMeta': { text: 'Pendente', className: 'step-badge' },
        'badgeEstrutura': { text: 'Automático', className: 'step-badge' }
    };
    Object.entries(badgesInfo).forEach(([id, info]) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = info.text;
            el.className = info.className;
        }
    });
}

// ============================================
// 28. ATUALIZAÇÃO COMPLETA DA UI
// ============================================

function atualizarTodaUI() {
    // --- CONTADORES DE CSV ---
    const elLinhas = document.getElementById('csvLinhas');
    const elColunas = document.getElementById('csvColunas');
    const elCategorias = document.getElementById('csvCategorias');
    if (elLinhas) elLinhas.textContent = '0 linhas';
    if (elColunas) elColunas.textContent = '0 colunas';
    if (elCategorias) elCategorias.textContent = '0 categorias';
    
    // --- STATUS CARDS ---
    const statusCsv = document.getElementById('statusCsv');
    const statusAudio = document.getElementById('statusAudio');
    const statusImagem = document.getElementById('statusImagem');
    const statusVideo = document.getElementById('statusVideo');
    
    if (statusCsv) statusCsv.textContent = 'Pendente';
    if (statusAudio) statusAudio.textContent = '0';
    if (statusImagem) statusImagem.textContent = '0';
    if (statusVideo) statusVideo.textContent = '0';
    
    // Remove classes dos status cards
    ['statusCsvCard', 'statusAudioCard', 'statusImagemCard', 'statusVideoCard'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('ok', 'error');
    });
    
    // --- BADGES ---
    const badgesPadrao = {
        'badgeCsv': 'Pendente',
        'badgeMidias': 'Pendente',
        'badgeMeta': 'Pendente',
        'badgeEstrutura': 'Automático'
    };
    
    Object.entries(badgesPadrao).forEach(([id, texto]) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = texto;
            el.className = 'step-badge';
        }
    });
    
    // --- CONTADORES DE MÍDIA ---
    ['countAudio', 'countImagem', 'countVideo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '0';
    });
    
    // --- DROP ZONES (remove classe 'loaded') ---
    const dropZonesIds = [
        'csvDropZone', 'pastaProjetoDropZone',
        'templateHtmlZone', 'templateHtmlLinearZone', 'templateTypstZone',
        'templateEntradaHtmlZone', 'templateEntradaLinearHtmlZone', 'templateEntradaTypstZone',
        'configFullDropZone', 'textosDropZone', 'introHtmlDropZone', 'introPdfDropZone',
        'referenciaDropZone', 'alfabetoDropZone'
    ];
    
    dropZonesIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('loaded', 'custom');
    });
    
    // --- STATUS DOS TEMPLATES ---
    const templateStatusIds = [
        'templateHtmlStatus', 'templateHtmlLinearStatus', 'templateTypstStatus',
        'templateEntradaCardHtmlStatus', 'templateEntradaLinearHtmlStatus', 'templateEntradaTypstStatus'
    ];
    
    templateStatusIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = 'Padrão interno';
            el.style.color = '';
            el.classList.remove('loading');
        }
    });
    
    // --- PAINÉIS DE MÍDIA ---
    ['panelAudio', 'panelImagem', 'panelVideo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('loaded');
    });
    
    // --- PREVIEW DO ALFABETO ---
    const alfPreview = document.getElementById('alfabetoPreview');
    const alfActions = document.getElementById('alfabetoActions');
    if (alfPreview) {
        alfPreview.textContent = '';
        alfPreview.style.display = 'none';
    }
    if (alfActions) {
        alfActions.style.display = 'none';
    }
    
    // --- GRIDS DE ESTRUTURA ---
    const gridAlpha = document.getElementById('gridAlpha');
    const gridSemantic = document.getElementById('gridSemantic');
    if (gridAlpha) gridAlpha.innerHTML = '<span class="placeholder-text">Carregue o CSV primeiro</span>';
    if (gridSemantic) gridSemantic.innerHTML = '<span class="placeholder-text">Carregue o CSV primeiro</span>';
    
    // --- EDITOR ---
    const editorLista = document.getElementById('editorListaItens');
    const editorCounter = document.getElementById('editorCounter');
    const editorForm = document.getElementById('editorFormContent');
    const editorEmpty = document.getElementById('editorEmptyState');
    const editorSearch = document.getElementById('editorSearch');
    const btnFiltro = document.getElementById('btnFiltrarErros');
    
    if (editorLista) editorLista.innerHTML = '';
    if (editorCounter) editorCounter.textContent = '0 itens';
    if (editorForm) editorForm.style.display = 'none';
    if (editorEmpty) editorEmpty.style.display = 'flex';
    if (editorSearch) editorSearch.value = '';
    if (btnFiltro) {
        btnFiltro.textContent = '⚠️ Filtrar erros (0)';
        btnFiltro.style.background = '#fef3c7';
        btnFiltro.style.borderColor = '#f59e0b';
        btnFiltro.style.color = '#92400e';
    }
    
    // --- RESETA TEMPLATES CARREGADOS ---
    templatesCarregados = { html: false, tex: false, typst: false };
    
    // --- ATUALIZA BADGE DE ESTRUTURA ---
    atualizarBadgeEstruturaTemplate();
}

// ============================================
// 29. USAR TEMPLATE PADRÃO
// ============================================

function usarTemplatePadrao(tipo, event) {
    // Impede propagação do clique
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    const TEMPLATES_DOCUMENTO = {
        'html': { 
            varName: 'templateHtml', 
            fileName: 'dicionario.html', 
            statusId: 'templateHtmlStatus', 
            zoneId: 'templateHtmlZone',
            storageKey: 'csv2dmli_template_html'
        },
        'html-linear': { 
            varName: 'templateHtmlLinear', 
            fileName: 'dicionario-linear.html', 
            statusId: 'templateHtmlLinearStatus', 
            zoneId: 'templateHtmlLinearZone',
            storageKey: 'csv2dmli_template_html-linear'
        },
        'typst': { 
            varName: 'templateTypst', 
            fileName: 'dicionario.typ', 
            statusId: 'templateTypstStatus', 
            zoneId: 'templateTypstZone',
            storageKey: 'csv2dmli_template_typst'
        }
    };
    
    const config = TEMPLATES_DOCUMENTO[tipo];
    if (!config) {
        log(`❌ Tipo de template inválido: ${tipo}`, 'error');
        return;
    }
    
    // Confirmação
    if (!confirm(`Voltar ao template padrão para ${tipo.toUpperCase()}?\n\nArquivo: ${config.fileName}\n\nO template personalizado será removido e o padrão será restaurado.`)) {
        return;
    }
    
    const statusEl = document.getElementById(config.statusId);
    const zoneEl = document.getElementById(config.zoneId);
    
    // Feedback visual
    if (statusEl) {
        statusEl.textContent = 'Carregando padrão...';
        statusEl.style.color = 'var(--primary)';
        statusEl.classList.add('loading');
    }
    
    // Limpa template atual
    VirtualFS[config.varName] = null;
    const tipoKey = tipo === 'html-linear' ? 'html' : tipo;
    templatesCarregados[tipoKey] = false;
    
    // Remove do localStorage
    try { 
        localStorage.removeItem(config.storageKey); 
    } catch(e) {}
    
    // Carrega template padrão
    fetch(`templates/${config.fileName}`)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.text();
        })
        .then(conteudo => {
            VirtualFS[config.varName] = conteudo;
            templatesCarregados[tipoKey] = true;
            
            if (statusEl) { 
                statusEl.textContent = 'Padrão (pasta)'; 
                statusEl.style.color = '#10b981';
                statusEl.classList.remove('loading');
            }
            if (zoneEl) {
                zoneEl.classList.add('loaded');
                zoneEl.classList.remove('custom');
            }
            
            atualizarBadgeEstruturaTemplate();
            log(`📋 Template ${tipo.toUpperCase()} restaurado ao padrão`, 'success');
        })
        .catch(() => {
            if (statusEl) { 
                statusEl.textContent = '❌ Não encontrado'; 
                statusEl.style.color = '#ef4444';
                statusEl.classList.remove('loading');
            }
            if (zoneEl) zoneEl.classList.remove('loaded', 'custom');
            
            atualizarBadgeEstruturaTemplate();
            log(`❌ Template ${tipo.toUpperCase()} não encontrado na pasta templates/`, 'error');
        });
}

// ============================================
// 30. LIMPAR ALFABETO
// ============================================

function limparAlfabeto(event) {
    // Impede propagação do clique
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    if (!confirm('Voltar ao alfabeto padrão?\n\nO alfabeto personalizado será removido.')) {
        return;
    }
    
    // Limpa alfabeto
    VirtualFS.alfabeto = '';
    
    // Remove do localStorage
    try { 
        localStorage.removeItem('csv2dmli_alfabeto'); 
    } catch(e) {}
    
    // Atualiza UI
    const preview = document.getElementById('alfabetoPreview');
    const actions = document.getElementById('alfabetoActions');
    const zone = document.getElementById('alfabetoDropZone');
    
    if (preview) {
        preview.textContent = '';
        preview.style.display = 'none';
    }
    if (actions) {
        actions.style.display = 'none';
    }
    if (zone) {
        zone.classList.remove('loaded');
    }
    
    log('🔤 Alfabeto restaurado ao padrão', 'success');
}

// ============================================
// 31. SOBRESCRITA DAS FUNÇÕES DE ALFABETO
// ============================================

// Sobrescreve processarAlfabeto para mostrar ações
const processarAlfabetoOriginal = processarAlfabeto;
processarAlfabeto = function(file) {
    processarAlfabetoOriginal(file);
    
    const actions = document.getElementById('alfabetoActions');
    if (actions) actions.style.display = 'flex';
};

// Sobrescreve carregarEstado para mostrar ações do alfabeto
const carregarEstadoOriginal = carregarEstado;
carregarEstado = function() {
    carregarEstadoOriginal();
    
    if (VirtualFS.alfabeto) {
        const actions = document.getElementById('alfabetoActions');
        if (actions) actions.style.display = 'flex';
    }
};



// ============================================
// 25. EVENT LISTENERS FINAIS
// ============================================


document.addEventListener('DOMContentLoaded', () => {
    // Referências - Ordem Alfabética
    const swAlpha = document.getElementById('swAlpha');
    const gridAlpha = document.getElementById('gridAlpha');
    const instrucaoAlpha = document.getElementById('instrucaoAlpha');

    // Referências - Ordem dos Capítulos
    const swSemantic = document.getElementById('swSemantic');
    const gridSemantic = document.getElementById('gridSemantic');

    // Função que controla a visibilidade da Ordem Alfabética
    function atualizarVisibilidadeAlpha() {
        if (swAlpha.checked) {
            // Se "Automático" está LIGADO: Esconde a grid e a instrução
            gridAlpha.style.display = 'none';
            instrucaoAlpha.style.display = 'none';
        } else {
            // Se "Automático" está DESLIGADO: Mostra a grid e a instrução
            gridAlpha.style.display = 'block'; // ou 'grid', dependendo do seu CSS original
            instrucaoAlpha.style.display = 'block';
        }
    }

    // Função que controla a visibilidade da Ordem dos Capítulos
    function atualizarVisibilidadeSemantic() {
        if (swSemantic.checked) {
            // Se "Manual" está LIGADO: Mostra a área de ordenação
            gridSemantic.style.display = 'block';
        } else {
            // Se "Manual" está DESLIGADO: Esconde a área de ordenação
            gridSemantic.style.display = 'none';
        }
    }

    // Cria os ouvintes de evento (acionados sempre que o usuário clica no toggle)
    swAlpha.addEventListener('change', atualizarVisibilidadeAlpha);
    swSemantic.addEventListener('change', atualizarVisibilidadeSemantic);

    // Executa as funções uma vez no carregamento da página para garantir 
    // que o visual inicial corresponda ao estado dos botões (checked ou não)
    atualizarVisibilidadeAlpha();
    atualizarVisibilidadeSemantic();
});


// Salva estado automaticamente quando campos mudam
['metaHtml','metaPdf','metaAutor','metaAno','introHtml','introPdf'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', salvarEstado);
});

['swAlpha','swSemantic','swMidia'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', salvarEstado);
});

// Fechar modal de editor ao clicar no overlay
document.getElementById('modalEditorOverlay')?.addEventListener('click', function(e) {
    if (e.target === this) fecharModalEditor();
});

console.log('✅ CSV2DMLI v4.1 - app.js carregado completamente');