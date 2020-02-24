const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
// DB
const queryUser = require('../db/model/user');

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
    res.render('register-agreement', {userName: req.session.user.name});
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
    pw: await bcrypt.hash(info.pw, 8)
  };
  await res.json({result: true});
});

router.post('/register', async function(req, res) {
  const data = JSON.parse(req.body.data);

  // Save User Public Key
  fs.writeFile(path.join(__dirname, "../public/key/", data.publicKey.name), data.publicKey.data, function(err) {
    if (err) console.error(err);
  });
  // Insert User Data in Database
  await queryUser.register(req.session.temp, data.publicKey.name);
  // Create Object
  const obj = {
    user: {
      id: await bcrypt.hash(req.session.temp.id, 2),
      agreement: data.agreement,
      signature: data.signature
    },
    rightConsumer: {
      signature: "##"
    }
  };
  console.log(obj);

  const cipher = crypto.createCipher("aes192", "BBO");
  let result = cipher.update(JSON.stringify(obj), "utf8", "base64");
  result += cipher.final("base64");
  console.log("암호화: ");
  console.log(result);
  const decipher = crypto.createDecipher("aes192", "BBO");
  let result2 = decipher.update(result, "base64", "utf8");
  result2 += decipher.final("utf8");
  console.log("복호화: ");
  console.log(result2);

  // Destroy Session
  req.session.destroy();

  await res.json({result: true});
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

module.exports = router;
