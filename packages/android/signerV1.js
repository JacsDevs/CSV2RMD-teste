// APK Signature Scheme v1 (JAR Signing).
// Gera MANIFEST.MF, CERT.SF e CERT.RSA (PKCS#7 SignedData) dentro de META-INF/.
// Web Crypto faz o hash SHA-256 e a assinatura RSA; node-forge monta o PKCS#7.

const te = new TextEncoder();

/**
 * Assina um AAB/APK (ZIP) com v1 (JAR signing).
 * @param {Uint8Array} zipBytes
 * @param {ArrayBuffer} privateKeyPkcs8
 * @param {string} certPem
 * @returns {Promise<Uint8Array>} ZIP com META-INF adicionado
 */
export async function assinarV1(zipBytes, privateKeyPkcs8, certPem) {
    const { unzipSync, zipSync, strToU8 } = await import(new URL('../../vendor/fflate.min.js', import.meta.url).href);
    const { default: forge } = await import(new URL('../../vendor/node-forge.min.js', import.meta.url).href);

    const arquivos = unzipSync(zipBytes);

    // Remove META-INF anterior
    for (const path of Object.keys(arquivos)) {
        if (path.startsWith('META-INF/')) delete arquivos[path];
    }

    // 1. Calcular SHA-256 de cada entrada (exceto META-INF/)
    const entradas = Object.entries(arquivos)
        .filter(([p]) => !p.startsWith('META-INF/'))
        .sort(([a], [b]) => a.localeCompare(b));

    const secoes = [];
    for (const [path, content] of entradas) {
        const bytes  = content instanceof Uint8Array ? content : content[0];
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const b64    = btoa(String.fromCharCode(...new Uint8Array(digest)));
        secoes.push(`Name: ${path}\r\nSHA-256-Digest: ${b64}\r\n\r\n`);
    }

    // 2. MANIFEST.MF
    const manifestHeader  = 'Manifest-Version: 1.0\r\nCreated-By: CSV2DMLI\r\n\r\n';
    const manifestContent = manifestHeader + secoes.join('');
    const manifestBytes   = te.encode(manifestContent);
    arquivos['META-INF/MANIFEST.MF'] = manifestBytes;

    // 3. CERT.SF
    const manifestDigest = await crypto.subtle.digest('SHA-256', manifestBytes);
    const manifestDigestB64 = btoa(String.fromCharCode(...new Uint8Array(manifestDigest)));

    let sfContent = 'Signature-Version: 1.0\r\nCreated-By: CSV2DMLI\r\n' +
        `SHA-256-Digest-Manifest: ${manifestDigestB64}\r\n\r\n`;

    for (const secao of secoes) {
        const sBytes  = te.encode(secao);
        const sDigest = await crypto.subtle.digest('SHA-256', sBytes);
        const sB64    = btoa(String.fromCharCode(...new Uint8Array(sDigest)));
        // Extract Name header from section
        const nameLine = secao.split('\r\n')[0];
        sfContent += `${nameLine}\r\nSHA-256-Digest: ${sB64}\r\n\r\n`;
    }

    const sfBytes = te.encode(sfContent);
    arquivos['META-INF/CERT.SF'] = sfBytes;

    // 4. Assinar CERT.SF com RSA-PKCS1v1.5 via Web Crypto
    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8', privateKeyPkcs8,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign']
    );
    const signature = new Uint8Array(
        await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, sfBytes)
    );

    // 5. Encapsular em PKCS#7 SignedData detachado com node-forge
    const cert = forge.pki.certificateFromPem(certPem);
    const p7   = forge.pkcs7.createSignedData();

    // Content is the SF file (though technically PKCS#7 SignedData can be detached)
    p7.content = forge.util.createBuffer(sfContent);
    p7.addCertificate(cert);

    // Add the signer with pre-computed signature (SHA256withRSA)
    p7.addSigner({
        key:         null,         // we supply the raw signature instead
        certificate: cert,
        digestAlgorithm: forge.pki.oids['sha256'],
        authenticatedAttributes: [
            { type: forge.pki.oids.contentType,         value: forge.pki.oids.data },
            { type: forge.pki.oids.signingTime,         value: new Date() },
            { type: forge.pki.oids.messageDigest,       value: '' },
        ],
    });

    // Manual approach: use forge to build a minimal PKCS#7 DER
    const certAsn1 = forge.pki.certificateToAsn1(cert);
    const signerInfo = buildSignerInfo(forge, cert, sfBytes, signature);
    const p7Asn1    = buildPkcs7Asn1(forge, certAsn1, signerInfo);
    const p7Der     = forge.asn1.toDer(p7Asn1).getBytes();
    const certRsa   = Uint8Array.from(p7Der, c => c.charCodeAt(0));

    arquivos['META-INF/CERT.RSA'] = certRsa;

    return zipSync(arquivos, { level: 0 });
}

// ─── PKCS#7 SignedData minimal builder ───────────────────────────────────────
// Builds a valid DER-encoded CMS SignedData without re-signing (uses pre-computed sig).

async function buildSignerInfo(forge, cert, sfBytes, signature) {
    // Compute SHA-256 of sfBytes for MessageDigest authenticated attribute
    const sfDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', sfBytes));
    const sfDigestB64 = btoa(String.fromCharCode(...sfDigest));
    const sfDigestHex = Array.from(sfDigest).map(b => b.toString(16).padStart(2, '0')).join('');

    const issuer  = cert.issuer;
    const serial  = forge.util.hexToBytes(cert.serialNumber);

    // Build authenticated attributes ASN.1
    const authAttrs = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
        // contentType = data
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
                forge.asn1.oidToDer(forge.pki.oids.contentType).getBytes()),
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [
                forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
                    forge.asn1.oidToDer(forge.pki.oids.data).getBytes()),
            ]),
        ]),
        // messageDigest
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
                forge.asn1.oidToDer(forge.pki.oids.messageDigest).getBytes()),
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [
                forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false,
                    forge.util.hexToBytes(sfDigestHex)),
            ]),
        ]),
    ]);

    return { authAttrs, signature, issuer, serial };
}

function buildPkcs7Asn1(forge, certAsn1, { authAttrs, signature, issuer, serial }) {
    const signerInfoSeq = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        // version = 1
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, '\x01'),
        // issuerAndSerialNumber
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
            forge.pki.distinguishedNameToAsn1(issuer),
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, serial),
        ]),
        // digestAlgorithm sha256
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
                forge.asn1.oidToDer('2.16.840.1.101.3.4.2.1').getBytes()),
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
        ]),
        // authenticatedAttributes [0] IMPLICIT
        authAttrs,
        // digestEncryptionAlgorithm rsaEncryption
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
                forge.asn1.oidToDer(forge.pki.oids.rsaEncryption).getBytes()),
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
        ]),
        // encryptedDigest (the actual RSA signature)
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false,
            forge.util.createBuffer(signature).getBytes()),
    ]);

    const signedData = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        // version
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, '\x01'),
        // digestAlgorithms
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
                forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
                    forge.asn1.oidToDer('2.16.840.1.101.3.4.2.1').getBytes()),
                forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
            ]),
        ]),
        // contentInfo (detached — empty octet string)
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
                forge.asn1.oidToDer(forge.pki.oids.data).getBytes()),
        ]),
        // certificates [0]
        forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [certAsn1]),
        // signerInfos
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [signerInfoSeq]),
    ]);

    // Wrap in ContentInfo
    return forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
            forge.asn1.oidToDer(forge.pki.oids.signedData).getBytes()),
        forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData]),
    ]);
}
