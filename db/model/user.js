const db = require("../db_query");

module.exports = {

    /* Register */
    confirmDuplication: async function(userId) {
        try {
            const selectQ = 'select count(*) as count from user where id="'+userId+'";';
            const result = await db.asyncSelect(selectQ);
            if (result.result) {
                console.log(result);
                if (result.message[0].count > 0) {
                    return {result: false, message: "이미 존재하는 ID 입니다."};
                } else {
                    return {result: true, message: "사용 가능한 ID 입니다."};
                }
            } else {
                return result;
            }
        } catch (err) {
            return err;
        }
    },

    register: async function(info, keyName, b_key) {
        try {
            const insert_user_Q = 'insert into user(name, id, password) values ("' + info.name + '", "' + info.id + '", "' + info.pw + '");';
            const insert_user_R = await db.asyncQuery(insert_user_Q);
            console.log(insert_user_R);
            if (insert_user_R.result) {
                const insert_key_Q = 'insert into public_key(user_id, key_name) values (' + insert_user_R.message.insertId + ', "' + keyName + '");';
                const insert_key_R = await db.asyncQuery(insert_key_Q);
                if (insert_key_R.result) {
                    const insert_b_key_Q = 'insert into enc_key(user_id, b_key) values (' + insert_user_R.message.insertId + ', "' + b_key + '");';
                    const insert_b_key_R = await db.asyncQuery(insert_b_key_Q);
                    if (insert_b_key_R.result) {
                        return {result: true, insertId: insert_user_R.message.insertId};
                    } else {
                        return insert_b_key_R;
                    }
                } else {
                    return insert_key_R;
                }
            } else {
                return insert_user_R;
            }
        } catch (err) {
            return err;
        }
    },

    /* Remain */
    login: async function(userId) {
        try {
            const selectQ = 'select * from user where id="'+userId+'" limit 1;';
            return await db.asyncSelect(selectQ);
        } catch(err) {
            return err;
        }
    },

    /**/
    saveBlockInfo: async function(uuid, blockInfo) {
        try {
            const insertQ = 'insert into block_info(user_id, block_num, tx_id) values (' + uuid + ', ' + blockInfo.blockID + ', "' + blockInfo.txID + '");';
            return await db.asyncQuery(insertQ);
        } catch (err) {
            return err;
        }
    },

    updateBlockInfo: async function(uuid, blockInfo) {
        try {
            const insertQ = 'insert into block_info(user_id, block_num, tx_id) values (' + uuid + ', ' + blockInfo.blockID + ', "' + blockInfo.txID + '");';
            return await db.asyncQuery(insertQ);
        } catch (err) {
            return err;
        }
    },

    searchBlockId: async function(type, id) {
        try {
            let selectQ;
            if (type === "uuid") {
                selectQ = 'select a.block_num, a.tx_id, b.b_key from block_info as a inner join enc_key as b on a.user_id=b.user_id and a.user_id='+id+' order by a.create_date DESC limit 1;';
            } else {
                selectQ = 'select b.block_num, b.tx_id, c.b_key from user as a inner join block_info as b on a.user_id=b.user_id and a.id="' + id + '" inner join enc_key as c on a.user_id=c.user_id order by b.create_date DESC limit 1;';
            }
            return await db.asyncSelect(selectQ);
        } catch(err) {
            return err;
        }
    },

    searchPublicKey: async function(uuid) {
        try {
            const selectQ = 'select key_name from public_key where user_id='+uuid+' order by public_key_id DESC limit 1;';
            return await db.asyncSelect(selectQ);
        } catch(err) {
            return err;
        }
    },

    searchBlockKey: async function(userId) {
        try {
            const selectQ = 'select c.b_key from user as a inner join block_info as b on a.user_id=b.user_id and a.id="' + userId + '" inner join enc_key as c on a.user_id=c.user_id order by b.create_date DESC limit 1;';
            return await db.asyncSelect(selectQ);
        } catch(err) {
            return err;
        }
    },

    updatePublicKey: async function(uuid, keyName) {
        try {
            const updateQ = 'update public_key set key_name="' + keyName + '" where uuid=' + uuid + ';';
            return await db.asyncQuery(updateQ);
        } catch (err) {
            return err;
        }
    }

};