import Configurador from './utils/configurador.js';
import GerenciadorDados from './nucleo/gerenciadorDados.js';
import ModuloExportacao from './modulos/moduloExportacao.js';
import ModuloEditor from './modulos/moduloEditor.js';

let sistema = null;
let exportador = null;
let editor = null;

window.sistema = {
    iniciar: async () => {
        const configurador = new Configurador();
        await configurador.carregar();
        
        sistema = new GerenciadorDados(configurador);
        await sistema.inicializar();
        
        // Inicializar módulo de exportação
        exportador = new ModuloExportacao(sistema);
        await exportador.inicializar();
        
        // Inicializar módulo de edição
        editor = new ModuloEditor(sistema);
        
        console.log('✅ Sistema pronto!');
        console.log('📌 Comandos de exportação disponíveis em `window.sistema`:');
        console.log('  - exportarHtmlCards({ embutirMidias: false }) // Mídias separadas');
        console.log('  - exportarHtmlCards({ embutirMidias: true })  // Mídias embutidas');
        console.log('  - exportarHtmlLinear({ embutirMidias: false })');
        console.log('  - exportarHtmlLinear({ embutirMidias: true })');
        console.log('  - exportarZip()');
        return sistema;
    },
    
    carregarPlanilha: (arquivo) => sistema?.carregarPlanilha(arquivo),
    carregarTextos: (arquivo) => sistema?.carregarTextos(arquivo),
    adicionarMidias: (arquivos) => sistema?.adicionarMidias(arquivos),
    buscar: (termo) => sistema?.buscarPorTermo(termo),
    obterTodosDadosBrutos: () => {
        if (!sistema) return [];
        // Mapear os dados para incluir o índice
        return (sistema.dadosPlanilha || []).map((linha, idx) => {
            const varItem = linha.variacoes?.[0]?.item;
            return {
                indice: idx,
                itemLexical: varItem ? varItem.split('|')[0].trim() : `Linha ${idx + 1}`
            };
        });
    },
    
    // --- PREVIEWS E EDIÇÃO ---
    gerarPreview: async (dadosNormalizados, formato) => {
        if (!exportador) return null;
        
        const variacoes = dadosNormalizados.variacoes || [];
        const campos = dadosNormalizados.camposBasicos || {};
        const exemplos = dadosNormalizados.exemplos || [];
        const imagens = dadosNormalizados.imagens || [];
        
        const termos = variacoes.map(v => v.item).filter(Boolean);
        const fonemicas = variacoes.map(v => v.fone).filter(Boolean);
        const foneticas = variacoes.map(v => v.fonet).filter(Boolean);
        const audios = variacoes.map(v => v.audio).filter(Boolean);
        
        let significado = {
            NUMERO: '',
            TRADUCAO: campos.TRADUCAO_SIGNIFICADO || '',
            DESCRICAO: campos.DESCRICAO || '',
            EXEMPLOS: exemplos.map(e => ({ TRANS: e.trans || '', TRAD: e.trad || '' })),
            IMAGENS: imagens.map(i => ({ ARQUIVO: i.img ? i.img.split('/').pop().split('\\').pop() : '', LEGENDA: i.leg || '' })).filter(i => i.ARQUIVO),
            VIDEOS: campos.ARQUIVO_VIDEO ? [{ARQUIVO: campos.ARQUIVO_VIDEO}] : [],
            EXTRAS: []
        };
        
        const itemProcessado = {
            TERMO: termos.length > 0 ? termos.join(' ~ ') : '???',
            TERMO_PARENT: termos[0] || '???',
            CLASSE: campos.CLASSE_GRAMATICAL || '',
            CAMPO_SEMANTICO: campos.CAMPO_SEMANTICO || '',
            SUB_CAMPO_SEMANTICO: campos.SUB_CAMPO_SEMANTICO || '',
            FONEMICA: fonemicas.join(' ~ '),
            FONETICA: foneticas.join(' ~ '),
            AUDIO: audios.join(' ~ '),
            SIGNIFICADOS: [significado],
            ITENS_RELACIONADOS: campos.ITENS_RELACIONADOS || '',
            INDEX: campos.TRADUCAO_SIGNIFICADO || '',
            TEXTOS_ESTRUTURADOS: []
        };

        let resultadoHtml = null;
        if (formato === 'preview-html-card') {
            resultadoHtml = exportador.exportadorCards.processarTemplate(exportador.exportadorCards.templateEntrada, itemProcessado);
        } else if (formato === 'preview-html-linear') {
            resultadoHtml = exportador.exportadorLinear.processarTemplate(exportador.exportadorLinear.templateEntrada, itemProcessado);
        } else if (formato === 'preview-pdf') {
            const strTypst = exportador.exportadorTypstModule.processarTemplate(exportador.exportadorTypstModule.templateEntrada, itemProcessado);
            const docTypst = `#import "/in-dexter.typ": *\n#set page(width: auto, height: auto, margin: 10pt)\n#set text(font: ("Charis SIL", "Arial"), fallback: true)\n${strTypst}`;
            try {
                const blob = await exportador.compiladorPdf.gerarPdf(docTypst);
                return URL.createObjectURL(blob);
            } catch(e) {
                console.error("Erro ao gerar preview PDF", e);
                return null;
            }
        }
        
        if (resultadoHtml) {
            const div = document.createElement('div');
            div.innerHTML = resultadoHtml;
            div.querySelectorAll('img').forEach(img => {
                const src = img.getAttribute('src');
                if (src && !src.startsWith('blob:') && !src.startsWith('http')) {
                    const nome = src.split('/').pop();
                    if (sistema.vfs.imagem.has(nome)) img.src = sistema.vfs.obterUrl('imagem', nome);
                }
            });
            div.querySelectorAll('audio, source').forEach(el => {
                const src = el.getAttribute('src');
                if (src && !src.startsWith('blob:') && !src.startsWith('http')) {
                    const nome = src.split('/').pop();
                    if (sistema.vfs.audio.has(nome)) el.src = sistema.vfs.obterUrl('audio', nome);
                }
            });
            div.querySelectorAll('video, source').forEach(el => {
                const src = el.getAttribute('src');
                if (src && !src.startsWith('blob:') && !src.startsWith('http')) {
                    const nome = src.split('/').pop();
                    if (sistema.vfs.video.has(nome)) el.src = sistema.vfs.obterUrl('video', nome);
                }
            });
            return div.innerHTML;
        }
        return null;
    },
    
    // --- EXPORTAÇÕES ---
    
    /**
     * Exporta o dicionário como um arquivo HTML com layout de cards.
     * @param {object} opcoes - Opções de exportação.
     * @param {boolean} opcoes.embutirMidias - Se true, embute as mídias (imagens, áudios) como Base64 no HTML.
     */
    exportarHtmlCards: async (opcoes = {}) => {
        const html = await exportador.exportarHtmlCards(opcoes);
        const nomeArquivo = opcoes.embutirMidias ? 'dicionario-cards-embutido.html' : 'dicionario-cards.html';
        if (html) exportador.salvarArquivo(html, nomeArquivo);
    },

    exportarHtmlLinear: async (opcoes = {}) => {
        const html = await exportador.exportarHtmlLinear(opcoes);
        const nomeArquivo = opcoes.embutirMidias ? 'dicionario-linear-embutido.html' : 'dicionario-linear.html';
        if (html) exportador.salvarArquivo(html, nomeArquivo);
    },

    exportarTypst: () => {
        const typst = exportador.exportarTypst();
        if (typst) exportador.salvarArquivo(typst, 'dicionario.typ');
    },

    exportarPdf: async () => {
        console.log('Iniciando exportação PDF...');
        await exportador.exportarPdf({}, 'dicionario.pdf');
    },

    exportarZip: (nomeArquivo = 'dicionario_completo.zip') => {
        exportador.exportarZip(nomeArquivo);
    }
};

// =========================================================================
// --- COMPATIBILIDADE COM O HTML (Funções Globais) ---
// Como estamos usando Módulos (type="module"), as funções não ficam mais
// acessíveis nativamente pelo HTML. Precisamos atrelá-las ao `window`.
// =========================================================================

window.carregarPasta = function(evento) {
    // Se foi chamado por um <input type="file" webkitdirectory>
    if (evento && evento.target && evento.target.files) {
        window.sistema.adicionarMidias(evento.target.files);
    } else {
        console.warn('⚠️ carregarPasta invocado sem receber arquivos.');
    }
};

// Expondo também as funções de carregar arquivos avulsos, caso seu HTML precise:
window.carregarPlanilha = function(evento) {
    if (evento?.target?.files?.[0]) window.sistema.carregarPlanilha(evento.target.files[0]);
};
window.carregarTextos = function(evento) {
    if (evento?.target?.files?.[0]) window.sistema.carregarTextos(evento.target.files[0]);
};

// Iniciar
window.sistema.iniciar();