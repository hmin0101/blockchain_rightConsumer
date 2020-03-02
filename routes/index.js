const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const randomString = require('randomstring');
const trustProvider = require('socket.io-client')("http://52.79.182.164:3000");
// DB
const queryUser = require('../db/model/user');
const queryAgreement = require('../db/model/agreement');
//
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
router.get('/', function(req, res, next) {
  if (req.session.user !== null && req.session.user !== undefined) {
    res.redirect('/home');
  } else {
    res.redirect('/login');
  }
});

/* GET home page. */
router.get('/home', function(req, res) {
  if (req.session.user !== null && req.session.user !== undefined) {
    res.render('main-user');
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
  if (result.result) {
    console.log(result.message);
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

  } else {
    res.render('register');
  }
});

router.get('/register/step1', function(req, res) {
  if (req.session.user !== null && req.session.user !== undefined) {

  } else {
    res.render('register');
  }
});

router.get('/register/step2', function(req, res) {
  if (req.session.temp === null || req.session.temp === undefined) {
    res.redirect('/register/step1');
  } else {
    res.render('register-agreement', {userName: req.session.temp.name, agreementList: agreementList});
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
  console.log("after");
  console.log(req.session.temp.publicKey.data);

  // Create Object
  const obj = {
    user: {
      id: await bcrypt.hash(req.session.temp.id, 2),
      agreement: {},
      signature: data.signature
    },
    rightConsumer: {
      name: "rightConsumer name",
      signature: "###"
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
  req.session.temp.block = {};
  req.session.temp.block.b_key = randomString.generate(15);
  // Block Key 를 이용하여 데이터 암호화
  const cipher = crypto.createCipher("aes192", req.session.temp.block.b_key);
  let encData = cipher.update(JSON.stringify(obj), "utf8", "base64");
  encData += cipher.final("base64");

  const sendData = {
    userId: await bcrypt.hash(req.session.temp.id, 2),
    rightConsumer: "rightConsumer name",
    encryptedData: encData,
    regTime: getDateStr()
  };

  // Save User Public Key
  fs.writeFile(path.join(__dirname, "../public/key/", req.session.temp.publicKey.name), req.session.temp.publicKey.data, function(err) {
    if (err) console.error(err);
  });

  // 블록체인에 저장하기 위해서 암호화한 데이터를 Trust-Provider 로 송신
  trustProvider.emit("register", sendData);
  trustProvider.on("register", async function(result) {
    if (result) {
      req.session.temp.block.blockID = result.blockNum;
      req.session.temp.block.txID = result.txId;

      // Insert User Data in Database
      const registerResult = await queryUser.register(req.session.temp, req.session.temp.publicKey.name);
      // Insert Block Info in Database
      await queryUser.saveBlockInfo(registerResult.message.insertId, req.session.temp.block);

      // // Encrypt Block Info
      // const publicKey = fs.readFileSync(path.join(__dirname, "../public/key/", req.session.temp.publicKey.name));
      // const buf = Buffer.from(JSON.stringify(req.session.temp.block));
      // const encrypted = crypto.publicEncrypt(publicKey, buf);
      const encrypted = encryptPublicKey(req.session.temp.publicKey.name, JSON.stringify(req.session.temp.block));

      await res.json({result: true, info: req.session.temp.block});
    } else {
      await res.json({result: false, message: "블록 생성에 실패하였습니다."});
    }

    // Destroy Session
    // req.session.destroy();
  });

  // 저장 결과 확인 후, Block Info 저장 (Info 저장 후, Block Key 저장)


  // const decipher = crypto.createDecipher("aes192", b_key);
  // let result2 = decipher.update(result, "base64", "utf8");
  // result2 += decipher.final("utf8");
  // console.log("복호화: ");
  // console.log(result2);
});

router.post('/register/process', async function(req, res) {

});

router.post('/register/fail', function(req, res) {
  res.json({result: false});
});

// router.post('/register/wait', function(req, res) {
//   if (req.session.temp !== null && req.session.temp !== undefined) {
//     while(req.session.temp.wait) {
//       console.log(req.session.temp.wait);
//     }
//     console.log(req.session.temp.block);
//     res.json({result: true});
//   } else {
//     res.json({result: false});
//   }
// });

router.post('/test/key', function(req, res) {
  const data = JSON.parse(req.body.data);
  // public key 데이터의 @ 를 + 로 재변환
  const reConverted = data.publicKey.data.replace(/@/g, "+");
  // Save in Session
  req.session.temp.publicKey = {
    name: data.publicKey.name,
    data: reConverted
  };

  const publicKey = {
    name: data.publicKey.name,
    data: decodeURIComponent(data.publicKey.data)
  };

  const filePath = path.join(__dirname, "../public/key/", req.session.temp.publicKey.name);
  fs.writeFileSync(filePath, publicKey.data);

  const spublicKey = fs.readFileSync(path.join(__dirname, "../public/key/", req.session.temp.publicKey.name), "base64");
  console.log(spublicKey.toString());
});

// Search Agreement
router.post('/search/agreement', async function(req, res) {
  // block key를 받아오고
  // 블록체인에서 찾을 block ID값을 조회
  const result = await queryUser.searchBlockId(req.session.user.uuid);
  if (result.result) {
    const blockID = result.message[0].block_id;

  } else {
    await res.json({result: false, message: "조회가능한 Block ID가 없습니다."});
  }
});

function getDateStr() {
  const date = new Date();
  return date.getFullYear() + "-" + ((date.getMonth()+1) < 10 ? "0"+(date.getMonth()+1) : (date.getMonth()+1)) + "-" + (date.getDate() < 10 ? "0"+date.getDate() : date.getDate()) + " " + (date.getHours() < 10 ? "0"+date.getHours() : date.getHours()) + ":" + (date.getMinutes() < 10 ? "0"+date.getMinutes() : date.getMinutes());
}

function encryptPublicKey(keyName, data) {
  const filePath = path.join(__dirname, "../public/key/", keyName);
  const keyFile = fs.readFileSync(filePath, {encoding: "utf8"});
  const publicKey = crypto.createPublicKey(keyFile);
  const buf = Buffer.from(data);
  console.log(filePath);
  console.log(publicKey.toString());

  return crypto.publicEncrypt(publicKey.toString(), buf);
}

module.exports = router;
