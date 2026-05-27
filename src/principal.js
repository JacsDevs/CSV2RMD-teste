import Configurador from './utils/configurador.js';
import GerenciadorDados from './nucleo/gerenciadorDados.js';
import ModuloExportacao from './modulos/moduloExportacao.js';

let sistema = null;
let exportador = null;

window.sistema = {
    iniciar: async () => {
        const configurador = new Configurador();
        await configurador.carregar();
        
        sistema = new GerenciadorDados(configurador);
        await sistema.inicializar();
        
        // Inicializar módulo de exportação
        exportador = new ModuloExportacao(sistema);
        await exportador.inicializar();
        
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