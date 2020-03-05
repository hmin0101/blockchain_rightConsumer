const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const randomString = require('randomstring');
// const trustProvider = require('socket.io-client')("http://52.79.182.164:3000");
const io = require('socket.io-client');
// DB
const queryUser = require('../db/model/user');
const queryAgreement = require('../db/model/agreement');

const RIGHT_CONSUMER_NAME = "rightConsumer";
const TRUST_PROVIDER_IP = "http://143.248.95.28:3000";
// Socket.io-client
const trustProvider = io(TRUST_PROVIDER_IP);

// Init Agreement
let agreementList = [];
(async function initAgreement() {
  const result = await queryAgreement.list();
  if (result.result) {
    for (const elem of result.message) {
      agreementList.push({
        clause: elem.clause,
        principle: elem.principle,
        content: elem.content
      });
    }
    console.info("Successfully select agreement list");
  } else {
    console.error("Select agreement list error: " + result.message);
  }
})();

 /* Root */
router.get('/', function(req, res) {
  if (req.session.user !== null && req.session.user !== undefined) {
    res.redirect('/home');
  } else {
    res.redirect('/login');
  }
});

/* GET home page. */
router.get('/home', function(req, res) {
  if (req.session.user !== null && req.session.user !== undefined) {
    res.render('confirm-saveInfo');
  } else {
    res.redirect('/login');
  }
});

/* Login Page */
router.get('/login', function(req, res) {
  if (req.session.user !== null && req.session.user !== undefined) {

  } else {
    res.render('login');
  }
});

router.post('/login', async function(req, res) {
  const info = JSON.parse(req.body.info);
  const result = await queryUser.login(info.id);
  if (result.result && result.message.length > 0) {
    const compare = await bcrypt.compareSync(info.pw, result.message[0].password);
    if (compare) {
      req.session.user = {
        uuid: result.message[0].user_id,
        name: result.message[0].name,
        id: result.message[0].id,
      };

      await res.json({result: true});
    } else {
      await res.json({result: false, message: "아이디 또는 비밀번호가 올바르지 않습니다"});
    }
  } else {
    await res.json({result: false, message: "아이디 또는 비밀번호가 올바르지 않습니다."});
  }
});

/* Logout */
router.post('/logout', function(req, res) {
  if (req.session.user !== null && req.session.user !== undefined) {
    req.session.destroy();
  }
  res.json({result: true});
});

/* Register Page */
router.get('/register', function(req, res) {
  if (req.session.user !== null && req.session.user !== undefined) {
    res.redirect('/');
  } else {
    res.render('register');
  }
});

router.get('/register/step1', function(req, res) {
  if (req.session.user !== null && req.session.user !== undefined) {
    res.redirect('/');
  } else {
    res.render('register');
  }
});

router.get('/register/step2', function(req, res) {
  if (req.session.temp === null || req.session.temp === undefined) {
    res.redirect('/register/step1');
  } else {
    res.render('agreement', { type: "register", userName: req.session.temp.name, agreementList: agreementList });
  }
});

router.get('/username', function(req, res) {
  if (req.session.temp === null || req.session.temp === undefined) {
    res.json({result: false});
  } else {
    res.json({result: true, name: req.session.user.name});
  }
});

router.post('/check/duplication', async function(req, res) {
  const userId = req.body.userId;
  const result = await queryUser.confirmDuplication(userId);
  await res.json(result);
});

router.post('/register/info', async function(req, res) {
  const info = JSON.parse(req.body.info);
  req.session.temp = {
    name: info.name,
    id: info.id,
    pw: await bcrypt.hash(info.pw, 8),
  };
  await res.json({result: true});
});

