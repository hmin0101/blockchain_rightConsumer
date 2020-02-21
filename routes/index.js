var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.redirect('/login');
});

/* Login Page */
router.get('/login', function(req, res) {
  res.render('login');
});

/* Register Page */
router.get('/register', function(req, res) {
  res.redirect('/register/step1');
});

router.get('/register/step1', function(req, res) {
  res.render('register-agreement');
});

router.get('/register/step2', function(req, res) {
  res.render('register');
});

router.post('/check/agreement', function(req, res) {
  const agreement = JSON.parse(req.body.agreement);
  console.log(agreement);
  res.json({result: true});
});

module.exports = router;
