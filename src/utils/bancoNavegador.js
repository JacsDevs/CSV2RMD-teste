/**
 * Utilitário para gerenciar o IndexedDB de forma nativa e assíncrona.
 * Permite armazenar Blobs/Files grandes (como áudios e vídeos) de forma persistente,
 * sem depender do localStorage que possui limites rígidos de tamanho (5MB).
 */

class BancoNavegador {
    constructor(nomeBanco = 'DicionarioLexicalDB', versao = 1) {
        this.nomeBanco = nomeBanco;
        this.versao = versao;
        this.db = null;
    }

    /**
     * Inicializa o banco de dados e cria a store 'midias' se não existir.
     * @returns {Promise<IDBDatabase>}
     */
    async inicializar() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.nomeBanco, this.versao);

            request.onerror = (evento) => {
                console.error("Erro ao abrir IndexedDB:", evento.target.error);
                reject(evento.target.error);
            };

            request.onsuccess = (evento) => {
                this.db = evento.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (evento) => {
                const db = evento.target.result;
                // Cria o store (tabela) principal
                if (!db.objectStoreNames.contains('midias')) {
                    db.createObjectStore('midias');
                }
                if (!db.objectStoreNames.contains('metadados')) {
                    db.createObjectStore('metadados');
                }
            };
        });
    }

    /**
     * Armazena um valor na store especificada.
     * @param {string} storeName - Nome da store ('midias' ou 'metadados')
     * @param {string} key - Chave do arquivo/metadado
     * @param {any} value - Valor a ser armazenado (File, Blob, Object, etc)
     * @returns {Promise<void>}
     */
    async set(storeName, key, value) {
        await this.inicializar();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(value, key);

            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Recupera um valor da store especificada.
     * @param {string} storeName - Nome da store ('midias' ou 'metadados')
     * @param {string} key - Chave do arquivo/metadado
     * @returns {Promise<any>}
     */
    async get(storeName, key) {
        await this.inicializar();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Remove um valor da store.
     * @param {string} storeName - Nome da store
     * @param {string} key - Chave do arquivo/metadado
     * @returns {Promise<void>}
     */
    async delete(storeName, key) {
        await this.inicializar();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Retorna todas as chaves de uma store.
     * @param {string} storeName - Nome da store
     * @returns {Promise<string[]>}
     */
    async keys(storeName) {
        await this.inicializar();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAllKeys();

            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Limpa completamente uma store.
     * @param {string} storeName - Nome da store
     * @returns {Promise<void>}
     */
    async clear(storeName) {
        await this.inicializar();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }
}

// Exporta uma instância única (Singleton) para a aplicação
const bancoLocal = new BancoNavegador();
export default bancoLocal;
