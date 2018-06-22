exports.up = function(knex, Promise) {
    return Promise.all([knex.schema.createTable('datasetrequest', function(table) {
            table.string('id').notNullable().primary();
            table.string('about');
            table.string('description');
            table.string('email');
            table.timestamp('createdAt');
            table.timestamp('updatedAt');
        }),
        knex.schema.createTable('category_requests__datasetrequest_categories', function(t) {
            t.increments();
            t.text('category_requests');
            t.text('datasetrequest_categories')
        })
    ]).catch(function(error) {
        console.log(error);
    });
};

exports.down = function(knex, Promise) {

};
