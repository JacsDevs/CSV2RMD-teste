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
     * Gera e baixa o AAB assinado.
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
    async gerarAab(opcoes) {
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

        onProgress(5, 'Carregando template AAB…');
        const templateUrl = new URL('../../vendor/android/template.aab', import.meta.url).href;
        const templateResp = await fetch(templateUrl);
        if (!templateResp.ok) {
            throw new Error(
                'Template AAB não encontrado. Execute "npm run build:android-template" para gerar o template.'
            );
        }
        const templateBytes = new Uint8Array(await templateResp.arrayBuffer());

        onProgress(15, 'Carregando chave de assinatura…');
        const { privateKeyPkcs8, certPem, certDer } =
            await this.gerenteChave.carregarChave(senha);

        onProgress(25, 'Injetando conteúdo e patches…');
        const injector = new InjetorAab();
        let aabBytes = await injector.injetar(
            templateBytes,
            { htmlBytes, midias, iconeBytes },
            { packageName, appName, versionName, versionCode }
        );

        onProgress(55, 'Assinando (v1 — JAR signing)…');
        aabBytes = await assinarV1(aabBytes, privateKeyPkcs8, certPem);

        onProgress(75, 'Assinando (v2 — APK Signing Block)…');
        aabBytes = await assinarV2(aabBytes, privateKeyPkcs8, certDer);

        onProgress(95, 'Salvando arquivo…');
        const nomeArquivo = `${appName.replace(/[^a-zA-Z0-9_\-]/g, '_')}.aab`;
        const blob = new Blob([aabBytes], { type: 'application/octet-stream' });
        await platform.salvarArquivo(nomeArquivo, blob);

        onProgress(100, 'Concluído!');
        return nomeArquivo;
    }
}
