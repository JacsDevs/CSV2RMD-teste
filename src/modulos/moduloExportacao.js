import ExportadorHtmlCards from './exportadorHtmlCards.js';
import ExportadorHtmlLinear from './exportadorHtmlLinear.js';
import ExportadorTypst from './exportadorTypst.js';
import ExportadorZip from './exportadorZip.js';
import CompiladorPdf from './compiladorPdf.js';

/**
 * Responsável por transformar os dados brutos em formatos de saída (HTML, ZIP, etc.).
 * Atua como orquestrador dos exportadores específicos.
 */
export default class ModuloExportacao {
    constructor(gerenciadorDados) {
        this.gerenciador = gerenciadorDados;
        
        // Instancia os exportadores específicos, delegando a lógica para eles
        this.exportadorCards = new ExportadorHtmlCards(this.gerenciador);
        this.exportadorLinear = new ExportadorHtmlLinear(this.gerenciador);
        this.exportadorTypstModule = new ExportadorTypst(this.gerenciador);
        this.exportadorZipModule = new ExportadorZip(this.gerenciador);
        this.compiladorPdf = new CompiladorPdf(this.gerenciador);

        console.log('📤 Módulo de Exportação inicializado.');
    }

    async inicializar() {
        // Inicializa os templates em cada exportador
        await Promise.all([
            this.exportadorCards.carregarTemplates(),
            this.exportadorLinear.carregarTemplates(),
            this.exportadorTypstModule.carregarTemplates()
        ]);
        console.log('✅ Templates de exportação carregados.');
    }

    async exportarHtmlCards(opcoes = {}) {
        return await this.exportadorCards.exportar(opcoes);
    }

    async exportarHtmlLinear(opcoes = {}) {
        return await this.exportadorLinear.exportar(opcoes);
    }

    exportarTypst(opcoes = {}) {
        return this.exportadorTypstModule.exportar(opcoes);
    }
    
    async exportarPdf(opcoes = {}, nomeArquivo = 'dicionario.pdf') {
        // 1. Gera a string .typ
        const codigoTypst = this.exportarTypst(opcoes);
        // 2. Compila para PDF usando o WASM offline
        const pdfBlob = await this.compiladorPdf.gerarPdf(codigoTypst);
        // 3. Salva o PDF
        this.salvarArquivoBlob(pdfBlob, nomeArquivo);
    }

    async exportarZip(nomeArquivo) {
        const zipBlob = await this.exportadorZipModule.exportar();
        this.salvarArquivoBlob(zipBlob, nomeArquivo);
    }

    salvarArquivo(conteudo, nomeArquivo, mimeType = 'text/html;charset=utf-8') {
        const blob = new Blob([conteudo], { type: mimeType });
        this.salvarArquivoBlob(blob, nomeArquivo);
    }

    salvarArquivoBlob(blob, nomeArquivo) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        a.click();
        URL.revokeObjectURL(url);
        console.log(`✅ Arquivo salvo: ${nomeArquivo}`);
    }
}