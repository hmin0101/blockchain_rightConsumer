const mysql = require('mysql2/promise');

module.exports = function () {
    return {
        init: function () {
            return mysql.createPool({
                host: "localhost",
                port: 3306,
                user: "root",
                password: "",
                database: "right_consumer"
            })
        },
        test_open: function (con) {
            con.getConnection(function (err) {
                if (err) {
                    console.error('mysql connection error :' + err);
                } else {
                    console.info('mysql is connected successfully.');
                }
            })
        }
    }
};