router.post('/register', async function(req, res) {
  console.log(decodeURIComponent(req.body.data));
  const data = JSON.parse(decodeURIComponent(req.body.data));

  // Save in Session
  req.session.temp.publicKey = {
    name: data.publicKey.name,
    data: data.publicKey.data
  };

  // Create Encrypted Data
  const encrypted = await encryptDataForSaveBlockchain(data, req.session.temp.id);
  req.session.temp.block = {};
  req.session.temp.block.b_key = encrypted.b_key;

  // Save User Public Key
  fs.writeFile(path.join(__dirname, "../public/key/", req.session.temp.publicKey.name), req.session.temp.publicKey.data, function(err) {
    if (err) console.error(err);
  });

  // 블록체인에 저장하기 위해서 암호화한 데이터를 Trust-Provider 로 송신
  trustProvider.emit("register", encrypted.data);
  trustProvider.on("register", async function(result) {
    if (result) {
      req.session.temp.block.blockID = result.blockNum;
      req.session.temp.block.txID = result.txId;

      // Insert User Data in Database
      const registerResult = await queryUser.register(req.session.temp, req.session.temp.publicKey.name);
      // Insert Block Info in Database
      await queryUser.saveBlockInfo(registerResult.insertId, req.session.temp.block);

      // // Encrypt Block Info
      // const encrypted = encryptPublicKey(req.session.temp.publicKey.name, JSON.stringify(req.session.temp.block));
      await res.json({result: true, message: "[회원가입 완료]\r\n로그인한 후, 동의 내역이 저장된 Block 정보를 조회할 수 있습니다."});

      // Destroy Session
      req.session.temp = null;
    } else {
      await res.json({result: false, message: "블록 생성에 실패하였습니다."});
    }
  });
});

// Search Agreement
router.post('/search/block/info', async function(req, res) {
  // block key를 받아오고
  // 블록체인에서 찾을 block ID값을 조회
  const result = await queryUser.searchBlockId(req.session.user.uuid);
  if (result.result && result.message.length > 0) {
    const blockInfo = {
      blockNum: result.message[0].block_num,
      txID: result.message[0].tx_id,
      b_key: result.message[0].b_key
    };

    const searchPublicKeyResult = await queryUser.searchPublicKey(req.session.user.uuid);
    if (searchPublicKeyResult && searchPublicKeyResult.message.length > 0) {
      const encrypted = await encryptPublicKey(searchPublicKeyResult.message[0].key_name, JSON.stringify(blockInfo));
      await res.json({ result: true, info: encrypted.toString("base64") });
    } else {
      await res.json({ result: false, message: "등록된 Public Key가 없습니다.\r\n Key부터 등록해주세요." });
    }
  } else {
    await res.json({ result: false, message: "조회가능한 Block ID가 없습니다." });
  }
});

/* Block 조회를 위해 Trust Provider 에게 제공할 정보를 생성 */
router.post('/create/metadata', function(req, res) {
  // Hash User Id
  const hash = crypto.createHash("sha512");
  hash.update(req.session.user.id);
  const hashed = hash.digest("base64");

  res.json(TRUST_PROVIDER_IP+"/search/rc?rc=" + encodeURIComponent(RIGHT_CONSUMER_NAME) + "&user=" + encodeURIComponent(hashed));
});

/* Update Page */
router.get('/update/agreement', function(req, res) {
  if (req.session.user === null || req.session.user === undefined) {
    res.redirect('/login');
  } else {
    res.render('agreement', { type: "update", userName: req.session.user.name, agreementList: agreementList });
  }
});

router.post('/update/agreement', async function(req, res) {
  const data = JSON.parse(decodeURIComponent(req.body.data));

  // Create Encrypted Data
  const encrypted = await encryptDataForSaveBlockchain(data, req.session.user.id);
  req.session.block = {};
  req.session.block.b_key = encrypted.b_key;

  // 블록체인에 저장하기 위해서 암호화한 데이터를 Trust-Provider 로 송신
  trustProvider.emit("register", encrypted.data);
  trustProvider.on("register", async function(result) {
    if (result) {
      req.session.block.blockID = result.blockNum;
      req.session.block.txID = result.txId;

      // Insert Block Info in Database
      await queryUser.updateBlockInfo(req.session.user.uuid, req.session.block);
      await res.json({result: true, message: "[약관 동의 완료]\r\n새롭게 갱신되어 동의 내역이 저장된 Block 정보를 조회할 수 있습니다."});

      // Destroy Session
      req.session.temp = null;
    } else {
      await res.json({result: false, message: "블록 생성에 실패하였습니다."});
    }
  });
});

