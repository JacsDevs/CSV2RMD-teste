// Orquestrador de geração de AAB 100% no browser.
// Coordena: carregamento do template, injeção de conteúdo, AXML patching,
// assinatura v1 + v2 e download do arquivo final.

import { GerenteChave } from './gerenteChave.js';
import { InjetorAab }   from './injetorAab.js';
import { assinarV1 }    from './signerV1.js';
import { assinarV2 }    from './signerV2.js';
import { platform }     from '../platform/index.js';

export class ExportadorAndroid {
    constructor() {
        this.gerenteChave = new GerenteChave();
    }

    async obterInfoChave() {
        return this.gerenteChave.obterInfoChave();
    }

    async temChaveSalva() {
        return this.gerenteChave.temChaveSalva();
    }

    async gerarNovaChave(senha, metadados) {
        return this.gerenteChave.gerarNovaChave(senha, metadados);
    }

    async exportarP12(senha) {
        return this.gerenteChave.exportarP12(senha);
    }

    async importarP12(arquivo, senha) {
        return this.gerenteChave.importarP12(arquivo, senha);
    }

    async deletarChave() {
        return this.gerenteChave.deletarChave();
    }

    /**
     * Gera e baixa o AAB e o APK assinados.
     *
     * @param {{
     *   senha: string,
     *   htmlBytes: Uint8Array,
     *   midias: Map<string, Uint8Array>,
     *   iconeBytes: Uint8Array,
     *   packageName: string,
     *   appName: string,
     *   versionName: string,
     *   versionCode: number,
     *   onProgress?: (pct: number, msg: string) => void,
     * }} opcoes
     */
    async gerarAmbos(opcoes) {
        const {
            senha,
            htmlBytes,
            midias,
            iconeBytes,
            packageName,
            appName,
            versionName,
            versionCode,
            onProgress = () => {},
        } = opcoes;

        onProgress(5, 'Carregando templates (AAB e APK)…');
        const templateUrlAab = new URL('../../vendor/android/template.aab', import.meta.url).href;
        const templateUrlApk = new URL('../../vendor/android/template.apk', import.meta.url).href;
        
        const [templateRespAab, templateRespApk] = await Promise.all([
            fetch(templateUrlAab),
            fetch(templateUrlApk)
        ]);

        if (!templateRespAab.ok || !templateRespApk.ok) {
            throw new Error(
                'Template AAB ou APK não encontrado. Execute "npm run build:android-template" para gerar os templates.'
            );
        }
        
        const templateBytesAab = new Uint8Array(await templateRespAab.arrayBuffer());
        const templateBytesApk = new Uint8Array(await templateRespApk.arrayBuffer());

        onProgress(15, 'Carregando chave de assinatura…');
        const { privateKeyPkcs8, certPem, certDer } =
            await this.gerenteChave.carregarChave(senha);

        const injector = new InjetorAab();
        const appInfo = { htmlBytes, midias, iconeBytes };
        const metaInfo = { packageName, appName, versionName, versionCode };

        // ---- Processar AAB ----
        onProgress(25, 'Injetando conteúdo no AAB…');
        let aabBytes = await injector.injetar(templateBytesAab, appInfo, metaInfo, false);

        onProgress(40, 'Assinando AAB (v1 e v2)…');
        aabBytes = await assinarV1(aabBytes, privateKeyPkcs8, certPem);
        aabBytes = await assinarV2(aabBytes, privateKeyPkcs8, certDer);

        // ---- Processar APK ----
        onProgress(55, 'Injetando conteúdo no APK…');
        let apkBytes = await injector.injetar(templateBytesApk, appInfo, metaInfo, true);

        onProgress(70, 'Assinando APK (v1 e v2)…');
        apkBytes = await assinarV1(apkBytes, privateKeyPkcs8, certPem);
        apkBytes = await assinarV2(apkBytes, privateKeyPkcs8, certDer);

        onProgress(85, 'Salvando arquivos…');
        const baseName = appName.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const nomeAab = `${baseName}.aab`;
        const nomeApk = `${baseName}.apk`;

        const blobAab = new Blob([aabBytes], { type: 'application/octet-stream' });
        await platform.salvarArquivo(nomeAab, blobAab);
        
        const blobApk = new Blob([apkBytes], { type: 'application/octet-stream' });
        await platform.salvarArquivo(nomeApk, blobApk);

        onProgress(100, 'Concluído!');
        return { aab: nomeAab, apk: nomeApk };
    }
}
