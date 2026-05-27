import { limparListaPipe } from '../utils/helpers.js';

// ============================================
// CONSTRUTOR DO BANCO DE DADOS LEXICAL
// ============================================

class ConstrutorBancoDados {
    constructor(sistemaArquivosVirtual, configurador = null) {
        this.vfs = sistemaArquivosVirtual;
        this.configurador = configurador;
    }

    validarEContarMidia(db, tipo, arquivo) {
        if (!arquivo) return true;
        const existe = this.verificarMidia(tipo, arquivo);
        if (existe) {
            db.metadados.midiasValidadas[tipo].encontrados++;
        } else {
            db.metadados.midiasValidadas[tipo].faltantes++;
        }
        return existe;
    }

    verificarMidia(tipo, nomeArquivo) {
        if (!nomeArquivo) return false;
        
        const existe = this.vfs.obterArquivo(tipo, nomeArquivo) !== null;
        
        if (!existe) {
            console.warn(`⚠️ Mídia não encontrada no VFS: ${tipo}/${nomeArquivo}`);
        }
        
        return existe;
    }

    obterMidiaUrl(tipo, nomeArquivo) {
        if (!nomeArquivo) return null;
        
        const arquivo = this.vfs.obterArquivo(tipo, nomeArquivo);
        
        if (arquivo) {
            if (arquivo instanceof File) {
                return URL.createObjectURL(arquivo);
            }
            return arquivo;
        }
        
        return null;
    }

    normalizarDados(df) {
        const db = { 
            entradas: {}, 
            variacoes: {}, 
            significados: {}, 
            exemplos: {}, 
            imagens: {},
            videos: {},
            metadados: {
                totalEntradas: 0,
                totalVariacoes: 0,
                totalSignificados: 0,
                totalImagens: 0,
                totalVideos: 0,
                dataGeracao: new Date().toISOString(),
                midiasValidadas: {
                    audio: { encontrados: 0, faltantes: 0 },
                    imagem: { encontrados: 0, faltantes: 0 },
                    video: { encontrados: 0, faltantes: 0 }
                }
            }
        };
        
        let contEntradas = 1;
        const mapaEntradas = {};
        const mapaSignificados = {};
        let contSignificados = 1;
        let contExemplos = 1;
        let contImagens = 1;
        let contVideos = 1;
        
        const regexSubCampo = /^SUB_CAMPO_SEMANTICO(_\d+)?$/i;
        const colunasSub = Object.keys(df[0] || {}).filter(col => regexSubCampo.test(col)).sort();

        const colunasPadrao = new Set([
            'ITEM_LEXICAL', 'CLASSE_GRAMATICAL', 'CAMPO_SEMANTICO', 'ITENS_RELACIONADOS',
            'ARQUIVO_SONORO', 'TRANSCRICAO_FONEMICA', 'TRANSCRICAO_FONETICA',
            'TRADUCAO_SIGNIFICADO', 'DESCRICAO', 'ARQUIVO_SONORO_EXEMPLO',
            'TRANSCRICAO_EXEMPLO', 'TRADUCAO_EXEMPLO', 'IMAGEM', 'LEGENDA_IMAGEM',
            'ARQUIVO_VIDEO', 'TEXTO', ...colunasSub
        ]);
        
        const colunasExtras = Object.keys(df[0] || {}).filter(c => 
            !colunasPadrao.has(c) && !c.startsWith('#')
        );

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
                const audioFile = audios[i] || '';
                
                const audioExiste = this.validarEContarMidia(db, 'audio', audioFile);
                
                if (lex && !entrada.VARIACOES_IDS.some(vid => db.variacoes[vid] && db.variacoes[vid].TRANSCRICAO_ORTOGRAFICA === lex)) {
                    const idVar = `${idEntrada}_var_${entrada.VARIACOES_IDS.length + 1}`;
                    db.variacoes[idVar] = { 
                        ID: idVar, 
                        TRANSCRICAO_ORTOGRAFICA: lex, 
                        ARQUIVO_SONORO: audioFile, 
                        ARQUIVO_SONORO_EXISTE: audioExiste,
                        ARQUIVO_SONORO_URL: audioExiste ? this.obterMidiaUrl('audio', audioFile) : null,
                        TRANSCRICAO_FONEMICA: fonemicas[i] || '', 
                        TRANSCRICAO_FONETICA: foneticas[i] || '' 
                    };
                    entrada.VARIACOES_IDS.push(idVar);
                }
            }
            
