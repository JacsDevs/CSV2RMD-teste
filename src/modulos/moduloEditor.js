import ValidadorDados from './validadorDados.js';

class ModuloEditor {
    constructor(gerenciadorDados) {
        this.db = gerenciadorDados;
        this.validador = new ValidadorDados(gerenciadorDados);
    }

    _desempacotar(valor) {
        return (valor || '').split('|').map(v => v.trim());
    }

    _empacotar(array) {
        return array.map(a => (a || '').trim()).filter(Boolean).join(' | ');
    }

    obterItemParaEdicao(indice) {
        if (!this.db.dadosPlanilha || !this.db.dadosPlanilha[indice]) return null;
        const item = this.db.dadosPlanilha[indice];

        // Desempacota Variações
        const vi = this._desempacotar(item.ITEM_LEXICAL);
        const va = this._desempacotar(item.ARQUIVO_SONORO);
        const vf = this._desempacotar(item.TRANSCRICAO_FONEMICA);
        const vt = this._desempacotar(item.TRANSCRICAO_FONETICA);
        const lenV = Math.max(vi.length, va.length, vf.length, vt.length, 1);

        const variacoes = [];
        for (let i = 0; i < lenV; i++) {
            variacoes.push({ item: vi[i] || '', audio: va[i] || '', fone: vf[i] || '', fonet: vt[i] || '' });
        }

        // Desempacota Exemplos
        const ea = this._desempacotar(item.ARQUIVO_SONORO_EXEMPLO);
        const es = this._desempacotar(item.TRANSCRICAO_EXEMPLO);
        const ed = this._desempacotar(item.TRADUCAO_EXEMPLO);
        const lenE = Math.max(ea.length, es.length, ed.length);

        const exemplos = [];
        for (let i = 0; i < lenE; i++) {
            if (ea[i] || es[i] || ed[i]) exemplos.push({ audio: ea[i] || '', trans: es[i] || '', trad: ed[i] || '' });
        }

        // Desempacota Imagens
        const im = this._desempacotar(item.IMAGEM);
        const il = this._desempacotar(item.LEGENDA_IMAGEM);
        const lenI = Math.max(im.length, il.length);

        const imagens = [];
        for (let i = 0; i < lenI; i++) {
            if (im[i] || il[i]) imagens.push({ img: im[i] || '', leg: il[i] || '' });
        }

        return {
            indice,
            camposBasicos: {
                CLASSE_GRAMATICAL: item.CLASSE_GRAMATICAL || '',
                CAMPO_SEMANTICO: item.CAMPO_SEMANTICO || '',
                SUB_CAMPO_SEMANTICO: item.SUB_CAMPO_SEMANTICO || '',
                TRADUCAO_SIGNIFICADO: item.TRADUCAO_SIGNIFICADO || '',
                ITENS_RELACIONADOS: item.ITENS_RELACIONADOS || '',
                DESCRICAO: item.DESCRICAO || '',
                ARQUIVO_VIDEO: item.ARQUIVO_VIDEO || ''
            },
            variacoes,
            exemplos,
            imagens
        };
    }

    salvarEdicao(indice, dadosEditados) {
        if (!this.db.dadosPlanilha || !this.db.dadosPlanilha[indice]) return { sucesso: false, erros: ['Índice não encontrado.'] };

        const errosValidacao = this.validador.validarEdicao(dadosEditados);
        if (errosValidacao.length > 0) {
            return { sucesso: false, erros: errosValidacao };
        }

        const { camposBasicos, variacoes, exemplos, imagens } = dadosEditados;

        const linhaAtualizada = {
            ...camposBasicos,
            ITEM_LEXICAL: this._empacotar(variacoes.map(v => v.item)),
            ARQUIVO_SONORO: this._empacotar(variacoes.map(v => v.audio)),
            TRANSCRICAO_FONEMICA: this._empacotar(variacoes.map(v => v.fone)),
            TRANSCRICAO_FONETICA: this._empacotar(variacoes.map(v => v.fonet)),
            ARQUIVO_SONORO_EXEMPLO: this._empacotar(exemplos.map(e => e.audio)),
            TRANSCRICAO_EXEMPLO: this._empacotar(exemplos.map(e => e.trans)),
            TRADUCAO_EXEMPLO: this._empacotar(exemplos.map(e => e.trad)),
            IMAGEM: this._empacotar(imagens.map(i => i.img)),
            LEGENDA_IMAGEM: this._empacotar(imagens.map(i => i.leg))
        };

        Object.assign(this.db.dadosPlanilha[indice], linhaAtualizada);
        
        if (this.db.opcoes && this.db.opcoes.autoConstruirBanco) {
            this.db._construirBanco();
        }
        
        return { sucesso: true, erros: [] };
    }
}
export default ModuloEditor;