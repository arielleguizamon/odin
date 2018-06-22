exports.up = function(knex, Promise) {
    return knex.schema.alterTable('file', function(t) {
        t.boolean('urgent');
    }).catch(function(error) {
        console.log(error);
    });
};

exports.down = function(knex, Promise) {};