            // ========== TEXTOS ESTRUTURADOS ==========
            const complementos = [];
            const titulosBusca = limparListaPipe(linha['TEXTO']);
            
            titulosBusca.forEach(tit => {
                if (!tit) return;

                const fonteTextos = this.vfs.textosExtra;
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
                                        const audioFrase = f.audio?.arquivo || '';
                                        const audioDados = f.audio?.dados || '';
                                        
                                        let audioExiste = true;
                                        let audioFinal = audioDados || audioFrase;
                                        
                                        if (audioFrase && !audioDados) {
                                            audioExiste = this.validarEContarMidia(db, 'audio', audioFrase);
                                        }

                                        variacao.FRASES.push({
                                            ORIGINAL: f.texto_original || '',
                                            TRADUCAO: f.traducao || '',
                                            AUDIO_SRC: (audioExiste && audioFrase && !audioDados) ? this.obterMidiaUrl('audio', audioFrase) : audioFinal,
                                            AUDIO_ARQUIVO: audioFinal,
                                            AUDIO_EXISTE: audioExiste,
                                            ARQUIVO_ORIGEM: f.arquivo_origem || ''
                                        });
                                    });
                                }
                                textoFormatado.VARIACOES.push(variacao);
                            });
                        }
                        entrada.TEXTOS_ESTRUTURADOS.push(textoFormatado);
                    }
                    return;
                }

                if (fonteTextos && typeof fonteTextos[tit] === 'string') {
                    complementos.push(`<b>${tit}:</b> ${fonteTextos[tit]}`);
                } else if (!fonteTextos || !fonteTextos[tit]) {
                    complementos.push(`<b>${tit}:</b> [conteúdo não encontrado]`);
                }
            });

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
                
                const audioExiste = this.validarEContarMidia(db, 'audio', eAud);
                const imagemExiste = this.validarEContarMidia(db, 'imagem', img);
                const videoExiste = this.validarEContarMidia(db, 'video', vid);
                
                let idSigAtual = null;
                let idExNovo = null;
                let idImgNovo = null;
                let idVideoNovo = null;
                
                if (trad || desc) {
                    const chaveSig = `${trad.trim().toLowerCase()}||${desc.trim().toLowerCase()}`;
                    idSigAtual = mapaSignificados[chaveSig];
                    if (!idSigAtual) {
                        idSigAtual = `SIG_${String(contSignificados).padStart(5, '0')}`;
                        db.significados[idSigAtual] = { ID: idSigAtual, TRADUCAO: trad, DESCRICAO: desc };
                        mapaSignificados[chaveSig] = idSigAtual;
                        contSignificados++;
                    }
                }
                
                if (eTrans || eTrad) {
                    idExNovo = `${idEntrada}_ex_${contExemplos}`;
                    db.exemplos[idExNovo] = { 
                        ID: idExNovo, 
                        ARQUIVO_SONORO_EXEMPLO: eAud,
                        ARQUIVO_SONORO_EXISTE: audioExiste,
                        ARQUIVO_SONORO_URL: audioExiste ? this.obterMidiaUrl('audio', eAud) : null,
                        TRANSCRICAO_EXEMPLO: eTrans, 
                        TRADUCAO_EXEMPLO: eTrad 
                    };
                    contExemplos++;
                }
                
                if (img) {
                    idImgNovo = `${idEntrada}_img_${contImagens}`;
                    db.imagens[idImgNovo] = { 
                        ID: idImgNovo, 
                        IMAGEM: img,
                        IMAGEM_EXISTE: imagemExiste,
                        IMAGEM_URL: imagemExiste ? this.obterMidiaUrl('imagem', img) : null,
                        LEGENDA_IMAGEM: leg 
                    };
                    contImagens++;
                }
                
                if (vid) {
                    idVideoNovo = `${idEntrada}_vid_${contVideos}`;
                    if (!db.videos) db.videos = {};
                    db.videos[idVideoNovo] = { 
                        ID: idVideoNovo, 
                        ARQUIVO_VIDEO: vid,
                        VIDEO_EXISTE: videoExiste,
                        VIDEO_URL: videoExiste ? this.obterMidiaUrl('video', vid) : null
                    };
                    contVideos++;
                }
                
                if (idSigAtual || idExNovo || idImgNovo || idVideoNovo || temComplementos) {
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
                                VIDEOS_IDS: [],
                                EXTRAS: []
                            };
                            entrada.ACEPCOES.push(acepcaoAlvo);
                        }
                    }
                    
                    if (idExNovo && !acepcaoAlvo.EXEMPLOS_IDS.includes(idExNovo)) acepcaoAlvo.EXEMPLOS_IDS.push(idExNovo);
                    if (idImgNovo && !acepcaoAlvo.IMAGENS_IDS.includes(idImgNovo)) acepcaoAlvo.IMAGENS_IDS.push(idImgNovo);
                    if (idVideoNovo && !acepcaoAlvo.VIDEOS_IDS.includes(idVideoNovo)) acepcaoAlvo.VIDEOS_IDS.push(idVideoNovo);
                    
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
        
        db.metadados.totalEntradas = Object.keys(db.entradas).length;
        db.metadados.totalVariacoes = Object.keys(db.variacoes).length;
        db.metadados.totalSignificados = Object.keys(db.significados).length;
        db.metadados.totalImagens = Object.keys(db.imagens).length;
        db.metadados.totalVideos = Object.keys(db.videos || {}).length;
        
        db.metadados.totalMidiasProcessadas = 
            db.metadados.midiasValidadas.audio.encontrados + 
            db.metadados.midiasValidadas.imagem.encontrados + 
            db.metadados.midiasValidadas.video.encontrados;
        
        db.metadados.totalMidiasFaltantes = 
            db.metadados.midiasValidadas.audio.faltantes + 
            db.metadados.midiasValidadas.imagem.faltantes + 
            db.metadados.midiasValidadas.video.faltantes;
        
        console.log('✅ Banco construído com validação de mídias:');
        console.log(`   - Áudios: ${db.metadados.midiasValidadas.audio.encontrados} encontrados, ${db.metadados.midiasValidadas.audio.faltantes} faltantes`);
        console.log(`   - Imagens: ${db.metadados.midiasValidadas.imagem.encontrados} encontrados, ${db.metadados.midiasValidadas.imagem.faltantes} faltantes`);
        console.log(`   - Vídeos: ${db.metadados.midiasValidadas.video.encontrados} encontrados, ${db.metadados.midiasValidadas.video.faltantes} faltantes`);
        
        return db;
    }

    limparUrlsTemporarias(bancoDados) {
        if (!bancoDados) return;
        
        const limparUrl = (item) => {
            if (item?.ARQUIVO_SONORO_URL?.startsWith('blob:')) {
                URL.revokeObjectURL(item.ARQUIVO_SONORO_URL);
            }
            if (item?.IMAGEM_URL?.startsWith('blob:')) {
                URL.revokeObjectURL(item.IMAGEM_URL);
            }
            if (item?.VIDEO_URL?.startsWith('blob:')) {
                URL.revokeObjectURL(item.VIDEO_URL);
            }
        };
        
        Object.values(bancoDados.variacoes || {}).forEach(limparUrl);
        Object.values(bancoDados.exemplos || {}).forEach(limparUrl);
        Object.values(bancoDados.imagens || {}).forEach(limparUrl);
        Object.values(bancoDados.videos || {}).forEach(limparUrl);
        
        console.log('🧹 URLs temporárias limpas');
    }
}

export default ConstrutorBancoDados;