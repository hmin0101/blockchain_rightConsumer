let encryptKey = null;
let signKey = { privateKey: null, publicKey: null };

const wrap = { private: { salt: null, iv: null }, public: { salt: null, iv: null } };

/* Generate Key */
async function generateKey() {
    encryptKey = await window.crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-512" }, true, ["encrypt", "decrypt"]);

    const export_private_key = await window.crypto.subtle.exportKey("pkcs8", encryptKey.privateKey);
    signKey.privateKey = await window.crypto.subtle.importKey("pkcs8", export_private_key, { name: "RSA-PSS", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-512" }, true, ["sign"]);
    const export_public_key = await window.crypto.subtle.exportKey("spki", encryptKey.publicKey);
    signKey.publicKey = await window.crypto.subtle.importKey("spki", export_public_key, { name: "RSA-PSS", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-512" }, true, ["verify"]);
}

/* Export Private Key */
async function exportPrivateKey() {
    if (encryptKey === null) {
        console.error("[Error]\nNot found key to Export.");
    } else {
        const exported_pri_data = await basicExport("private", encryptKey.privateKey);
        let keyFormat = `-----BEGIN PRIVATE KEY-----\n${exported_pri_data}\n-----END PRIVATE KEY-----`;
        await downloadKey(keyFormat, "privateKey.pem");
    }
}

/* Export Private Key */
async function exportPublicKey() {
    if (encryptKey === null) {
        console.error("[Error]\nNot found key to Export.");
    } else {
        const publicKeyName = Date.now() + "_publicKey.pem";
        let exported_pub_data = await basicExport("public", encryptKey.publicKey);
        let keyFormat = `-----BEGIN CERTIFICATE-----\n${exported_pub_data}\n-----END CERTIFICATE-----`;
        await downloadKey(keyFormat, "publicKey.pem");
        // Format 설정
        return {name: publicKeyName, data: keyFormat};
    }
}

/* Export key */
async function exportKey() {
    if (encryptKey === null) {
        alert("[Error]\nNot found key to Export.");
    } else {
        // Input user password
        const password = await window.prompt("Enter your password");
        if (password === "") {
            await exportKey();
        } else if (password === null) {
            alert("Pair Key 생성이 취소되었습니다.");
        } else {
            const enc_password = new TextEncoder().encode(password);

            // Wrapping private key
            const exported_pri = await wrappingExport("private", encryptKey.privateKey, enc_password);
            const exported_pri_data = await binaryToArrayBuffer(exported_pri);
            let keyFormat = `-----BEGIN WRAPPING PRIVATE KEY-----\n${exported_pri_data}\n-----END WRAPPING PRIVATE KEY-----`;
            // Download key
            await downloadKey(keyFormat, "privateKey.enc");

            // Wrapping public key
            // const exported_pub = await wrappingExport("public", encryptKey.publicKey, enc_password);
            // const exported_pub_data = await binaryToArrayBuffer(exported_pub);
            // keyFormat = `-----BEGIN WRAPPING PUBLIC KEY-----\n${exported_pub_data}\n-----END WRAPPING PUBLIC KEY-----`;
            // Download key
            // await downloadKey(keyFormat, "publicKey.enc");
        }
    }
}

/* Wrapping Export */
async function wrappingExport(type, key, enc_pw) {
    // Private or public key 여부에 따라 포맷을 다르게 적용
    let format = null;
    if (type === "private") {
        format = "pkcs8";
    } else {
        format = "spki";
    }

    // User Password를 기반으로 Wrapping Key 생성을 위한 대칭 Key 생성
    const keyMaterial = await window.crypto.subtle.importKey("raw", enc_pw, { name: "PBKDF2" }, false, ["deriveKey"]);
    wrap[type].salt = window.crypto.getRandomValues(new Uint8Array(16));                                  // 16자리 랜덤 데이터 생성
    // User Password를 기반으로 생성한 대칭 Key와 랜덤 데이터를 이용하여 Wrapping Key 생성
    const wrappingKey = await window.crypto.subtle.deriveKey({ name: "PBKDF2", salt: wrap[type].salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, { name: "AES-GCM", length: 256 }, false, ["wrapKey"]);
    wrap[type].iv = window.crypto.getRandomValues(new Uint8Array(16));                                    // 16자리 랜덤 데이터 생성

    // 암호화된 Key 반환
    return window.crypto.subtle.wrapKey(format, key, wrappingKey, { name: "AES-GCM", iv: wrap[type].iv });
}

/* Basic Export */
async function basicExport(type, key) {
    // Private or public key 여부에 따라 포맷을 다르게 적용
    let format = null;
    if (type === "private") {
        format = "pkcs8";
    } else {
        format = "spki";
    }

    const convertedKey = await window.crypto.subtle.exportKey(format, key);
    const exportKeyString = String.fromCharCode.apply(null, new Uint8Array(convertedKey));
    // return window.btoa(exportKeyString);
    const encBase64 = window.btoa(exportKeyString);

    let c = "";
    for (let i=0; i<encBase64.length; i++) {
        c += encBase64[i];
        if ((i+1) !== 1 && (i+1)%64 === 0) {
            c += "\r\n";
        }
    }
    return c;
}

/* Unwrapping key */
async function unWrappingCryptoKey(type, rawBytes, usage, enc_pw) {
    let format = null;
    let algorithm = null;

    let header = null;
    let footer = null;

    // Key Type에 따라 다른 Format 적용
    if (type === "private") {
        format = "pkcs8";
        header = "-----BEGIN WRAPPING PRIVATE KEY-----";
        footer = "-----END WRAPPING PRIVATE KEY-----";
    } else {
        format = "spki";
        header = "-----BEGIN WRAPPING PUBLIC KEY-----";
        footer = "-----END WRAPPING PUBLIC KEY-----";
    }

    // 사용 목적에 따라 다른 알고리즘 적용
    if (usage === "sign" || usage === "verify") {
        algorithm = { name: "RSA-PSS", hash: "SHA-512" };
    } else if (usage === "encrypt" || usage === "decrypt") {
        algorithm = { name: "RSA-OAEP", hash: "SHA-512" };
    }

    // Load한 파일에서 Key Data 추출
    const buf = await extractKeyData(type, rawBytes);
    // User Password를 기반으로 Unwrapping Key 생성을 위한 대칭 Key 생성
    const keyMaterial = await window.crypto.subtle.importKey("raw", enc_pw, { name: "PBKDF2" }, false, ["deriveKey"]);
    // User Password를 기반으로 생성한 대칭 Key와 Wrapping Key 생성에 사용되었던 Salt(랜덤데이터)를 이용하여 Unwrapping Key 생성
    const unWrappingKey = await window.crypto.subtle.deriveKey({ name: "PBKDF2", salt: wrap[type].salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, { name: "AES-GCM", length: 256 }, false, ["unwrapKey"]);
    // 복호화된 Key 반환
    return window.crypto.subtle.unwrapKey(format, buf, unWrappingKey, { name: "AES-GCM", iv: wrap[type].iv }, algorithm, true, [usage]);
}

/* Convert ArrayBuffer Into Binary */
async function binaryToArrayBuffer(buf) {
    const str = String.fromCharCode.apply(null, new Uint8Array(buf));
    return window.btoa(str);
}

/* Convert String Into Binary */
async function binaryToString(string) {
    const buf = new ArrayBuffer(string.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0; i < string.length; i++) {
        bufView[i] = string.charCodeAt(i);
    }
    return bufView;
}

/* Download key */
function downloadKey(data, fileName) {
    const blob = new Blob([data], { type: "application/octet-stream" });
    const link = document.createElement("a");

    link.href = window.URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
}

/* Sign */
async function createSignature(name) {
    if (signKey.publicKey === null) {
        alert("[Error]\nNot found key for sign.");
    } else {
        const enc_data = new TextEncoder().encode(name);
        const sign = await window.crypto.subtle.sign({ name: "RSA-PSS", saltLength: 8 }, signKey.privateKey, enc_data);
        return await binaryToArrayBuffer(sign);
    }
}
