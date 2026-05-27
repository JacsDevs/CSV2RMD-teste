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
    
    // --- PREVIEWS E EDIÇÃO ---
    abrirEditorParaItem: (indice) => editor?.obterItemParaEdicao(indice),
    salvarItemEditado: (indice, dados) => editor?.salvarEdicao(indice, dados),
    gerarPreview: async (dados, formato) => {
        if (!exportador) return null;
        
        // Simulando a estrutura do banco para o template
        const dadosFormatados = { ...dados.camposBasicos };
        dadosFormatados.ITEM_LEXICAL = (dados.variacoes || []).map(v => v.item).join(' | ');
        dadosFormatados.ARQUIVO_SONORO = (dados.variacoes || []).map(v => v.audio).join(' | ');
        dadosFormatados.TRANSCRICAO_FONEMICA = (dados.variacoes || []).map(v => v.fone).join(' | ');
        dadosFormatados.TRANSCRICAO_FONETICA = (dados.variacoes || []).map(v => v.fonet).join(' | ');
        dadosFormatados.ARQUIVO_SONORO_EXEMPLO = (dados.exemplos || []).map(e => e.audio).join(' | ');
        dadosFormatados.TRANSCRICAO_EXEMPLO = (dados.exemplos || []).map(e => e.trans).join(' | ');
        dadosFormatados.TRADUCAO_EXEMPLO = (dados.exemplos || []).map(e => e.trad).join(' | ');
        dadosFormatados.IMAGEM = (dados.imagens || []).map(i => i.img).join(' | ');
        dadosFormatados.LEGENDA_IMAGEM = (dados.imagens || []).map(i => i.leg).join(' | ');

        const itemProcessado = exportador.exportadorCards.extrairDadosEntrada(dadosFormatados);

        if (formato === 'preview-html-card') {
            return exportador.exportadorCards.processarTemplate(exportador.exportadorCards.templateEntrada, itemProcessado);
        } else if (formato === 'preview-html-linear') {
            return exportador.exportadorLinear.processarTemplate(exportador.exportadorLinear.templateEntrada, itemProcessado);
        } else if (formato === 'preview-pdf') {
            const strTypst = exportador.exportadorTypstModule.processarTemplate(exportador.exportadorTypstModule.templateEntrada, itemProcessado);
            const docTypst = `#set page(width: auto, height: auto, margin: 10pt)\n#set text(font: "Charis SIL")\n${strTypst}`;
            try {
                const blob = await exportador.compiladorPdf.gerarPdf(docTypst);
                return URL.createObjectURL(blob);
            } catch(e) {
                console.error("Erro ao gerar preview PDF", e);
                return null;
            }
        }
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