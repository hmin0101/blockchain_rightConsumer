const db = require("../db_query");

module.exports = {

    list: async function() {
        try {
            const selectQ = 'select * from agreement;';
            return await db.asyncSelect(selectQ);
        } catch (err) {
            return err;
        }
    },

};