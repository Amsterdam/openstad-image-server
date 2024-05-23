'use strict';

const { Sequelize } = require('sequelize');

var getAzureAuthToken = require('./azure-auth')

let ssl = {};

if (process.env.MYSQL_CA_CERT) {
  ssl.ca = process.env.MYSQL_CA_CERT;
}

if (process.env.AZURE_CLIENT_ID) {
  ssl.require = true;
}


let sequelize = new Sequelize({
  hooks: {
    beforeConnect: async (config) => {
      if (process.env.AZURE_CLIENT_ID) {
        const azureAuthToken = await getAzureAuthToken()
        config.password = azureAuthToken
      } else {
        config.password = process.env.DB_PASSWORD
      }
    }
  },

  host:     process.env.DB_HOST,
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  port:     process.env.DB_PORT || '3306',

  dialect: process.env.DB_DIALECT || 'mysql',
  dialectOptions: {
    ssl
  },

 	logging: null,
  // logging: console.log,

  define: {
    underscored: true,
  },

  pool: {
    max: process.env.maxPoolSize || 5,
  },

});

let db = {};
db.Sequelize = Sequelize;
db.sequelize = sequelize;

// add models
db.Client = require('./model/client')(db, sequelize, Sequelize);

// invoke associations and scopes
for (let modelName in sequelize.models) {
  let model = sequelize.models[modelName];
  if (model.associate) model.associate();
  let scopes = model.scopes && model.scopes() || {};
  for (let scopeName in scopes) {
		model.addScope(scopeName, scopes[scopeName], {override: true});
  }
  model.prototype.toJSON = function(params) {
    let result = {};
    for (let key in this.dataValues) {
      let target = this.dataValues[key];
      if (target && target.toJSON) {
        result[key] = target.toJSON(params);
      } else {
        result[key] = target;
      }
    }
    return result;
  }
}

module.exports = db;
