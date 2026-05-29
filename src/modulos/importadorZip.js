class ImportadorZip {
    constructor(sistema) {
        this.sistema = sistema;
    }

    async importar(arquivoZip) {
        if (typeof JSZip === 'undefined') {
            throw new Error('Biblioteca JSZip não está disponível. Por favor, inclua-a no HTML.');
        }

        const zip = new JSZip();
        const conteudo = await zip.loadAsync(arquivoZip);
        
        let temProjetoJson = false;
        let temCsv = false;
        let midiasCarregadas = 0;

        // Limpa o sistema atual
        this.sistema.limpar();

        const arquivosBlob = [];

        // Verifica os arquivos
        for (const relativePath in conteudo.files) {
            const fileEntry = conteudo.files[relativePath];
            if (fileEntry.dir) continue;

            const filename = fileEntry.name.split('/').pop();
            const extension = filename.split('.').pop().toLowerCase();
            
            // 1. Processar CSV
            if (filename === 'dicionario.csv' || extension === 'csv') {
                const text = await fileEntry.async("string");
                const blob = new Blob([text], { type: 'text/csv' });
                const file = new File([blob], filename, { type: 'text/csv' });
                await this.sistema.carregarPlanilha(file);
                temCsv = true;
                continue;
            }

            // 2. Processar Projeto JSON
            if (filename === 'projeto.json') {
                const text = await fileEntry.async("string");
                try {
                    const projeto = JSON.parse(text);
                    if (projeto.textosExtra) this.sistema.vfs.textosExtra = projeto.textosExtra;
                    if (projeto.introHtml) this.sistema.introHtml = projeto.introHtml;
                    if (projeto.introPdf) this.sistema.introPdf = projeto.introPdf;
                    if (projeto.referencia) this.sistema.referencia = projeto.referencia;
                    if (projeto.alfabetoCustomizado) this.sistema.alfabetoCustomizado = projeto.alfabetoCustomizado;
                    if (projeto.configuracaoTextoLocal) this.sistema.configuracaoTextoLocal = projeto.configuracaoTextoLocal;
                    
                    // Se o csv não foi encontrado, mas temos dadosPlanilha no json
                    if (!temCsv && projeto.dadosPlanilha && projeto.dadosPlanilha.length > 0) {
                        this.sistema.dadosPlanilha = projeto.dadosPlanilha;
                        this.sistema.colunasPlanilha = projeto.colunasPlanilha || [];
                        if (typeof this.sistema._reconstruirBanco === 'function') {
                            this.sistema._reconstruirBanco();
                        }
                    }
                    temProjetoJson = true;
                } catch (e) {
                    console.error("Erro ao ler projeto.json", e);
                }
                continue;
            }

            // 3. Processar Mídias
            // Extrai o MIME type baseado na extensão
            let mimeType = 'application/octet-stream';
            const audioExts = ['mp3', 'wav', 'ogg', 'm4a'];
            const imgExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
            const videoExts = ['mp4', 'webm', 'avi'];
            
            if (audioExts.includes(extension)) mimeType = 'audio/' + extension;
            else if (imgExts.includes(extension)) mimeType = 'image/' + extension;
            else if (videoExts.includes(extension)) mimeType = 'video/' + extension;

            const blob = await fileEntry.async("blob");
            const file = new File([blob], filename, { type: mimeType });
            arquivosBlob.push(file);
        }

        if (arquivosBlob.length > 0) {
            // Em vez de passar um NodeList ou FileList, passamos o array preenchido
            if (this.sistema.vfs) {
                // Acessa o CarregadorPasta que sabe adicionar mídias corretamente
                if (window.carregadorPasta && window.carregadorPasta.processarLote) {
                    await window.carregadorPasta.processarLote(arquivosBlob);
                } else if (this.sistema.adicionarMidias) {
                     await this.sistema.adicionarMidias(arquivosBlob);
                }
            }
            midiasCarregadas = arquivosBlob.length;
        }

        return {
            sucesso: true,
            csvEncontrado: temCsv,
            projetoEncontrado: temProjetoJson,
            midias: midiasCarregadas
        };
    }
}

export default ImportadorZip;
