import SistemaArquivosVirtual from './sistemaArquivosVirtual.js';
import CarregadorCsv from './carregadorCsv.js';
import ConstrutorBancoDados from './construtorBancoDados.js';
import { buscaFuzzy } from '../utils/helpers.js';

/**
 * Gerencia o carregamento e o armazenamento de todos os dados da aplicação,
 * orquestrando os componentes do núcleo conforme a arquitetura modular.
 */
export default class GerenciadorDados {
    constructor(configurador) {
        if (!configurador) {
            throw new Error("GerenciadorDados requer uma instância de Configurador válida.");
        }
        this.configurador = configurador;

        // Instancia os componentes do núcleo
        this.vfs = new SistemaArquivosVirtual(this.configurador);
        this.carregadorCsv = new CarregadorCsv();
        this.construtorDB = new ConstrutorBancoDados(this.vfs, this.configurador);

        this.dadosPlanilha = [];
        this.colunasPlanilha = [];
        this._bancoConstruido = null;
        
        // Propriedades extras legadas/customizadas (vindos de arquivos de texto separados)
        this.introHtml = '';
        this.introPdf = '';
        this.referencia = '';
        this.alfabetoCustomizado = '';
        this.configuracaoTextoLocal = {};

        console.log('🗃️ Gerenciador de Dados inicializado (Arquitetura Modular).');
    }

    async inicializar() {
        await this.vfs.carregarDoBanco();
        await this.carregadorCsv.init();
        // Futuramente, pode carregar dados do cache aqui
    }

    get bancoDados() {
        return this._bancoConstruido;
    }

    /**
     * Carrega e processa o arquivo CSV da planilha.
     * @param {File} arquivo - O arquivo .csv a ser processado.
     * @returns {Promise<void>}
     */
    async carregarPlanilha(arquivo) {
        console.log(`📄 Processando planilha via CarregadorCsv: ${arquivo.name}`);
        const resultado = await this.carregadorCsv.processarCSV(arquivo);
        this.dadosPlanilha = resultado.dados;
        this.colunasPlanilha = resultado.colunas;
        
        console.log(`✅ Planilha carregada: ${this.dadosPlanilha.length} linhas.`);
        this._reconstruirBanco();
    }