// router.get('/test/key', async function(req, res) {
//   const signature = sign();
//   const result = verify(signature);
//
//   res.send(result);
// });

/* 블록체인에 데이터를 저장하기 위해 암호화 작업을 진행 (스마트 컨트렉트 포맷에 맞춤) */
async function encryptDataForSaveBlockchain(data, userId) {
  // Create Object For Encrypt
  const obj = {
    user: {
      id: userId,
      agreement: {},
      signature: data.signature
    },
    rightConsumer: {
      name: RIGHT_CONSUMER_NAME,
      signature: await sign()
    }
  };

  // Match Agreement
  for (let i=0; i<agreementList.length; i++) {
    obj.user.agreement[i] = {
      principle: agreementList[i].principle,
      content: agreementList[i].content,
      state: data.agreement[i]
    };
  }

  // Generate Random Block Key
  const b_key = randomString.generate(15);
  // Block Key 를 이용하여 데이터 암호화
  const cipher = crypto.createCipher("aes192", b_key);
  let encData = cipher.update(JSON.stringify(obj), "utf8", "base64");
  encData += cipher.final("base64");

  // Search Prev Block Num
  let prevBlockNum = null;
  const result = await queryUser.searchBlockId(userId);
  if (result.result && result.message.length > 0) {
    prevBlockNum = result.message[0].block_num;
  }

  // Hash User Id
  const hash = crypto.createHash("sha512");
  hash.update(userId);
  const hashed = hash.digest("base64");
  // Create Object For Send
  const sendData = {
    userId: hashed,
    rightConsumer: RIGHT_CONSUMER_NAME,
    encryptedData: encData,
    regTime: getDateStr(),
    prevBlockNum: prevBlockNum
  };

  return { b_key: b_key, data: sendData };
}

/* Create Date String */
function getDateStr() {
  const date = new Date();
  return date.getFullYear() + "-" + ((date.getMonth()+1) < 10 ? "0"+(date.getMonth()+1) : (date.getMonth()+1)) + "-" + (date.getDate() < 10 ? "0"+date.getDate() : date.getDate()) + " " + (date.getHours() < 10 ? "0"+date.getHours() : date.getHours()) + ":" + (date.getMinutes() < 10 ? "0"+date.getMinutes() : date.getMinutes());
}

/* 사용자의 Public Key를 이용하여 B_key 및 Block 정보 암호화 */
function encryptPublicKey(keyName, data) {
  const filePath = path.join(__dirname, "../public/key/", keyName);
  const keyFile = fs.readFileSync(filePath, {encoding: "utf8"});
  const publicKey = crypto.createPublicKey(keyFile);
  const buf = Buffer.from(data);

  return crypto.publicEncrypt(publicKey, buf);
}

async function decryptPrivateKey(keyData, data) {
  const privateKey = crypto.createPrivateKey(keyData);
  const buf = Buffer.from(data, "base64");

  return crypto.privateDecrypt(privateKey, buf);
}

/* Create Right Consumer Signature */
async function sign() {
  const keyFile = fs.readFileSync(path.join(__dirname, "../bin/keys/private.pem"), {encoding: "utf8"});
  const privateKey = crypto.createPrivateKey(keyFile);

  const sign = crypto.createSign("sha512");
  sign.update(RIGHT_CONSUMER_NAME);
  return sign.sign(privateKey, "base64");
}

/* Verify Right Consumer Signature */
async function verify(signature) {
  const keyFile = fs.readFileSync(path.join(__dirname, "../bin/keys/public.pem"), {encoding: "utf8"});
  const publicKey = crypto.createPublicKey(keyFile);

  const verify = crypto.createVerify("sha512");
  verify.update(RIGHT_CONSUMER_NAME);
  return verify.verify(publicKey, signature, "base64");
}

module.exports = router;
