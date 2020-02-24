const mysql_dbc = require("./db_config")();
const mysql = mysql_dbc.init();
mysql_dbc.test_open(mysql);

exports.asyncQuery = async (query) => {

    try {

        const connection = await mysql.getConnection();

        try {
            await connection.beginTransaction(); // START TRANSACTION
            const [rows] = await connection.query(query);
            await connection.commit(); // COMMIT
            connection.release();
            return {result: true, message: rows};
        } catch(err) {
            await connection.rollback(); // ROLLBACK
            connection.release();
            return {result: false, message: err.message};
        }

    } catch(err) {
        return {result: false, message: err.message};
    }

};

exports.asyncSelect = async (query) => {

    try {

        const connection = await mysql.getConnection();

        try {
            const [rows] = await connection.query(query);
            connection.release();
            return {result: true, message: rows};
        } catch(err) {
            connection.release();
            return {result:false, message: err.message};
        }

    } catch(err) {
        return {result:false, message:err.message};
    }

};

exports.asyncBulk = async (query, bulk) => {

    try {

        const connection = await mysql.getConnection();

        try {
            const [rows] = await connection.query(query, [bulk]);
            connection.release();
            return {result: true, message: rows};
        } catch(err) {
            connection.release();
            return {result:false, message: err.message};
        }

    } catch(err) {
        return {result:false, message:err.message};
    }

};

exports.getConnection = async () => {

    try {
        return await mysql.getConnection();
    } catch(err) {
        return {result:false, message:err.message};
    }

};