    /**
     * Carrega o arquivo JSON de textos e o transforma em um mapa para acesso rápido.
     * @param {File} arquivo - O arquivo textos.json.
     * @returns {Promise<void>}
     */
    carregarTextos(arquivo) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json = JSON.parse(e.target.result);
                    this.adicionarTextosEstruturados(json);
                    resolve();
                } catch (err) {
                    console.error(`❌ Erro no formato do textos.json: ${err.message}`);
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsText(arquivo);
        });
    }

    /**
     * Processa os textos estruturados do JSON e os envia ao Sistema de Arquivos Virtual.
     * É chamada tanto por carregarTextos() avulso quanto pelo CarregadorPasta.
     * @param {object} json - O conteúdo parseado do arquivo textos.json
     */
    adicionarTextosEstruturados(json) {
        const textosMap = {};
        const textosArray = json.textos || (Array.isArray(json) ? json : Object.values(json));

        // Mapeia os textos pela chave 'titulo_base' para busca rápida O(1)
        if (Array.isArray(textosArray)) {
            textosArray.forEach(texto => {
                if (texto.titulo_base) {
                    textosMap[texto.titulo_base] = texto;
                }
            });
        } else {
            Object.assign(textosMap, textosArray);
        }

        // Envia para a memória do VFS
        if (typeof this.vfs.adicionarTextosEstruturados === 'function') {
            this.vfs.adicionarTextosEstruturados(textosMap);
        } else {
            this.vfs.textos = textosMap;
        }
        
        console.log(`📝 ${Object.keys(textosMap).length} textos estruturados mapeados e enviados ao VFS.`);
        this._reconstruirBanco();
    }

    /**
     * Adiciona arquivos de mídia (áudio, imagem, vídeo) ao sistema.
     * @param {FileList} arquivos - A lista de arquivos a serem adicionados.
     */
    adicionarMidias(arquivos) {
        console.log(`🖼️ Adicionando ${arquivos.length} arquivos de mídia...`);
        if (!arquivos || arquivos.length === 0) return;

        Array.from(arquivos).forEach(arquivo => {
            const tipo = arquivo.type;
            if (tipo.startsWith('audio/')) {
                this.vfs.adicionarArquivos('audio', [arquivo]);
            } else if (tipo.startsWith('image/')) {
                this.vfs.adicionarArquivos('imagem', [arquivo]);
            } else if (tipo.startsWith('video/')) {
                this.vfs.adicionarArquivos('video', [arquivo]);
            }
        });
        
        this._reconstruirBanco();
    }

    _reconstruirBanco() {
        if (this.dadosPlanilha && this.dadosPlanilha.length > 0) {
            this._bancoConstruido = this.construtorDB.normalizarDados(this.dadosPlanilha);
        }
    }

    /**
     * Retorna o objeto contendo os mapas de mídias, garantindo compatibilidade.
     */
    getPastasMidia() {
        return { audio: this.vfs.audio, imagem: this.vfs.imagem, video: this.vfs.video };
    }

    limpar() {
        this.dadosPlanilha = [];
        this.colunasPlanilha = [];
        this._bancoConstruido = null;
        this.vfs.limpar();
        console.log('🧹 Dados limpos com sucesso.');
    }

    obterEstatisticas() {
        const b = this._bancoConstruido;
        return {
            disponivel: this.dadosPlanilha.length > 0,
            entradas: b ? Object.keys(b.entradas).length : 0,
            variacoes: b ? Object.keys(b.variacoes).length : 0,
            significados: b ? Object.keys(b.significados).length : 0,
            midias: {
                audio: this.vfs.obterContagem('audio'),
                imagem: this.vfs.obterContagem('imagem'),
                video: this.vfs.obterContagem('video')
            }
        };
    }

    obterArvoreOrdenada() {
        if (!this._bancoConstruido) return { arvore: {}, categoriasRaizes: [] };
        
        const arvore = {};
        const categoriasRaizes = new Set();
        
        Object.values(this._bancoConstruido.entradas).forEach(entrada => {
            const cat = entrada.CAMPO_SEMANTICO || 'Geral';
            categoriasRaizes.add(cat);
            if (!arvore[cat]) arvore[cat] = { _entradas: [] };
            arvore[cat]._entradas.push(entrada);
        });
        
        return { arvore, categoriasRaizes: Array.from(categoriasRaizes).sort() };
    }

    buscarPorTermo(termo, opcoes = { fuzzy: true, global: true }) {
        if (!this._bancoConstruido) return [];
        const termoBusca = termo.trim().toLowerCase();
        
        return Object.values(this._bancoConstruido.entradas).filter(item => {
            let match = false;
            
            // 1. Busca no termo principal e variações
            if (opcoes.fuzzy) {
                match = buscaFuzzy(item._TERMO_PRINCIPAL, termoBusca);
                if (!match && item.VARIACOES_IDS) {
                    for (const vId of item.VARIACOES_IDS) {
                        const v = this._bancoConstruido.variacoes[vId];
                        if (v && buscaFuzzy(v.TRANSCRICAO_ORTOGRAFICA, termoBusca)) {
                            match = true;
                            break;
                        }
                    }
                }
            } else {
                match = item._TERMO_PRINCIPAL && item._TERMO_PRINCIPAL.toLowerCase().includes(termoBusca);
                if (!match && item.VARIACOES_IDS) {
                    for (const vId of item.VARIACOES_IDS) {
                        const v = this._bancoConstruido.variacoes[vId];
                        if (v && v.TRANSCRICAO_ORTOGRAFICA && v.TRANSCRICAO_ORTOGRAFICA.toLowerCase().includes(termoBusca)) {
                            match = true;
                            break;
                        }
                    }
                }
            }

            // 2. Busca Global em Acepções (Significados e Descrições)
            if (!match && opcoes.global && item.ACEPCOES) {
                for (const aId of item.ACEPCOES) {
                    const acep = this._bancoConstruido.significados[aId];
                    if (!acep) continue;
                    
                    if (opcoes.fuzzy) {
                        if (buscaFuzzy(acep.TRADUCAO_SIGNIFICADO, termoBusca) || buscaFuzzy(acep.DESCRICAO, termoBusca)) {
                            match = true; break;
                        }
                    } else {
                        if ((acep.TRADUCAO_SIGNIFICADO && acep.TRADUCAO_SIGNIFICADO.toLowerCase().includes(termoBusca)) ||
                            (acep.DESCRICAO && acep.DESCRICAO.toLowerCase().includes(termoBusca))) {
                            match = true; break;
                        }
                    }
                }
            }
            
            // 3. Filtragem Combinada
            if (match && opcoes.classeGramatical) {
                if (!item.CLASSE_GRAMATICAL || item.CLASSE_GRAMATICAL.toLowerCase() !== opcoes.classeGramatical.toLowerCase()) {
                    match = false;
                }
            }
            if (match && opcoes.campoSemantico) {
                if (!item.CAMPO_SEMANTICO || item.CAMPO_SEMANTICO.toLowerCase() !== opcoes.campoSemantico.toLowerCase()) {
                    match = false;
                }
            }

            return match;
        });
    }
}