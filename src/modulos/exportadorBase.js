class ExportadorBase {
    constructor(gerenciadorDados) {
        this.db = gerenciadorDados;
    }

    processarTemplate(template, dados) {
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
                
                // Regra de Iteração (Arrays: SIGNIFICADOS, EXEMPLOS, IMAGENS)
                if (Array.isArray(valor)) {
                    return valor.map(item => {
                        if (typeof item === 'object' && item !== null) {
                            const temConteudo = Object.values(item).some(v => v !== null && v !== undefined && String(v).trim() !== '');
                            if (!temConteudo) return '';
                            return processar(conteudoInterno, { ...contextoAtual, ...item });
                        }
                        return ''; 
                    }).join('');
                }
                
                // Regra de Condição Simples
                const novoContexto = (typeof valor === 'object' && valor !== null) ? { ...contextoAtual, ...valor } : contextoAtual;
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

        let resultado = processar(template, dados);

        // 3. Limpeza Final de Artefatos e Formatação
        return resultado
            .replace(/#align\s*\(\s*center\s*\)\s*\[\s*\n?\s*\]/g, '')
            .replace(/#image\s*\(\s*"",[^)]*\)/g, '')
            .replace(/\*_\s*_\*/g, '')
            .replace(/^\s*\.\s*\.\s*$/gm, '')
            .replace(/\n\s*\n\s*\n+/g, '\n\n')
            .trim();
    }

    extrairDadosEntrada(entrada) {
        const banco = this.db.bancoDados;
        const variacoes = (entrada.VARIACOES_IDS || []).map(id => banco.variacoes[id]).filter(Boolean);
        
        const termosUnicos = [...new Set(variacoes.map(v => v.TRANSCRICAO_ORTOGRAFICA).filter(Boolean))];
        const fonemicasUnicas = [...new Set(variacoes.map(v => v.TRANSCRICAO_FONEMICA).filter(Boolean))].map(f => `/${f}/`); 
        const foneticasUnicas = [...new Set(variacoes.map(v => v.TRANSCRICAO_FONETICA).filter(Boolean))].map(f => `[${f}]`);
        const audiosUnicos = [...new Set(variacoes.map(v => v.ARQUIVO_SONORO).filter(Boolean))];

        const significados = [];
        if (entrada.ACEPCOES && entrada.ACEPCOES.length > 0) {
            entrada.ACEPCOES.forEach((ac, idx) => {
                const significado = { NUMERO: entrada.ACEPCOES.length > 1 ? String(idx + 1) : '', TRADUCAO: '', DESCRICAO: '', EXEMPLOS: [], IMAGENS: [], VIDEOS: [], EXTRAS: [] };
                
                if (ac.SIGNIFICADO_ID && banco.significados[ac.SIGNIFICADO_ID]) {
                    const sig = banco.significados[ac.SIGNIFICADO_ID];
                    significado.TRADUCAO = sig.TRADUCAO || '';
                    significado.DESCRICAO = sig.DESCRICAO || '';
                }
                if (ac.EXEMPLOS_IDS) ac.EXEMPLOS_IDS.forEach(exId => {
                    const ex = banco.exemplos[exId];
                    if (ex) significado.EXEMPLOS.push({ TRANS: ex.TRANSCRICAO_EXEMPLO || '', TRAD: ex.TRADUCAO_EXEMPLO || '' });
                });
                if (ac.IMAGENS_IDS) ac.IMAGENS_IDS.forEach(imgId => {
                    const img = banco.imagens[imgId];
                    if (img && img.IMAGEM) significado.IMAGENS.push({ ARQUIVO: decodeURIComponent(img.IMAGEM.split('/').pop().split('\\').pop()).replace(/[{}]/g, '').trim().toLowerCase(), LEGENDA: img.LEGENDA_IMAGEM || '' });
                });
                if (ac.ARQUIVOS_VIDEO) ac.ARQUIVOS_VIDEO.forEach(vid => { if (vid) significado.VIDEOS.push({ ARQUIVO: vid }); });
                if (ac.EXTRAS) ac.EXTRAS.forEach(ext => { if (ext) significado.EXTRAS.push({ TEXTO: ext }); });
                
                significados.push(significado);
            });
        }
        
        return {
            TERMO: termosUnicos.length > 0 ? termosUnicos.join(' ~ ') : (entrada._TERMO_PRINCIPAL || '???'),
            TERMO_PARENT: entrada._TERMO_PRINCIPAL || '???', 
            CLASSE: entrada.CLASSE_GRAMATICAL || '',
            CAMPO_SEMANTICO: entrada.CAMPO_SEMANTICO || '',
            SUB_CAMPO_SEMANTICO: entrada.SUB_CAMPOS_SEMANTICOS ? entrada.SUB_CAMPOS_SEMANTICOS.join(', ') : '',
            FONEMICA: fonemicasUnicas.join(' ~ '),
            FONETICA: foneticasUnicas.join(' ~ '),
            AUDIO: audiosUnicos.join(' ~ '),
            SIGNIFICADOS: significados,  
            ITENS_RELACIONADOS: entrada.ITENS_RELACIONADOS || '',
            INDEX: significados.length > 0 ? significados[0].TRADUCAO : '',
            TEXTOS_ESTRUTURADOS: entrada.TEXTOS_ESTRUTURADOS || []
        };
    }

    async gerarScriptsDadosEmLotes(tipoAtivo, embutirMidias = false) {
        const db = this.db.bancoDados;
        if (!db) return '';

        // 1. Extrair mídias referenciadas para não embutir lixo
        const referenciadas = { audio: new Set(), imagem: new Set(), video: new Set() };
        for (const entrada of Object.values(db.entradas)) {
            entrada.VARIACOES_IDS?.forEach(id => {
                const v = db.variacoes[id];
                if (v && v.ARQUIVO_SONORO) referenciadas.audio.add(v.ARQUIVO_SONORO);
            });
            entrada.ACEPCOES?.forEach(ac => {
                ac.EXEMPLOS_IDS?.forEach(id => {
                    const ex = db.exemplos[id];
                    if (ex && ex.ARQUIVO_SONORO_EXEMPLO) referenciadas.audio.add(ex.ARQUIVO_SONORO_EXEMPLO);
                });
                ac.IMAGENS_IDS?.forEach(id => {
                    const img = db.imagens[id];
                    if (img && img.IMAGEM) referenciadas.imagem.add(img.IMAGEM.split(/[\/\\]/).pop());
                });
                ac.ARQUIVOS_VIDEO?.forEach(vid => {
                    if (vid) referenciadas.video.add(vid.split(/[\/\\]/).pop());
                });
            });
        }

        const midias = {};
        const tipos = { audio: 'audio/', imagem: 'foto/', video: 'video/' };
        
        if (embutirMidias && this.db.vfs) {
            const arquivosParaConverter = [];
            
            for (const [tipo, prefixo] of Object.entries(tipos)) {
                for (const nome of referenciadas[tipo]) {
                    const arquivo = this.db.vfs.obterArquivo(tipo, nome);
                    if (arquivo instanceof File || arquivo instanceof Blob) {
                        arquivosParaConverter.push({ nome, arquivo });
                    } else {
                        midias[nome] = prefixo + nome;
                    }
                }
            }
            
            if (arquivosParaConverter.length > 0) {
                console.log(`⏳ Iniciando conversão de ${arquivosParaConverter.length} mídias via Web Worker...`);
                
                await new Promise((resolve) => {
                    const worker = new Worker('src/workers/exportacaoWorker.js');
                    worker.onmessage = (e) => {
                        const { tipo, convertidos, total, resultado } = e.data;
                        if (tipo === 'progresso') {
                            console.log(`  Progresso conversão: ${convertidos}/${total}`);
                            // Opcional: disparar evento customizado para a UI pegar a barra de progresso
                            const evento = new CustomEvent('exportacaoProgresso', { detail: { progresso: convertidos, total } });
                            window.dispatchEvent(evento);
                        } else if (tipo === 'concluido') {
                            Object.assign(midias, resultado);
                            worker.terminate();
                            resolve();
                        }
                    };
                    worker.onerror = (err) => {
                        console.error('Erro no Worker de exportação:', err);
                        worker.terminate();
                        resolve(); // Resolve de qualquer forma para não travar
                    };
                    worker.postMessage({ id: 1, tipo: 'gerarBase64', arquivos: arquivosParaConverter });
                });
                
                console.log('✅ Conversão concluída!');
            }
        } else {
            // Apenas referenciar pelo caminho local relativo
            for (const [tipo, prefixo] of Object.entries(tipos)) {
                for (const nome of referenciadas[tipo]) {
                    midias[nome] = prefixo + nome;
                }
            }
        }

        // 2. Preparar os dados para a UI
        const entradasConvertidas = [];
        for (const entrada of Object.values(db.entradas)) {
            const dados = this.extrairDadosEntrada(entrada);
            entradasConvertidas.push({ ...entrada, ...dados });
        }

        // 3. Empacotar em Scripts por Lotes
        const LOTES = 50;
        let scripts = '<script>\n';
        scripts += `window.DicionarioMidias = ${JSON.stringify(midias)};\n`;
        scripts += `window.dadosDicionarioLexical = [];\n`;
        scripts += `window.templateEntradaAtivo = "${tipoAtivo}";\n`;
        scripts += `function adicionaDados(lote) { window.dadosDicionarioLexical.push(...lote); }\n`;
        scripts += '<\/script>\n';

        for (let i = 0; i < entradasConvertidas.length; i += LOTES) {
            const lote = entradasConvertidas.slice(i, i + LOTES);
            scripts += `<script>adicionaDados(${JSON.stringify(lote)});<\/script>\n`;
        }

        return scripts;
    }
}
export default ExportadorBase;