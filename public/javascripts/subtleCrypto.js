let encryptKey = { privateKey: null, publicKey: null };
let signKey = { privateKey: null, publicKey: null };

const wrap = { private: { salt: null, iv: null }, public: { salt: null, iv: null } };

/* Generate Key */
async function generateKey() {
    encryptKey = await window.crypto.subtle.generateKey({name: "RSA-OAEP", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, ["encrypt", "decrypt"]);

    const export_private_key = await window.crypto.subtle.exportKey("pkcs8", encryptKey.privateKey);
    signKey.privateKey = await window.crypto.subtle.importKey("pkcs8", export_private_key, { name: "RSA-PSS", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign"]);
    const export_public_key = await window.crypto.subtle.exportKey("spki", encryptKey.publicKey);
    signKey.publicKey = await window.crypto.subtle.importKey("spki", export_public_key, { name: "RSA-PSS", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["verify"]);
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
        let keyFormat = `-----BEGIN PUBLIC KEY-----\n${exported_pub_data}\n-----END PUBLIC KEY-----`;
        await downloadKey(keyFormat, "publicKey.pem");
        // Format 설정
        return {name: publicKeyName, data: keyFormat};
    }
}

/* Basic Export */
async function basicExport(type, key) {
    // Private or public key 여부에 따라 포맷을 다르게 적용
    let format = null;
    if (type === "private") {
        format = "pkcs8";
    } else {            // public
        format = "spki";
    }

    const convertedKey = await window.crypto.subtle.exportKey(format, key);
    const exportKeyString = String.fromCharCode.apply(null, new Uint8Array(convertedKey));
    return window.btoa(exportKeyString);
}

/* Import Private Key For Decrypt */
async function importPrivateKey(keyFile) {
    encryptKey.privateKey = await importKey("private", keyFile, "decrypt");
}

/* Basic Import */
async function importKey(type, rawBytes, usage) {
    let option = {
        format: null,
        header: null,
        footer: null,
    };

    if (type === "private") {
        option.format = "pkcs8";
        option.header = "-----BEGIN PRIVATE KEY-----";
        option.footer = "-----END PRIVATE KEY-----";
    } else {
        option.format = "spki";
        option.header = "-----BEGIN PUBLIC KEY-----";
        option.footer = "-----END PUBLIC KEY-----";
    }

    const bytes = rawBytes.substring(option.header.length, rawBytes.length - option.footer.length);         // Header와 Footer를 제외한 Key Data 추출
    // const binaryString = window.atob(bytes);                                                                // base64 로 디코딩
    const bufView = await stringToArrayBufferView(bytes);

    if (type === "private") {
        if (usage === "sign") {
            return window.crypto.subtle.importKey(option.format, bufView, {name: "RSA-PSS", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, [usage]);
        } else {
            return window.crypto.subtle.importKey(option.format, bufView, {name: "RSA-OAEP", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-1"}, true, [usage]);
        }
    } else {
        if (usage === "verify") {
            return window.crypto.subtle.importKey(option.format, bufView, {name: "RSA-PSS", hash: "SHA-256"}, true, [usage]);
        } else {
            return window.crypto.subtle.importKey(option.format, bufView, {name: "RSA-OAEP", hash: "SHA-256"}, true, [usage]);
        }
    }
}

/* Convert ArrayBuffer Into String */
async function arrayBufferToString(buf) {
    const str = String.fromCharCode.apply(null, new Uint8Array(buf));
    return window.btoa(str);
}

/* Convert Binary Into ArrayBuffer */
async function binaryToArrayBufferView(buf) {
    const ab = new ArrayBuffer(buf.length);
    const view = new Uint8Array(ab);
    for (let i=0; i<buf.length; i++) {
        view[i] = buf[i];
    }
    return ab;
}

/* Convert String Into ArrayBuffer */
async function stringToArrayBufferView(string) {
    const c = window.atob(string);
    const buf = new ArrayBuffer(c.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0; i < c.length; i++) {
        bufView[i] = c.charCodeAt(i);
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
        return await arrayBufferToString(sign);
    }
}

/* Decrypt */
async function decryptData(data) {
    const converted = await stringToArrayBufferView(data);

    try {
        const decrypted = await window.crypto.subtle.decrypt({name: "RSA-OAEP"}, encryptKey.privateKey, converted);
        const decryptedString = await arrayBufferToString(decrypted);
        return {result: true, message: window.atob(decryptedString)};
    } catch (err) {
        console.error(err);
        return {result: false, message: err};
    }
}