exports.up = function(knex, Promise) {
    return knex.schema.createTable('metric', function(table) {
        table.increments('id');
        table.string('dataset').unique().index();
        table.integer('count');
        table.timestamp('createdAt');
        table.timestamp('updatedAt');
    }).catch(function(error) {
        console.log(error);
    });
};

exports.down = function(knex, Promise) {};
