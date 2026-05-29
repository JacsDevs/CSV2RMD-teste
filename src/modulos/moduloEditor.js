import ValidadorDados from './validadorDados.js';

class ModuloEditor {
    constructor(gerenciadorDados) {
        this.db = gerenciadorDados;
        this.validador = new ValidadorDados(gerenciadorDados);
    }

    obterItemParaEdicao(indice) {
        if (!this.db.dadosPlanilha || !this.db.dadosPlanilha[indice]) return null;
        // O dado já está normalizado no gerenciadorDados!
        return this.db.dadosPlanilha[indice];
    }

    salvarEdicao(indice, dadosEditados) {
        if (!this.db.dadosPlanilha || !this.db.dadosPlanilha[indice]) return { sucesso: false, erros: ['Índice não encontrado.'] };

        const errosValidacao = this.validador.validarEdicao(dadosEditados);
        if (errosValidacao.length > 0) {
            return { sucesso: false, erros: errosValidacao };
        }

        // Como o dado no núcleo já deve ser a árvore estruturada, basta atualizar o objeto diretamente
        this.db.dadosPlanilha[indice] = {
            indice,
            ...dadosEditados
        };
        
        // Reconstroi o banco com a nova arvore
        if (this.db._reconstruirBanco) {
            this.db._reconstruirBanco();
        }
        
        return { sucesso: true, erros: [] };
    }
}
export default ModuloEditor;